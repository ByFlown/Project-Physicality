import type { MeasurementValues, Sex } from './schema';

/**
 * U.S. Navy circumference body-fat estimate (Hodgdon & Beckett, 1984).
 * Typical error ±3–4 % body fat versus DEXA. Returns undefined when inputs are
 * missing or implausible.
 */
export function navyBodyFat(sex: Sex, heightCm: number, m: MeasurementValues): number | undefined {
  const { neck, waist, hips } = m;
  if (!neck || !waist) return undefined;
  let bf: number;
  if (sex === 'male') {
    if (waist - neck <= 0) return undefined;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (!hips || waist + hips - neck <= 0) return undefined;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(heightCm)) - 450;
  }
  if (!Number.isFinite(bf) || bf < 2 || bf > 65) return undefined;
  return Math.round(bf * 10) / 10;
}

/** Height-normalised fat-free mass index (Kouri et al., 1995). */
export function ffmi(weightKg: number, heightCm: number, bodyFatPct: number): number {
  const h = heightCm / 100;
  const lean = weightKg * (1 - bodyFatPct / 100);
  const raw = lean / (h * h);
  return raw + 6.1 * (1.8 - h);
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

/**
 * Rough body-fat guess from BMI, age and sex (Deurenberg et al., 1991) — only
 * used when the user supplies neither a body-fat % nor navy measurements.
 */
export function deurenbergBodyFat(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const bf = 1.2 * bmi(weightKg, heightCm) + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;
  return Math.min(50, Math.max(5, Math.round(bf * 10) / 10));
}

/** Piecewise-linear interpolation over sorted [x, y] points (clamped at the ends). */
export function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/**
 * FFMI → approximate physique level. Anchors reflect typical natural ranges:
 * men ≈ 18–20 untrained, 22 well-trained, 25 close to the natural ceiling;
 * women sit about 3.5 points lower.
 */
const FFMI_LEVEL_MALE: [number, number][] = [
  [17, 1],
  [19, 3],
  [20.5, 6],
  [22, 10],
  [23.5, 16],
  [25, 24],
  [26.5, 32],
];
const FEMALE_OFFSET = 3.5;

export function levelFromFfmi(sex: Sex, value: number): number {
  const x = sex === 'male' ? value : value + FEMALE_OFFSET;
  return interpolate(FFMI_LEVEL_MALE, x);
}
