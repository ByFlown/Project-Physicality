import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Modal } from '../../components/Modal';
import { Input } from '../../components/ui';
import { cx } from '../../lib/cx';
import { musclesSummary, type Exercise } from '../../domain/exercises';
import { MUSCLE_IDS, MUSCLES, type MuscleId } from '../../domain/muscles';

export function ExercisePicker({
  open,
  onClose,
  onPick,
  exercises,
  recent,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseId: string) => void;
  exercises: Map<string, Exercise>;
  recent: string[];
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recentRank = new Map(recent.map((id, i) => [id, i]));
    return [...exercises.values()]
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.equipment.includes(q))
      .filter((e) => !muscle || (e.muscles[muscle] ?? 0) >= 0.5)
      .sort((a, b) => {
        const ra = recentRank.get(a.id) ?? Infinity;
        const rb = recentRank.get(b.id) ?? Infinity;
        if (ra !== rb) return ra - rb;
        if (muscle) return (b.muscles[muscle] ?? 0) - (a.muscles[muscle] ?? 0) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
  }, [exercises, query, muscle, recent]);

  return (
    <Modal open={open} onClose={onClose} title="Add exercise">
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          className="pl-9"
          aria-label="Search exercises"
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by muscle">
        {MUSCLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={muscle === id}
            onClick={() => setMuscle(muscle === id ? null : id)}
            className={cx(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition',
              muscle === id ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-fg',
            )}
          >
            {MUSCLES[id].name}
          </button>
        ))}
      </div>
      <ul className="flex flex-col">
        {list.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => {
                onPick(e.id);
                setQuery('');
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {e.name}
                  {e.custom && <span className="ml-2 text-xs text-accent">custom</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {musclesSummary(e)} · {e.equipment}
                </span>
              </span>
              <Plus size={18} className="shrink-0 text-muted" />
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">
            No match.{' '}
            <Link to="/exercises" className="text-accent underline">
              Create a custom exercise
            </Link>
          </li>
        )}
      </ul>
    </Modal>
  );
}
