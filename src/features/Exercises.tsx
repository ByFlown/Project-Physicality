import { Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { toast } from '../components/toast-store';
import { Button, Card, Field, Input, NumberInput, PageHeader, Select } from '../components/ui';
import { cx } from '../lib/cx';
import type { Equipment } from '../domain/exercises';
import { MUSCLE_IDS, MUSCLES, type MuscleId } from '../domain/muscles';
import { customExerciseSchema, type CustomExercise } from '../domain/schema';
import { uid } from '../lib/id';
import { useData, useExerciseIndex } from '../store/hooks';
import { useAppStore } from '../store/store';
import { musclesSummary } from '../domain/exercises';

const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'];
const ROLES: { value: number; label: string }[] = [
  { value: 0, label: '—' },
  { value: 0.25, label: 'Stabiliser' },
  { value: 0.5, label: 'Secondary' },
  { value: 1, label: 'Primary' },
];

function CustomExerciseForm({ onDone }: { onDone: () => void }) {
  const save = useAppStore((s) => s.saveCustomExercise);
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('machine');
  const [bodyweightFactor, setBodyweightFactor] = useState<number | undefined>(0);
  const [muscles, setMuscles] = useState<Partial<Record<MuscleId, number>>>({});

  const submit = () => {
    const cleaned = Object.fromEntries(Object.entries(muscles).filter(([, v]) => v && v > 0));
    const candidate: CustomExercise = {
      id: `custom-${uid()}`,
      name: name.trim(),
      equipment,
      muscles: cleaned,
      bodyweightFactor: bodyweightFactor ?? 0,
    };
    const parsed = customExerciseSchema.safeParse(candidate);
    if (!parsed.success) {
      toast({ title: 'Check the form', body: parsed.error.issues[0]?.message, tone: 'warn' });
      return;
    }
    if (!Object.values(cleaned).some((v) => v >= 1)) {
      toast({ title: 'Pick at least one primary muscle', tone: 'warn' });
      return;
    }
    save(parsed.data);
    toast({ title: `${parsed.data.name} added`, tone: 'success' });
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" htmlFor="cx-name">
        <Input
          id="cx-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Belt Squat"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Equipment" htmlFor="cx-eq">
          <Select id="cx-eq" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Body weight moved"
          htmlFor="cx-bw"
          hint="0 for loaded lifts, 1.0 for pull-ups, 0.64 for push-ups."
        >
          <NumberInput
            id="cx-bw"
            step={0.05}
            min={0}
            max={1.5}
            value={bodyweightFactor}
            onChange={setBodyweightFactor}
          />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Muscles worked</p>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {MUSCLE_IDS.map((id) => (
            <label key={id} className="flex items-center justify-between gap-3 text-sm">
              <span>{MUSCLES[id].name}</span>
              <select
                aria-label={`${MUSCLES[id].name} role`}
                value={muscles[id] ?? 0}
                onChange={(e) => setMuscles((m) => ({ ...m, [id]: Number(e.target.value) }))}
                className="h-8 rounded-lg border border-border bg-surface-2 px-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={submit}>
          <Plus size={16} /> Add exercise
        </Button>
      </div>
    </div>
  );
}

export default function ExercisesPage() {
  const exercises = useExerciseIndex();
  const data = useData();
  const deleteCustom = useAppStore((s) => s.deleteCustomExercise);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of data.workouts)
      for (const e of w.exercises) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1);
    return counts;
  }, [data.workouts]);

  const list = [...exercises.values()]
    .filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(!!b.custom) - Number(!!a.custom) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Exercises"
        subtitle={`${exercises.size} exercises, each mapped to the muscles it trains.`}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> Custom exercise
          </Button>
        }
      />
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="pl-9"
          aria-label="Search exercises"
        />
      </div>
      <Card className="p-1 sm:p-2">
        <ul className="divide-y divide-border">
          {list.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {e.name}
                  {e.custom && <span className="ml-2 text-xs text-accent">custom</span>}
                </div>
                <div className="truncate text-xs text-muted">
                  {musclesSummary(e)} · {e.equipment}
                  {usage.get(e.id) ? ` · used ${usage.get(e.id)}×` : ''}
                </div>
              </div>
              {e.custom && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${e.name}`}
                  onClick={() => {
                    const used = usage.get(e.id) ?? 0;
                    const msg = used
                      ? `${e.name} is used in ${used} workout(s). Those sets will stop counting toward XP. Delete anyway?`
                      : `Delete ${e.name}?`;
                    if (window.confirm(msg)) deleteCustom(e.id);
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New custom exercise">
        <CustomExerciseForm onDone={() => setOpen(false)} />
      </Modal>
      <p className={cx('text-center text-xs text-muted')}>
        Contributions follow EMG and training-study consensus: primary movers count as 1 set, secondary 0.5, stabilisers
        0.25.
      </p>
    </div>
  );
}
