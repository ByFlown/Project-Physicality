import {
  AlertTriangle,
  ClipboardList,
  Dumbbell,
  Flame,
  Moon,
  ScanLine,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BodyPanel } from '../components/BodyPanel';
import { EventFeed } from '../components/EventFeed';
import { LevelRing } from '../components/LevelRing';
import { MuscleList } from '../components/MuscleList';
import { Button, Card, CardTitle, ProgressBar, Stat } from '../components/ui';
import { formatDate } from '../domain/dates';
import { daysUntilLevelLoss } from '../domain/engine';
import { MUSCLE_IDS, MUSCLES } from '../domain/muscles';
import { tierColor } from '../lib/colors';
import { formatNumber, round } from '../lib/units';
import { useBodyStats, useData, useExerciseIndex, useSimulation, useToday } from '../store/hooks';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const sim = useSimulation();
  const body = useBodyStats();
  const data = useData();
  const today = useToday();
  const exercises = useExerciseIndex();

  const warnings = useMemo(() => {
    if (!sim) return [];
    return MUSCLE_IDS.map((id) => sim.muscles[id])
      .filter((m) => m.status === 'decaying' || m.daysUntilDecay <= 3)
      .sort((a, b) => a.daysUntilDecay - b.daysUntilDecay)
      .map((m) => ({ ...m, levelLossIn: daysUntilLevelLoss(m) }));
  }, [sim]);

  if (!sim || !body || !data.profile) return null;
  const { overall, stats, recovery } = sim;
  const checkedInToday = data.checkIns.some((c) => c.date === today);
  const trainedToday = data.workouts.some((w) => w.date === today);
  const color = tierColor(overall.level);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting()}, {data.profile.name}
          </h1>
        </div>
        <div className="flex gap-2">
          {!checkedInToday && (
            <Link to="/check-in">
              <Button variant="secondary">
                <ClipboardList size={16} /> Check-in
              </Button>
            </Link>
          )}
          <Link to="/workout/new">
            <Button>
              <Dumbbell size={16} /> {trainedToday ? 'Log another' : 'Log workout'}
            </Button>
          </Link>
        </div>
      </header>

      {data.scans.length === 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-accent/40">
          <div className="flex items-start gap-3">
            <ScanLine size={22} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="font-semibold">Scan your body for the precise model</p>
              <p className="text-sm text-muted">
                Two photos give your 3D model your real proportions and calibrate your muscles. Processed on this
                device.
              </p>
            </div>
          </div>
          <Link to="/scan">
            <Button>Start scan</Button>
          </Link>
        </Card>
      )}

      <Card className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <LevelRing level={overall.level} progress={overall.progress} size={112} label="Level" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-xl font-bold" style={{ color }}>
              {overall.tier.name}
            </h2>
            <span className="num text-sm text-muted">
              {formatNumber(overall.xpIntoLevel)} / {formatNumber(overall.levelCost)} XP to level {overall.level + 1}
            </span>
          </div>
          <ProgressBar value={overall.progress} color={color} className="mt-2 h-2.5" label="Overall level progress" />
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="This week"
              value={
                <span className={overall.weeklyXpDelta >= 0 ? 'text-good' : 'text-bad'}>
                  {overall.weeklyXpDelta >= 0 ? '+' : ''}
                  {formatNumber(overall.weeklyXpDelta)} XP
                </span>
              }
            />
            <Stat
              label="Streak"
              value={
                <span className="inline-flex items-center gap-1">
                  <Flame size={18} className="text-accent" /> {stats.currentStreak}d
                </span>
              }
              sub={`best ${stats.bestStreak}d`}
            />
            <Stat label="Workouts" value={stats.workouts} sub={`${formatNumber(stats.hardSets)} sets`} />
            <Stat
              label="Recovery bonus"
              value={
                <span className={recovery.multiplier >= 1 ? 'text-good' : 'text-bad'}>
                  ×{round(recovery.multiplier, 2)}
                </span>
              }
              sub={
                recovery.sleepHours !== undefined || recovery.proteinPerKg !== undefined
                  ? [
                      recovery.sleepHours !== undefined && `${round(recovery.sleepHours, 1)}h sleep`,
                      recovery.proteinPerKg !== undefined && `${round(recovery.proteinPerKg, 1)} g/kg`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'log sleep & protein'
              }
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-5 lg:self-start">
          <BodyPanel
            sim={sim}
            shape={{
              sex: data.profile.sex,
              heightCm: data.profile.heightCm,
              weightKg: body.current.weightKg,
              bodyFatPct: body.current.bodyFatPct,
            }}
            header={<h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Your body</h2>}
          />
        </Card>

        <div className="flex flex-col gap-5">
          {warnings.length > 0 && (
            <Card className="border-warn/40">
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle size={16} className="text-warn" /> Needs attention
                </span>
              </CardTitle>
              <ul className="flex flex-col gap-2 text-sm">
                {warnings.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <Link to={`/muscles/${m.id}`} className="font-medium hover:text-accent">
                      {MUSCLES[m.id].name}
                    </Link>
                    <span className="text-right text-xs text-muted">
                      {m.status === 'decaying'
                        ? `Decaying${m.levelLossIn ? ` · level ${m.info.level - 1} in ${m.levelLossIn}d` : ''}`
                        : `Decay starts in ${m.daysUntilDecay}d`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardTitle>Muscles</CardTitle>
            <MuscleList sim={sim} sort="region" />
          </Card>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle>Recent activity</CardTitle>
          <EventFeed events={sim.events} exercises={exercises} units={data.settings.units} />
        </Card>
        <Card>
          <CardTitle>Coach notes</CardTitle>
          <CoachNotes />
        </Card>
      </div>
    </div>
  );
}

function CoachNotes() {
  const sim = useSimulation();
  if (!sim) return null;
  const notes: { icon: ReactNode; text: string }[] = [];
  const muscles = MUSCLE_IDS.map((id) => sim.muscles[id]);
  const lowest = [...muscles].sort((a, b) => a.xp - b.xp)[0];
  const highest = [...muscles].sort((a, b) => b.xp - a.xp)[0];
  const growing = muscles.filter((m) => m.status === 'growing').length;

  if (sim.stats.workouts === 0) {
    notes.push({
      icon: <Sparkles size={16} className="text-accent" />,
      text: 'Log your first workout to start earning XP. Every hard set counts.',
    });
  }
  notes.push({
    icon: <TrendingUp size={16} className="text-good" />,
    text: `${growing} of ${muscles.length} muscles got a growth dose (≥6 hard sets) in the last 7 days.`,
  });
  if (highest.info.level - lowest.info.level >= 4) {
    notes.push({
      icon: <TrendingDown size={16} className="text-warn" />,
      text: `${MUSCLES[lowest.id].name} (L${lowest.info.level}) lags ${MUSCLES[highest.id].name} (L${highest.info.level}). Prioritise it early in sessions.`,
    });
  }
  const pushPull =
    (sim.muscles.chest.weeklySets + sim.muscles.frontDelts.weeklySets) /
    Math.max(1, sim.muscles.lats.weeklySets + sim.muscles.upperBack.weeklySets);
  if (sim.stats.workouts > 0 && pushPull > 1.5) {
    notes.push({
      icon: <TrendingDown size={16} className="text-warn" />,
      text: 'Pushing volume is well above pulling this week — add rows or pull-ups for balance.',
    });
  }
  if (sim.recovery.sleepHours === undefined && sim.recovery.proteinPerKg === undefined) {
    notes.push({
      icon: <Moon size={16} className="text-info" />,
      text: 'Log sleep and protein in your check-in to unlock up to +15% XP.',
    });
  }
  const memory = muscles.reduce((s, m) => s + m.memoryXp, 0);
  if (memory > 50) {
    notes.push({
      icon: <Sparkles size={16} className="text-accent" />,
      text: `${formatNumber(memory)} XP banked as muscle memory — lost levels come back at double speed.`,
    });
  }
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {notes.map((n, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">{n.icon}</span>
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}
