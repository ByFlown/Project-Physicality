import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LineChart } from '../components/charts';
import { toast } from '../components/toast-store';
import { Button, Card, CardTitle, EmptyState, Field, Input, NumberInput, PageHeader } from '../components/ui';
import { navyBodyFat } from '../domain/bodycomp';
import { compareDates, formatDate } from '../domain/dates';
import { MEASURE_LABELS, MEASURE_SITES, measurementSchema, type MeasureSite, type MeasurementValues } from '../domain/schema';
import { uid } from '../lib/id';
import { cmToDisplay, displayToCm, kgToDisplay, lengthUnit, round, weightUnit } from '../lib/units';
import { useBodyStats, useData, useToday } from '../store/hooks';
import { useAppStore } from '../store/store';

export default function MeasurementsPage() {
  const data = useData();
  const today = useToday();
  const body = useBodyStats();
  const saveMeasurement = useAppStore((s) => s.saveMeasurement);
  const deleteMeasurement = useAppStore((s) => s.deleteMeasurement);
  const units = data.settings.units;
  const profile = data.profile;

  const [date, setDate] = useState(today);
  const [values, setValues] = useState<MeasurementValues>({});
  const [bodyFat, setBodyFat] = useState<number | undefined>();

  const sorted = useMemo(() => [...data.measurements].sort((a, b) => compareDates(b.date, a.date)), [data.measurements]);

  const seriesBySite = useMemo(() => {
    const out = {} as Record<MeasureSite, { date: string; value: number }[]>;
    if (!profile) return out;
    for (const site of MEASURE_SITES) {
      const pts = [
        ...(profile.startMeasurements[site] !== undefined ? [{ date: profile.startDate, value: profile.startMeasurements[site]! }] : []),
        ...[...data.measurements]
          .sort((a, b) => compareDates(a.date, b.date))
          .filter((m) => m.values[site] !== undefined)
          .map((m) => ({ date: m.date, value: m.values[site]! })),
      ].map((p) => ({ ...p, value: cmToDisplay(p.value, units) }));
      out[site] = pts;
    }
    return out;
  }, [data.measurements, profile, units]);

  if (!profile || !body) return null;

  const merged = { ...body.latestMeasurements, ...values };
  const navy = navyBodyFat(profile.sex, profile.heightCm, merged);

  const save = () => {
    const parsed = measurementSchema.safeParse({ id: uid(), date, values, bodyFatPct: bodyFat });
    if (!parsed.success || (Object.keys(values).length === 0 && bodyFat === undefined)) {
      toast({ title: 'Enter at least one measurement', tone: 'warn' });
      return;
    }
    saveMeasurement(parsed.data);
    setValues({});
    setBodyFat(undefined);
    toast({ title: 'Measurements saved', tone: 'success' });
  };

  const charted = MEASURE_SITES.filter((s) => seriesBySite[s]?.length >= 2);
  const comp = body.composition;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Measurements"
        subtitle="Tape measurements every 1–2 weeks, same time of day. Neck + waist (+ hips) give a body-fat estimate."
      />

      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label="Date" htmlFor="m-date">
            <Input id="m-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Body fat % (optional)" htmlFor="m-bf" hint={navy !== undefined ? `Navy estimate from tape: ${navy}%` : 'From a scan or calipers, if you have one'}>
            <NumberInput id="m-bf" unit="%" value={bodyFat} onChange={setBodyFat} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {MEASURE_SITES.map((site) => (
            <Field key={site} label={MEASURE_LABELS[site]} htmlFor={`m-${site}`}>
              <NumberInput
                id={`m-${site}`}
                unit={lengthUnit(units)}
                value={values[site] !== undefined ? round(cmToDisplay(values[site]!, units), 1) : undefined}
                placeholder={body.latestMeasurements[site] !== undefined ? String(round(cmToDisplay(body.latestMeasurements[site]!, units), 1)) : undefined}
                onChange={(v) =>
                  setValues((prev) => {
                    const next = { ...prev };
                    if (v === undefined) delete next[site];
                    else next[site] = displayToCm(v, units);
                    return next;
                  })
                }
              />
            </Field>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={save}>
            <Plus size={16} /> Save measurements
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Body fat %</CardTitle>
          <LineChart
            label="Body fat percentage"
            points={comp.map((c) => ({ date: c.date, value: c.bodyFatPct }))}
            format={(v) => `${round(v, 1)}%`}
            area={false}
          />
          <p className="mt-1 text-xs text-muted">Source of latest value: {comp[comp.length - 1].bodyFatSource}.</p>
        </Card>
        <Card>
          <CardTitle>Lean mass ({weightUnit(units)})</CardTitle>
          <LineChart
            label="Lean body mass"
            points={comp.map((c) => ({ date: c.date, value: kgToDisplay(c.leanKg, units) }))}
            format={(v) => `${round(v, 1)}`}
            area={false}
          />
          <p className="mt-1 text-xs text-muted">
            FFMI {round(body.current.ffmi, 1)} — derived from weight and body fat, so it inherits their error.
          </p>
        </Card>
      </div>

      {charted.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {charted.map((site) => (
            <Card key={site}>
              <CardTitle>
                {MEASURE_LABELS[site]} ({lengthUnit(units)})
              </CardTitle>
              <LineChart label={`${MEASURE_LABELS[site]} circumference`} points={seriesBySite[site]} height={150} area={false} format={(v) => `${round(v, 1)}`} />
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardTitle>Entries</CardTitle>
        {sorted.length === 0 ? (
          <EmptyState title="No measurements yet">Your onboarding values are the baseline.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{formatDate(m.date, { dateStyle: 'medium' })}</div>
                  <div className="text-xs text-muted">
                    {(Object.entries(m.values) as [MeasureSite, number][])
                      .map(([k, v]) => `${MEASURE_LABELS[k].split(' ')[0]} ${round(cmToDisplay(v, units), 1)}`)
                      .join(' · ')}
                    {m.bodyFatPct !== undefined && ` · BF ${m.bodyFatPct}%`}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete measurement from ${formatDate(m.date)}`}
                  onClick={() => {
                    if (window.confirm('Delete this entry?')) deleteMeasurement(m.id);
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
