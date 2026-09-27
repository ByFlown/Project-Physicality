import type { LocalDate } from './dates';
import { simulate, type GameEvent } from './engine';
import { MUSCLE_IDS, type MuscleId } from './muscles';
import type { AppData, Workout } from './schema';

export interface WorkoutPreview {
  /** XP each muscle gains from this workout on its date (includes PR bonuses). */
  gains: Partial<Record<MuscleId, number>>;
  overallGain: number;
  /** Level-ups, level-downs and PRs that exist only with this workout included. */
  newEvents: GameEvent[];
}

const eventKey = (e: GameEvent) =>
  e.kind === 'pr' ? `pr:${e.date}:${e.exerciseId}` : `${e.kind}:${e.date}:${e.muscle}:${e.level}`;

/** Compare the world with and without `workout` to show what it is worth. */
export function previewWorkout(data: AppData, workout: Workout, today: LocalDate): WorkoutPreview | null {
  if (!data.profile) return null;
  const others = data.workouts.filter((w) => w.id !== workout.id);
  const without = { ...data, workouts: others };
  const withIt = { ...data, workouts: [...others, workout] };
  const end = workout.date > today ? workout.date : today;

  const atDateBefore = simulate(without, workout.date);
  const atDateAfter = simulate(withIt, workout.date);
  const before = simulate(without, end);
  const after = simulate(withIt, end);
  if (!atDateBefore || !atDateAfter || !before || !after) return null;

  const gains: Partial<Record<MuscleId, number>> = {};
  for (const id of MUSCLE_IDS) {
    const delta = atDateAfter.muscles[id].xp - atDateBefore.muscles[id].xp;
    if (delta > 0.05) gains[id] = delta;
  }
  const seen = new Set(before.events.map(eventKey));
  return {
    gains,
    overallGain: atDateAfter.overall.totalXp - atDateBefore.overall.totalXp,
    newEvents: after.events.filter((e) => !seen.has(eventKey(e))),
  };
}
