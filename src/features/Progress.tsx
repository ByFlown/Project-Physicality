import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { LineChart, VolumeBars } from '../components/charts';
import { Card, CardTitle, PageHeader, Segmented, Stat } from '../components/ui';
import { addDays, compareDates, type LocalDate } from '../domain/dates';
import { movingAverage } from '../lib/series';
import { ENGINE } from '../domain/engine';
import { fractionalLevel, levelFromXp } from '../domain/leveling';
import { MUSCLE_IDS, MUSCLES } from '../domain/muscles';
import { levelColor } from '../lib/colors';
import { formatNumber, kgToDisplay, round, weightUnit } from '../lib/units';
import { useBodyStats, useData, useSimulation, useToday } from '../store/hooks';

type Range = '30' | '90' | '365' | 'all';

export default function ProgressPage() {
  const sim = useSimulation();
  const body = useBodyStats();
  const data = useData();
  const today = useToday();
  const [range, setRange] = useState<Range>('90');
  const units = data.settings.units;

  const from = range === 'all' ? '0000-01-01' : addDays(today, -Number(range));
  const inRange = <T extends { date: LocalDate }>(arr: T[]) => arr.filter((p) => compareDates(p.date, from) >= 0);

  const levelSeries = useMemo(() => {
    if (!sim) return [];
    return sim.timeline.dates.map((date, i) => ({ date, value: fractionalLevel(sim.timeline.overallXp[i]) }));
  }, [sim]);

  const weight = useMemo(() => {
    if (!body) return { raw: [], avg: [] };
    const raw = body.weightSeries.map((p) => ({ date: p.date, value: kgToDisplay(p.kg, units) }));
    return { raw, avg: movingAverage(raw, 7) };
  }, [body, units]);

  if (!sim || !body) return null;

  const levelPts = inRange(levelSeries);
  const startIdx = Math.max(0, sim.timeline.dates.length - (range === 'all' ? sim.timeline.dates.length : Number(range)) - 1);
  const levelDelta = levelPts.length ? levelPts[levelPts.length - 1].value - levelPts[0].value : 0;
  const weightPts = inRange(weight.avg);
  const weightDelta = weightPts.length > 1 ? weightPts[weightPts.length - 1].value - weightPts[0].value : 0;
  const comp = body.composition;
  const leanDelta = comp.length > 1 ? comp[comp.length - 1].leanKg - comp[0].leanKg : 0;

  const muscleRows = MUSCLE_IDS.map((id) => {
    const series = sim.timeline.muscleXp[id];
    const then = levelFromXp(series[startIdx] ?? sim.baseline.muscleXp[id]).level;
    return { id, now: sim.muscles[id].info.level, then, xp: sim.muscles[id].xp };
  }).sort((a, b) => b.now - b.then - (a.now - a.then) || b.xp - a.xp);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Progress" subtitle="How your physique level, body weight and training volume evolve." />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
            { value: '365', label: '1 year' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Level change" value={`${levelDelta >= 0 ? '+' : ''}${round(levelDelta, 2)}`} sub={`now L${sim.overall.level}`} />
        <Stat label="Workouts (all time)" value={sim.stats.workouts} sub={`${formatNumber(sim.stats.hardSets)} sets`} />
        <Stat
          label="Weight change (7-day avg)"
          value={`${weightDelta >= 0 ? '+' : ''}${round(weightDelta, 1)} ${weightUnit(units)}`}
        />
        <Stat
          label="Lean mass change"
          value={`${leanDelta >= 0 ? '+' : ''}${round(kgToDisplay(leanDelta, units), 1)} ${weightUnit(units)}`}
          sub={comp.length > 1 ? `FFMI ${round(comp[comp.length - 1].ffmi, 1)}` : 'needs measurements'}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Physique level</CardTitle>
          <LineChart label="Overall physique level over time" points={levelPts} format={(v) => round(v, 1).toString()} />
        </Card>
        <Card>
          <CardTitle>Body weight · 7-day average</CardTitle>
          <LineChart
            label={`Body weight, 7-day average (${weightUnit(units)})`}
            points={weightPts}
            dots={inRange(weight.raw)}
            area={false}
            format={(v) => `${round(v, 1)}`}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Effective sets · last 7 days</CardTitle>
          <VolumeBars
            max={24}
            refs={[
              { value: ENGINE.maintenanceSets, label: 'maintain' },
              { value: ENGINE.growthSets, label: 'grow' },
              { value: 20, label: 'max useful' },
            ]}
            rows={MUSCLE_IDS.map((id) => ({ key: id, label: MUSCLES[id].name, value: sim.muscles[id].weeklySets }))}
          />
        </Card>
        <Card>
          <CardTitle>Level changes in range</CardTitle>
          <ul className="flex flex-col">
            {muscleRows.map((r) => {
              const delta = r.now - r.then;
              return (
                <li key={r.id}>
                  <Link to={`/muscles/${r.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: levelColor(fractionalLevel(r.xp)) }} />
                      {MUSCLES[r.id].name}
                    </span>
                    <span className="num text-xs">
                      <span className="text-muted">L{r.then} → </span>
                      <span className="font-semibold">L{r.now}</span>
                      <span className={delta > 0 ? 'ml-2 text-good' : delta < 0 ? 'ml-2 text-bad' : 'ml-2 text-muted'}>
                        {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–'}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
