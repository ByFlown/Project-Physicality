import { Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from '../components/toast-store';
import { Button, Card, CardTitle, Field, NumberInput, PageHeader, Segmented } from '../components/ui';
import { addDays, compareDates, formatDate } from '../domain/dates';
import { checkInSchema, type CheckIn } from '../domain/schema';
import { displayToKg, formatWeight, kgToDisplay, round, weightUnit } from '../lib/units';
import { useBodyStats, useData, useToday } from '../store/hooks';
import { useAppStore } from '../store/store';

const ENERGY = ['Drained', 'Low', 'Okay', 'Good', 'Great'];

export default function CheckInPage() {
  const data = useData();
  const today = useToday();
  const body = useBodyStats();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') && params.get('date')! <= today ? params.get('date')! : today;
  const existing = data.checkIns.find((c) => c.date === date);
  const saveCheckIn = useAppStore((s) => s.saveCheckIn);
  const deleteCheckIn = useAppStore((s) => s.deleteCheckIn);
  const units = data.settings.units;

  const [draftState, setDraftState] = useState<{ key: string; value: CheckIn }>({ key: '', value: { date } });
  // Reset the form whenever the selected day (or its saved entry) changes.
  const formKey = `${date}:${existing ? JSON.stringify(existing) : ''}`;
  const draft = draftState.key === formKey ? draftState.value : (existing ?? { date });
  const setDraft = (fn: (d: CheckIn) => CheckIn) => setDraftState({ key: formKey, value: fn(draft) });

  const weight = draft.weightKg ?? body?.current.weightKg ?? data.profile?.startWeightKg ?? 75;
  const proteinTarget = Math.round(weight * 1.6);

  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  const save = () => {
    const parsed = checkInSchema.safeParse({ ...draft, date, notes: draft.notes?.trim() || undefined });
    if (!parsed.success) {
      toast({ title: 'Check the values', body: parsed.error.issues[0]?.message, tone: 'warn' });
      return;
    }
    saveCheckIn(parsed.data);
    toast({
      title: 'Check-in saved',
      body: date === today ? 'Nice — consistency is the whole game.' : formatDate(date),
      tone: 'success',
    });
  };

  const recent = [...data.checkIns].sort((a, b) => compareDates(b.date, a.date)).slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Daily check-in"
        subtitle="Weight, sleep and protein feed your recovery multiplier (up to +15% XP)."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft size={18} />
            </Button>
            <div className="text-center">
              <div className="font-semibold">{date === today ? 'Today' : formatDate(date, { weekday: 'long' })}</div>
              <div className="text-xs text-muted">{formatDate(date, { dateStyle: 'medium' })}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Next day"
              disabled={date >= today}
              onClick={() => setDate(addDays(date, 1))}
            >
              <ChevronRight size={18} />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Body weight" htmlFor="ci-weight" hint="Morning, after the bathroom.">
              <NumberInput
                id="ci-weight"
                unit={weightUnit(units)}
                value={draft.weightKg !== undefined ? round(kgToDisplay(draft.weightKg, units), 1) : undefined}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, weightKg: v === undefined ? undefined : displayToKg(v, units) }))
                }
                placeholder={body ? String(round(kgToDisplay(body.current.weightKg, units), 1)) : undefined}
              />
            </Field>
            <Field label="Sleep" htmlFor="ci-sleep" hint="≥7 h: +5% XP · <6 h: −5%">
              <NumberInput
                id="ci-sleep"
                unit="h"
                step={0.5}
                value={draft.sleepHours}
                onChange={(v) => setDraft((d) => ({ ...d, sleepHours: v }))}
              />
            </Field>
            <Field label="Protein" htmlFor="ci-protein" hint={`Target ≈ ${proteinTarget} g (1.6 g/kg)`}>
              <NumberInput
                id="ci-protein"
                unit="g"
                step={1}
                value={draft.proteinG}
                onChange={(v) => setDraft((d) => ({ ...d, proteinG: v }))}
              />
            </Field>
          </div>

          <Field label="Energy">
            <div className="overflow-x-auto">
              <Segmented<string>
                ariaLabel="Energy"
                size="sm"
                value={String(draft.energy ?? '')}
                onChange={(v) => setDraft((d) => ({ ...d, energy: Number(v) }))}
                options={ENERGY.map((label, i) => ({ value: String(i + 1), label }))}
              />
            </div>
          </Field>

          <Field label="Notes" htmlFor="ci-notes">
            <textarea
              id="ci-notes"
              maxLength={500}
              rows={3}
              value={draft.notes ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="w-full rounded-xl border border-border bg-surface-2 p-3 text-sm focus:border-accent focus:outline-none"
              placeholder="Soreness, stress, anything notable…"
            />
          </Field>

          <div className="flex justify-between gap-2">
            {existing ? (
              <Button
                variant="danger"
                onClick={() => {
                  deleteCheckIn(date);
                  toast({ title: 'Check-in removed' });
                }}
              >
                <Trash2 size={16} /> Remove
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={save}>
              <Check size={16} /> Save check-in
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Recent</CardTitle>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">No check-ins yet.</p>
          ) : (
            <ul className="flex flex-col">
              {recent.map((c) => (
                <li key={c.date}>
                  <button
                    type="button"
                    onClick={() => setDate(c.date)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <span className={c.date === date ? 'font-semibold text-accent' : ''}>
                      {formatDate(c.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="num text-xs text-muted">
                      {[
                        c.weightKg !== undefined && formatWeight(c.weightKg, units),
                        c.sleepHours !== undefined && `${c.sleepHours}h`,
                        c.proteinG !== undefined && `${c.proteinG}g`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
