import { ArrowDown, ArrowUp, Trophy } from 'lucide-react';
import { formatDate } from '../domain/dates';
import type { GameEvent } from '../domain/engine';
import type { Exercise } from '../domain/exercises';
import { describeEvent } from '../lib/events';
import type { UnitSystem } from '../lib/units';
import { tierColor } from '../lib/colors';

export function EventFeed({
  events,
  exercises,
  units,
  limit = 8,
}: {
  events: GameEvent[];
  exercises: Map<string, Exercise>;
  units: UnitSystem;
  limit?: number;
}) {
  const recent = events.slice(-limit).reverse();
  if (recent.length === 0) {
    return <p className="py-4 text-sm text-muted">Level-ups, level-downs and personal records will show up here.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {recent.map((e, i) => {
        const icon =
          e.kind === 'pr' ? (
            <Trophy size={16} className="text-warn" />
          ) : e.kind === 'levelUp' ? (
            <ArrowUp size={16} style={{ color: tierColor(e.level) }} />
          ) : (
            <ArrowDown size={16} className="text-bad" />
          );
        return (
          <li key={`${e.date}-${i}`} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0 flex-1">{describeEvent(e, exercises, units)}</span>
            <span className="shrink-0 text-xs text-muted">{formatDate(e.date)}</span>
          </li>
        );
      })}
    </ul>
  );
}
