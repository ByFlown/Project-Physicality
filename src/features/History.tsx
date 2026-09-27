import { ChevronRight, Dumbbell, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Button, Card, CardTitle, EmptyState, PageHeader } from '../components/ui';
import { cx } from '../lib/cx';
import { addDays, compareDates, dayIndex, formatDate } from '../domain/dates';
import { effectiveSetsByMuscle } from '../domain/stimulus';
import { MUSCLES, type MuscleId } from '../domain/muscles';
import type { Exercise } from '../domain/exercises';
import type { Workout } from '../domain/schema';
import { useData, useExerciseIndex, useToday } from '../store/hooks';

function topMuscles(w: Workout, exercises: Map<string, Exercise>): string {
  const entries = w.exercises
    .map((e) => ({ exercise: exercises.get(e.exerciseId), sets: e.sets }))
    .filter((e): e is { exercise: Exercise; sets: Workout['exercises'][number]['sets'] } => !!e.exercise);
  return (Object.entries(effectiveSetsByMuscle(entries)) as [MuscleId, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => MUSCLES[id].name)
    .join(', ');
}

function ActivityGrid({ workouts, checkIns, today }: { workouts: Set<string>; checkIns: Set<string>; today: string }) {
  const weeks = 16;
  // Align columns to weeks ending on today's weekday.
  const start = addDays(today, -(weeks * 7 - 1));
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <div>
      <div
        className="grid grid-flow-col gap-[3px] overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${weeks}, 14px)`, gridTemplateRows: 'repeat(7, 14px)' }}
      >
        {days.map((d) => {
          const trained = workouts.has(d);
          const logged = checkIns.has(d);
          return (
            <div
              key={d}
              title={`${formatDate(d, { dateStyle: 'medium' })}${trained ? ' · workout' : ''}${logged ? ' · check-in' : ''}`}
              className={cx('rounded-[3px]', trained ? 'bg-accent' : logged ? 'bg-accent/35' : 'bg-surface-2')}
            />
          );
        })}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" /> Workout
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent/35" /> Check-in only
        </span>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const data = useData();
  const today = useToday();
  const exercises = useExerciseIndex();

  const grouped = useMemo(() => {
    const sorted = [...data.workouts].sort(
      (a, b) => compareDates(b.date, a.date) || dayIndex(b.date) - dayIndex(a.date),
    );
    const groups = new Map<string, Workout[]>();
    for (const w of sorted) {
      const key = w.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), w]);
    }
    return [...groups.entries()];
  }, [data.workouts]);

  const workoutDays = useMemo(() => new Set(data.workouts.map((w) => w.date)), [data.workouts]);
  const checkInDays = useMemo(() => new Set(data.checkIns.map((c) => c.date)), [data.checkIns]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="History"
        subtitle={`${data.workouts.length} workouts logged`}
        action={
          <Link to="/workout/new">
            <Button>
              <Plus size={16} /> Log workout
            </Button>
          </Link>
        }
      />
      <Card>
        <CardTitle>Last 16 weeks</CardTitle>
        <ActivityGrid workouts={workoutDays} checkIns={checkInDays} today={today} />
      </Card>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState icon={<Dumbbell size={32} />} title="No workouts yet">
            Log your first session and watch your muscles level up.
          </EmptyState>
        </Card>
      ) : (
        grouped.map(([month, workouts]) => (
          <section key={month}>
            <h2 className="mb-2 px-1 text-sm font-semibold text-muted">
              {formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}
            </h2>
            <Card className="p-1 sm:p-2">
              <ul className="divide-y divide-border">
                {workouts.map((w) => {
                  const sets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.warmup).length, 0);
                  return (
                    <li key={w.id}>
                      <Link
                        to={`/workout/${w.id}`}
                        className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2"
                      >
                        <div className="flex w-12 shrink-0 flex-col items-center">
                          <span className="text-[11px] text-muted uppercase">
                            {formatDate(w.date, { weekday: 'short' })}
                          </span>
                          <span className="num text-lg leading-tight font-bold">{Number(w.date.slice(8))}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{w.title || `${w.exercises.length} exercises`}</div>
                          <div className="truncate text-xs text-muted">
                            {sets} sets{w.durationMin ? ` · ${w.durationMin} min` : ''} · {topMuscles(w, exercises)}
                          </div>
                        </div>
                        <ChevronRight size={18} className="shrink-0 text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
