import { Copy, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from '../../components/toast-store';
import { Button, Card, CardTitle, Field, Input, NumberInput, PageHeader } from '../../components/ui';
import { cx } from '../../lib/cx';
import { compareDates, formatDate } from '../../domain/dates';
import { describeEventShort } from '../../lib/events';
import { MUSCLES, type MuscleId } from '../../domain/muscles';
import { previewWorkout } from '../../domain/preview';
import { workoutSchema, type ExerciseEntry, type Workout, type WorkoutSet } from '../../domain/schema';
import { uid } from '../../lib/id';
import { displayToKg, formatWeight, kgToDisplay, round, weightUnit } from '../../lib/units';
import { levelColor } from '../../lib/colors';
import { useData, useExerciseIndex, useSimulation, useToday } from '../../store/hooks';
import { fractionalLevel } from '../../domain/leveling';
import { useAppStore } from '../../store/store';
import { ExercisePicker } from './ExercisePicker';
import { musclesSummary } from '../../domain/exercises';

const DRAFT_KEY = 'physicality:workout-draft';

function loadDraft(): Workout | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = workoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveDraft(w: Workout | null) {
  try {
    if (w && w.exercises.length > 0) localStorage.setItem(DRAFT_KEY, JSON.stringify(w));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable — drafts are a convenience only.
  }
}

const newSet = (prev?: WorkoutSet): WorkoutSet => ({
  id: uid(),
  reps: prev?.reps ?? 10,
  weightKg: prev?.weightKg ?? 0,
  rir: prev?.rir ?? 2,
});

export default function WorkoutEditor() {
  const { id } = useParams();
  const data = useData();
  const today = useToday();
  const exercises = useExerciseIndex();
  const sim = useSimulation();
  const saveWorkout = useAppStore((s) => s.saveWorkout);
  const deleteWorkout = useAppStore((s) => s.deleteWorkout);
  const navigate = useNavigate();
  const units = data.settings.units;

  const existing = id ? data.workouts.find((w) => w.id === id) : undefined;
  const isNew = !id;

  const [workout, setWorkout] = useState<Workout>(
    () => existing ?? (isNew ? loadDraft() : null) ?? { id: uid(), date: today, exercises: [] },
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (isNew) saveDraft(workout);
  }, [workout, isNew]);

  const sortedHistory = useMemo(
    () => [...data.workouts].filter((w) => w.id !== workout.id).sort((a, b) => compareDates(b.date, a.date)),
    [data.workouts, workout.id],
  );

  const recentExerciseIds = useMemo(() => {
    const ids: string[] = [];
    for (const w of sortedHistory) for (const e of w.exercises) if (!ids.includes(e.exerciseId)) ids.push(e.exerciseId);
    return ids.slice(0, 12);
  }, [sortedHistory]);

  const lastPerformance = (exerciseId: string) => {
    for (const w of sortedHistory) {
      if (w.date > workout.date) continue;
      const entry = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (entry) return { date: w.date, sets: entry.sets.filter((s) => !s.warmup) };
    }
    return null;
  };

  const preview = useMemo(
    () => (workout.exercises.length > 0 ? previewWorkout(data, workout, today) : null),
    [data, workout, today],
  );

  if (id && !existing) return <Navigate to="/history" replace />;

  const update = (patch: Partial<Workout>) => setWorkout((w) => ({ ...w, ...patch }));
  const updateEntry = (entryId: string, fn: (e: ExerciseEntry) => ExerciseEntry) =>
    setWorkout((w) => ({ ...w, exercises: w.exercises.map((e) => (e.id === entryId ? fn(e) : e)) }));

  const addExercise = (exerciseId: string) => {
    const last = lastPerformance(exerciseId);
    const sets: WorkoutSet[] = last?.sets.length
      ? last.sets.map((s) => ({ ...s, id: uid() }))
      : [newSet(), newSet(), newSet()];
    setWorkout((w) => ({ ...w, exercises: [...w.exercises, { id: uid(), exerciseId, sets }] }));
    setPickerOpen(false);
  };

  const repeatLast = () => {
    const last = sortedHistory[0];
    if (!last) return;
    update({
      title: last.title,
      exercises: last.exercises.map((e) => ({ ...e, id: uid(), sets: e.sets.map((s) => ({ ...s, id: uid() })) })),
    });
  };

  const valid = workoutSchema.safeParse(workout).success && workout.exercises.some((e) => e.sets.length > 0);

  const save = () => {
    const parsed = workoutSchema.safeParse(workout);
    if (!parsed.success) {
      toast({ title: 'Could not save', body: parsed.error.issues[0]?.message, tone: 'warn' });
      return;
    }
    const events = preview?.newEvents ?? [];
    saveWorkout(parsed.data);
    if (isNew) saveDraft(null);
    const levelUps = events.filter((e) => e.kind !== 'levelDown');
    toast({
      title: `Workout saved · +${Math.round(preview?.overallGain ?? 0)} overall XP`,
      body: levelUps.length
        ? levelUps
            .slice(0, 3)
            .map((e) => describeEventShort(e, exercises))
            .join(' · ')
        : undefined,
      tone: levelUps.some((e) => e.kind === 'levelUp') ? 'level' : 'success',
    });
    navigate('/');
  };

  const remove = () => {
    if (!existing) return;
    if (!window.confirm('Delete this workout? Your levels will be recalculated.')) return;
    deleteWorkout(existing.id);
    toast({ title: 'Workout deleted' });
    navigate('/history');
  };

  const discard = () => {
    if (workout.exercises.length && !window.confirm('Discard this workout?')) return;
    saveDraft(null);
    setWorkout({ id: uid(), date: today, exercises: [] });
  };

  const gains = preview ? (Object.entries(preview.gains) as [MuscleId, number][]).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={isNew ? 'Log workout' : 'Edit workout'}
        subtitle={
          isNew
            ? 'Log every working set. RIR = reps you could still have done.'
            : formatDate(workout.date, { dateStyle: 'full' })
        }
        action={
          <div className="flex gap-2">
            {isNew && sortedHistory.length > 0 && workout.exercises.length === 0 && (
              <Button variant="secondary" onClick={repeatLast}>
                <Copy size={16} /> Repeat last
              </Button>
            )}
            {isNew && workout.exercises.length > 0 && (
              <Button variant="ghost" onClick={discard}>
                <RotateCcw size={16} /> Discard
              </Button>
            )}
            {!isNew && (
              <Button variant="danger" onClick={remove}>
                <Trash2 size={16} /> Delete
              </Button>
            )}
          </div>
        }
      />

      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="w-date">
          <Input
            id="w-date"
            type="date"
            value={workout.date}
            max={today}
            onChange={(e) => e.target.value && update({ date: e.target.value })}
          />
        </Field>
        <Field label="Title" htmlFor="w-title">
          <Input
            id="w-title"
            value={workout.title ?? ''}
            maxLength={60}
            placeholder="e.g. Push day"
            onChange={(e) => update({ title: e.target.value || undefined })}
          />
        </Field>
        <Field label="Duration" htmlFor="w-dur">
          <NumberInput
            id="w-dur"
            unit="min"
            step={1}
            value={workout.durationMin}
            onChange={(v) => update({ durationMin: v === undefined ? undefined : Math.round(v) })}
          />
        </Field>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {workout.exercises.map((entry) => {
            const ex = exercises.get(entry.exerciseId);
            const last = lastPerformance(entry.exerciseId);
            return (
              <Card key={entry.id} className="p-3 sm:p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{ex?.name ?? 'Unknown exercise'}</h3>
                    <p className="truncate text-xs text-muted">
                      {ex ? musclesSummary(ex) : 'This exercise was deleted'}
                      {last && (
                        <>
                          {' '}
                          · Last ({formatDate(last.date)}):{' '}
                          {last.sets.map((s) => `${s.reps}×${round(kgToDisplay(s.weightKg, units), 1)}`).join(', ')}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${ex?.name ?? 'exercise'}`}
                    onClick={() =>
                      setWorkout((w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== entry.id) }))
                    }
                    className="rounded-lg p-1 text-muted hover:text-bad"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_2rem_2rem] items-center gap-x-2 gap-y-2 text-xs text-muted">
                  <span>#</span>
                  <span>{ex?.bodyweightFactor ? `+${weightUnit(units)}` : weightUnit(units)}</span>
                  <span>Reps</span>
                  <span>RIR</span>
                  <span title="Warm-up set">WU</span>
                  <span />
                  {entry.sets.map((set, i) => {
                    const patchSet = (p: Partial<WorkoutSet>) =>
                      updateEntry(entry.id, (e) => ({
                        ...e,
                        sets: e.sets.map((s) => (s.id === set.id ? { ...s, ...p } : s)),
                      }));
                    return (
                      <SetRow
                        key={set.id}
                        index={i}
                        set={set}
                        units={units}
                        onChange={patchSet}
                        onRemove={() =>
                          updateEntry(entry.id, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== set.id) }))
                        }
                      />
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    updateEntry(entry.id, (e) => ({ ...e, sets: [...e.sets, newSet(e.sets[e.sets.length - 1])] }))
                  }
                  disabled={entry.sets.length >= 50}
                >
                  <Plus size={14} /> Add set
                </Button>
              </Card>
            );
          })}

          <Button
            variant="secondary"
            size="lg"
            onClick={() => setPickerOpen(true)}
            disabled={workout.exercises.length >= 40}
          >
            <Plus size={18} /> Add exercise
          </Button>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardTitle>XP preview</CardTitle>
            {gains.length === 0 ? (
              <p className="text-sm text-muted">Add exercises and sets to see what this session is worth.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {gains.map(([mid, xp]) => (
                  <li key={mid} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: sim ? levelColor(fractionalLevel(sim.muscles[mid].xp)) : 'var(--accent)' }}
                      />
                      {MUSCLES[mid].name}
                    </span>
                    <span className="num font-semibold text-good">+{Math.round(xp)}</span>
                  </li>
                ))}
                <li className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Overall</span>
                  <span className="num text-good">+{round(preview?.overallGain ?? 0, 1)}</span>
                </li>
              </ul>
            )}
            {preview && preview.newEvents.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-xs">
                {preview.newEvents.slice(0, 6).map((e, i) => (
                  <li key={i} className={cx(e.kind === 'levelDown' ? 'text-bad' : 'text-accent')}>
                    {describeEventShort(e, exercises)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Button size="lg" onClick={save} disabled={!valid}>
            <Save size={18} /> {isNew ? 'Save workout' : 'Save changes'}
          </Button>
          {preview && workout.exercises.length > 0 && (
            <p className="text-center text-xs text-muted">
              Volume: {formatWeight(volume(workout), units, 0)} ·{' '}
              {workout.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.warmup).length, 0)} working sets
            </p>
          )}
        </div>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
        exercises={exercises}
        recent={recentExerciseIds}
      />
    </div>
  );
}

function volume(w: Workout): number {
  return w.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((s, set) => s + (set.warmup ? 0 : set.reps * set.weightKg), 0),
    0,
  );
}

function SetRow({
  index,
  set,
  units,
  onChange,
  onRemove,
}: {
  index: number;
  set: WorkoutSet;
  units: 'metric' | 'imperial';
  onChange: (p: Partial<WorkoutSet>) => void;
  onRemove: () => void;
}) {
  const cell =
    'h-10 w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2 text-center text-sm text-fg num focus:border-accent focus:outline-none';
  return (
    <>
      <span className={cx('text-center text-sm font-semibold', set.warmup ? 'text-muted' : 'text-fg')}>
        {set.warmup ? 'W' : index + 1}
      </span>
      <input
        aria-label={`Set ${index + 1} weight`}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        className={cell}
        value={round(kgToDisplay(set.weightKg, units), 2)}
        onChange={(e) => onChange({ weightKg: Math.max(0, displayToKg(Number(e.target.value) || 0, units)) })}
      />
      <input
        aria-label={`Set ${index + 1} reps`}
        type="number"
        inputMode="numeric"
        min={0}
        max={200}
        step={1}
        className={cell}
        value={set.reps}
        onChange={(e) => onChange({ reps: Math.min(200, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
      />
      <select
        aria-label={`Set ${index + 1} reps in reserve`}
        className={cell}
        value={set.rir ?? ''}
        onChange={(e) => onChange({ rir: e.target.value === '' ? undefined : Number(e.target.value) })}
      >
        <option value="">–</option>
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <option key={r} value={r}>
            {r === 5 ? '5+' : r}
          </option>
        ))}
      </select>
      <input
        aria-label={`Set ${index + 1} is a warm-up`}
        type="checkbox"
        checked={!!set.warmup}
        onChange={(e) => onChange({ warmup: e.target.checked || undefined })}
        className="mx-auto h-4 w-4 accent-[var(--accent)]"
      />
      <button
        type="button"
        aria-label={`Remove set ${index + 1}`}
        onClick={onRemove}
        className="mx-auto rounded p-1 text-muted hover:text-bad"
      >
        <X size={16} />
      </button>
    </>
  );
}
