import { deurenbergBodyFat, ffmi, levelFromFfmi, navyBodyFat } from './bodycomp';
import { totalXpForLevel, xpToNext } from './leveling';
import { MUSCLE_IDS, type MuscleId } from './muscles';
import type { Experience, Profile } from './schema';

export const EXPERIENCE_LEVEL: Record<Experience, number> = {
  none: 1,
  beginner: 3,
  intermediate: 7,
  advanced: 12,
  elite: 20,
};

export type BodyFatSource = 'reported' | 'navy' | 'estimated';

export interface BodyFatEstimate {
  value: number;
  source: BodyFatSource;
}

export function startBodyFat(profile: Profile): BodyFatEstimate {
  if (profile.startBodyFatPct !== undefined) return { value: profile.startBodyFatPct, source: 'reported' };
  const navy = navyBodyFat(profile.sex, profile.heightCm, profile.startMeasurements);
  if (navy !== undefined) return { value: navy, source: 'navy' };
  const age = Number(profile.startDate.slice(0, 4)) - profile.birthYear;
  return { value: deurenbergBodyFat(profile.sex, profile.startWeightKg, profile.heightCm, age), source: 'estimated' };
}

export interface Baseline {
  /** Continuous starting level before per-muscle adjustments. */
  level: number;
  experienceLevel: number;
  ffmi: number;
  ffmiLevel: number;
  bodyFat: BodyFatEstimate;
  /** Starting XP for each muscle. */
  muscleXp: Record<MuscleId, number>;
}

/** XP for a continuous level such as 6.4 (6 full levels + 40 % of level 6). */
export function xpForFractionalLevel(level: number): number {
  const l = Math.max(1, level);
  const whole = Math.floor(l);
  return totalXpForLevel(whole) + (l - whole) * xpToNext(whole);
}

/**
 * Derive a starting state from the onboarding answers. Self-reported
 * experience and a measurement-based FFMI are blended; FFMI gets less weight
 * when body fat had to be guessed from BMI (that guess is circular).
 */
export function computeBaseline(profile: Profile): Baseline {
  const bodyFat = startBodyFat(profile);
  const f = ffmi(profile.startWeightKg, profile.heightCm, bodyFat.value);
  const ffmiLevel = levelFromFfmi(profile.sex, f);
  const experienceLevel = EXPERIENCE_LEVEL[profile.experience];
  const ffmiWeight = bodyFat.source === 'estimated' ? 0.2 : 0.5;
  const level = Math.max(1, experienceLevel * (1 - ffmiWeight) + ffmiLevel * ffmiWeight);

  const muscleXp = {} as Record<MuscleId, number>;
  for (const id of MUSCLE_IDS) {
    const rating = profile.selfRatings[id] ?? 0;
    const delta = rating * Math.max(1, level * 0.2);
    muscleXp[id] = Math.round(xpForFractionalLevel(level + delta));
  }
  return { level, experienceLevel, ffmi: f, ffmiLevel, bodyFat, muscleXp };
}
