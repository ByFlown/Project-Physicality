import type { GameEvent } from '../domain/engine';
import type { Exercise } from '../domain/exercises';
import { MUSCLES } from '../domain/muscles';
import { formatWeight, type UnitSystem } from './units';

export function describeEventShort(e: GameEvent, exercises: Map<string, Exercise>): string {
  if (e.kind === 'pr') return `🏆 PR: ${exercises.get(e.exerciseId)?.name ?? e.exerciseId}`;
  const who = e.muscle === 'overall' ? 'Overall' : MUSCLES[e.muscle].name;
  return e.kind === 'levelUp' ? `▲ ${who} → L${e.level}` : `▼ ${who} → L${e.level}`;
}

export function describeEvent(e: GameEvent, exercises: Map<string, Exercise>, units: UnitSystem): string {
  if (e.kind === 'pr') {
    const name = exercises.get(e.exerciseId)?.name ?? e.exerciseId;
    return `New PR on ${name}: est. 1RM ${formatWeight(e.e1rm, units)} (was ${formatWeight(e.previous, units)})`;
  }
  const who = e.muscle === 'overall' ? 'Overall physique' : MUSCLES[e.muscle].name;
  return e.kind === 'levelUp' ? `${who} reached level ${e.level}` : `${who} dropped to level ${e.level}`;
}
