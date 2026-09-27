import type { Exercise } from './exercises';
import type { MuscleId } from './muscles';
import type { WorkoutSet } from './schema';

/**
 * Hypertrophy stimulus model. A "hard set" taken close to failure in the
 * 5–30 rep range counts as one effective set for each primary mover
 * (Schoenfeld et al. 2017/2021; Baz-Valle et al. 2022). Sets far from failure,
 * very low or very high reps count for less.
 */

/** Effort multiplier from reps in reserve. Unknown RIR is assumed moderately hard. */
export function effortFactor(rir: number | undefined): number {
  if (rir === undefined) return 0.9;
  if (rir <= 1) return 1;
  if (rir === 2) return 0.95;
  if (rir === 3) return 0.85;
  if (rir === 4) return 0.7;
  return 0.5;
}

/** Rep-range multiplier. */
export function repFactor(reps: number): number {
  if (reps <= 0) return 0;
  if (reps <= 2) return 0.55;
  if (reps <= 4) return 0.8;
  if (reps <= 30) return 1;
  if (reps <= 40) return 0.8;
  return 0.5;
}

export function setStimulus(set: WorkoutSet): number {
  if (set.warmup) return 0;
  return effortFactor(set.rir) * repFactor(set.reps);
}

/** Effective sets per muscle for a list of (exercise, sets) pairs. */
export function effectiveSetsByMuscle(
  entries: { exercise: Exercise; sets: WorkoutSet[] }[],
): Partial<Record<MuscleId, number>> {
  const out: Partial<Record<MuscleId, number>> = {};
  for (const { exercise, sets } of entries) {
    const stim = sets.reduce((sum, s) => sum + setStimulus(s), 0);
    if (stim === 0) continue;
    for (const [muscle, contribution] of Object.entries(exercise.muscles) as [MuscleId, number][]) {
      if (!contribution) continue;
      out[muscle] = (out[muscle] ?? 0) + stim * contribution;
    }
  }
  return out;
}

/** Sets per muscle per session before returns start to diminish. */
export const SESSION_FULL_VALUE_SETS = 6;
/** Asymptotic extra value from sets beyond the threshold. */
export const SESSION_EXTRA_CAP = 4;

/**
 * Diminishing returns within one session: the first ~6 effective sets count
 * fully, after that value tapers toward a ceiling of ~10 sets
 * (per-session volume findings, e.g. Remmert et al. 2023).
 */
export function sessionValue(effectiveSets: number): number {
  if (effectiveSets <= SESSION_FULL_VALUE_SETS) return Math.max(0, effectiveSets);
  const extra = effectiveSets - SESSION_FULL_VALUE_SETS;
  return SESSION_FULL_VALUE_SETS + SESSION_EXTRA_CAP * (1 - Math.exp(-extra / SESSION_EXTRA_CAP));
}

/** Weekly effective sets beyond which extra volume is mostly "junk". */
export const WEEKLY_MAX_PRODUCTIVE_SETS = 20;
export const WEEKLY_OVERFLOW_VALUE = 0.3;

/**
 * Fraction of a session's value retained after applying the weekly ceiling,
 * given the effective sets already done in the trailing week.
 */
export function weeklyScale(priorWeekSets: number, sessionSets: number): number {
  if (sessionSets <= 0) return 0;
  const room = Math.max(0, WEEKLY_MAX_PRODUCTIVE_SETS - priorWeekSets);
  const within = Math.min(sessionSets, room);
  const overflow = sessionSets - within;
  return (within + overflow * WEEKLY_OVERFLOW_VALUE) / sessionSets;
}

/** Epley estimated one-rep max. Returns 0 for sets outside 1–15 reps. */
export function estimated1RM(loadKg: number, reps: number): number {
  if (reps < 1 || reps > 15 || loadKg <= 0) return 0;
  if (reps === 1) return loadKg;
  return loadKg * (1 + reps / 30);
}

/** External load plus the share of body weight the exercise moves. */
export function effectiveLoad(exercise: Exercise, set: WorkoutSet, bodyWeightKg: number): number {
  return set.weightKg + exercise.bodyweightFactor * bodyWeightKg;
}
