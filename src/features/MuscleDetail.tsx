import { ArrowLeft, Dumbbell } from 'lucide-react';
import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { BodyPanel } from '../components/BodyPanel';
import { LineChart } from '../components/charts';
import { LevelRing } from '../components/LevelRing';
import { StatusBadge } from '../components/MuscleList';
import { Button, Card, CardTitle, ProgressBar, Stat } from '../components/ui';
import { formatDate } from '../domain/dates';
import { daysUntilLevelLoss, ENGINE } from '../domain/engine';
import { fractionalLevel } from '../domain/leveling';
import { isMuscleId, MUSCLES, REGION_LABELS } from '../domain/muscles';
import { levelColor, STATUS_META } from '../lib/colors';
import { formatNumber, formatWeight, round } from '../lib/units';
import { useBodyStats, useData, useExerciseIndex, useSimulation } from '../store/hooks';

export default function MuscleDetail() {
  const { id = '' } = useParams();
  const sim = useSimulation();
  const body = useBodyStats();
  const data = useData();
  const exercises = useExerciseIndex();
  const navigate = useNavigate();

  const series = useMemo(() => {
    if (!sim || !isMuscleId(id)) return [];
    const xs = sim.timeline.muscleXp[id];
    return sim.timeline.dates.slice(-120).map((date, i, arr) => ({
      date,
      value: fractionalLevel(xs[xs.length - arr.length + i]),
    }));
  }, [sim, id]);

  if (!isMuscleId(id)) return <Navigate to="/" replace />;
  if (!sim || !body || !data.profile) return null;

  const m = sim.muscles[id];
  const info = MUSCLES[id];
  const color = levelColor(fractionalLevel(m.xp));
  const lossIn = daysUntilLevelLoss(m);

  const best = [...exercises.values()]
    .filter((e) => (e.muscles[id] ?? 0) >= 0.75)
    .sort((a, b) => (b.muscles[id] ?? 0) - (a.muscles[id] ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 8);

  const yourLifts = Object.values(sim.records)
    .filter((r) => (exercises.get(r.exerciseId)?.muscles[id] ?? 0) >= 0.5)
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, 6);

  const decayText =
    m.status === 'decaying'
      ? `Decaying for ${m.decayDays} day${m.decayDays === 1 ? '' : 's'}`
      : `Decay starts in ${m.daysUntilDecay} day${m.daysUntilDecay === 1 ? '' : 's'} without training`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button variant="ghost" size="sm" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <ArrowLeft size={16} /> Back
        </Button>
      </div>

      <Card className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <LevelRing level={m.info.level} progress={m.info.progress} size={112} label="Level" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">{REGION_LABELS[info.region]}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{info.name}</h1>
          <p className="text-sm text-muted">{info.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold" style={{ color }}>
              {m.tier.name}
            </span>
            <StatusBadge status={m.status} />
            <span className="text-xs text-muted">{STATUS_META[m.status].hint}</span>
          </div>
          <ProgressBar value={m.info.progress} color={color} className="mt-3 h-2.5" label="Level progress" />
          <p className="num mt-1 text-xs text-muted">
            {formatNumber(m.info.xpIntoLevel)} / {formatNumber(m.info.levelCost)} XP · total {formatNumber(m.xp)} XP
          </p>
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Sets this week"
          value={round(m.weeklySets, 1)}
          sub={`maintain ${ENGINE.maintenanceSets} · grow ${ENGINE.growthSets}+`}
        />
        <Stat
          label="This week"
          value={
            <span className={m.weeklyXpDelta >= 0 ? 'text-good' : 'text-bad'}>
              {m.weeklyXpDelta >= 0 ? '+' : ''}
              {formatNumber(m.weeklyXpDelta)} XP
            </span>
          }
        />
        <Stat
          label="Last trained"
          value={m.lastTrainedDate ? formatDate(m.lastTrainedDate) : '—'}
          sub={decayText}
        />
        <Stat
          label="Muscle memory"
          value={`${formatNumber(m.memoryXp)} XP`}
          sub={lossIn ? `L${m.info.level - 1} in ${lossIn}d if untrained` : 'regained at 2× speed'}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Level · last 120 days</CardTitle>
          <LineChart label={`${info.name} level over time`} points={series} color={color} format={(v) => round(v, 1).toString()} />
        </Card>
        <Card>
          <BodyPanel
            sim={sim}
            selected={id}
            onSelect={(next) => navigate(`/muscles/${next}`, { replace: true })}
            shape={{ sex: data.profile.sex, heightCm: data.profile.heightCm, weightKg: body.current.weightKg, bodyFatPct: body.current.bodyFatPct }}
            header={<h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Location</h2>}
          />
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle>Best exercises</CardTitle>
          <ul className="flex flex-col gap-1 text-sm">
            {best.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Dumbbell size={14} className="text-muted" />
                  {e.name}
                </span>
                <span className="text-xs text-muted">{(e.muscles[id] ?? 0) >= 1 ? 'primary' : 'strong secondary'}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Your strongest lifts for {info.name.toLowerCase()}</CardTitle>
          {yourLifts.length === 0 ? (
            <p className="text-sm text-muted">
              No lifts logged yet. <Link to="/workout/new" className="text-accent underline">Log a workout</Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {yourLifts.map((r) => (
                <li key={r.exerciseId} className="flex items-center justify-between gap-2">
                  <span>{exercises.get(r.exerciseId)?.name ?? r.exerciseId}</span>
                  <span className="num text-xs text-muted">
                    est. 1RM <span className="font-semibold text-fg">{formatWeight(r.e1rm, data.settings.units)}</span> · {formatDate(r.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
