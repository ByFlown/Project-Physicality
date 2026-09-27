import { deurenbergBodyFat, ffmi, interpolate, levelFromFfmi, navyBodyFat } from './bodycomp';
import { totalXpForLevel, xpToNext } from './leveling';
import { MUSCLE_IDS, type MuscleId } from './muscles';
import type { Experience, Profile, Scan, Sex } from './schema';

export const EXPERIENCE_LEVEL: Record<Experience, number> = {
  none: 1,
  beginner: 3,
  intermediate: 7,
  advanced: 12,
  elite: 20,
};

export type BodyFatSource = 'reported' | 'navy' | 'scan' | 'estimated';

export interface BodyFatEstimate {
  value: number;
  source: BodyFatSource;
}

/**
 * Starting body fat, best source first: a reported value (DEXA, calipers),
 * tape measurements, the onboarding photo scan, then a BMI-based guess.
 */
export function startBodyFat(profile: Profile, scan?: Scan | null): BodyFatEstimate {
  if (profile.startBodyFatPct !== undefined) return { value: profile.startBodyFatPct, source: 'reported' };
  const navy = navyBodyFat(profile.sex, profile.heightCm, profile.startMeasurements);
  if (navy !== undefined) return { value: navy, source: 'navy' };
  if (scan?.bodyFatPct !== undefined) return { value: scan.bodyFatPct, source: 'scan' };
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
  /** Per-muscle levels implied by the onboarding scan, where a circumference covers the muscle. */
  scanLevels: Partial<Record<MuscleId, number>>;
}

/**
 * Scan circumference → muscle level. Reference values are for a lean (15% fat),
 * 180 cm man: [circumference at level 1, at level 24] in cm; `shoulders` is the
 * bideltoid width. Women use the scale factors below. These are coarse
 * population anchors, so scan levels are only ever blended with the baseline.
 */
const SCAN_REFERENCE: Record<
  'upperArm' | 'forearm' | 'chest' | 'shoulders' | 'thigh' | 'calf' | 'neck',
  { l1: number; l24: number; fat: number; female: number; muscles: MuscleId[] }
> = {
  upperArm: { l1: 29, l24: 41, fat: 0.9, female: 0.87, muscles: ['biceps', 'triceps'] },
  forearm: { l1: 25, l24: 32, fat: 0.5, female: 0.87, muscles: ['forearms'] },
  chest: { l1: 92, l24: 118, fat: 0.7, female: 0.9, muscles: ['chest'] },
  shoulders: { l1: 43, l24: 54, fat: 0.3, female: 0.9, muscles: ['sideDelts', 'frontDelts', 'rearDelts'] },
  thigh: { l1: 52, l24: 66, fat: 0.9, female: 0.95, muscles: ['quads', 'hamstrings', 'adductors'] },
  calf: { l1: 35, l24: 42, fat: 0.5, female: 0.95, muscles: ['calves'] },
  neck: { l1: 36, l24: 44, fat: 0.5, female: 0.88, muscles: ['traps'] },
};

export function scanLevels(
  scan: Scan,
  sex: Sex,
  heightCm: number,
  bodyFatPct: number,
): Partial<Record<MuscleId, number>> {
  const out: Partial<Record<MuscleId, number>> = {};
  for (const [site, ref] of Object.entries(SCAN_REFERENCE) as [
    keyof typeof SCAN_REFERENCE,
    (typeof SCAN_REFERENCE)[keyof typeof SCAN_REFERENCE],
  ][]) {
    const raw = site === 'shoulders' ? scan.sections.shoulders.w : scan.circumferences[site];
    if (!raw) continue;
    const normalised = (raw * 180) / heightCm;
    const lean = normalised * (1 - (ref.fat * (bodyFatPct - 15)) / 100);
    const k = sex === 'female' ? ref.female : 1;
    const level = interpolate(
      [
        [ref.l1 * k, 1],
        [ref.l24 * k, 24],
      ],
      lean,
    );
    // interpolate() clamps at the anchors; allow a little headroom beyond level 24.
    const beyond = lean > ref.l24 * k ? 24 + ((lean - ref.l24 * k) / ((ref.l24 - ref.l1) * k)) * 23 : level;
    for (const m of ref.muscles) out[m] = Math.min(35, Math.max(1, beyond));
  }
  return out;
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
export function computeBaseline(profile: Profile, scan?: Scan | null): Baseline {
  const bodyFat = startBodyFat(profile, scan);
  const f = ffmi(profile.startWeightKg, profile.heightCm, bodyFat.value);
  const ffmiLevel = levelFromFfmi(profile.sex, f);
  const experienceLevel = EXPERIENCE_LEVEL[profile.experience];
  const ffmiWeight = bodyFat.source === 'estimated' ? 0.2 : bodyFat.source === 'scan' ? 0.4 : 0.5;
  const level = Math.max(1, experienceLevel * (1 - ffmiWeight) + ffmiLevel * ffmiWeight);
  const fromScan = scan ? scanLevels(scan, profile.sex, profile.heightCm, bodyFat.value) : {};

  const muscleXp = {} as Record<MuscleId, number>;
  for (const id of MUSCLE_IDS) {
    const rating = profile.selfRatings[id] ?? 0;
    const delta = rating * Math.max(1, level * 0.2);
    const own = level + delta;
    const scanned = fromScan[id];
    muscleXp[id] = Math.round(xpForFractionalLevel(scanned === undefined ? own : 0.5 * own + 0.5 * scanned));
  }
  return { level, experienceLevel, ffmi: f, ffmiLevel, bodyFat, muscleXp, scanLevels: fromScan };
}

/** The scan that anchors the starting point: the earliest one. */
export function onboardingScan(scans: Scan[]): Scan | null {
  return scans.length ? scans.reduce((a, b) => (b.date < a.date ? b : a)) : null;
}
