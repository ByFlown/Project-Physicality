import type { Sex } from '../domain/schema';

/**
 * Visual mapping from muscle level → bulge multiplier (1 ≈ level 10). Growth
 * saturates the way real hypertrophy does: early levels change the silhouette
 * a lot, later ones progressively less.
 */
export function muscleBulge(fractionalLevel: number): number {
  const l = Math.max(1, fractionalLevel);
  return 0.35 + 1.3 * (1 - Math.exp(-(l - 1) / 12));
}

export interface BodyShape {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct: number;
}

export interface ShapeFactors {
  /** Uniform scale from the 1.8 m reference model. */
  scale: number;
  /** Girth multiplier for limbs and torso from lean mass. */
  girth: number;
  /** Extra girth around the waist from body fat. */
  waistFat: number;
  /** Extra girth on limbs from body fat. */
  limbFat: number;
  shoulderWidth: number;
  hipWidth: number;
  /** 0..1 — how visible the abdominal segments are. */
  absDefinition: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function shapeFactors(shape: BodyShape): ShapeFactors {
  const h = shape.heightCm / 100;
  const leanBmi = (shape.weightKg * (1 - shape.bodyFatPct / 100)) / (h * h);
  const refLean = shape.sex === 'male' ? 19 : 15.5;
  const refFat = shape.sex === 'male' ? 15 : 24;
  const fatDelta = shape.bodyFatPct - refFat;
  return {
    scale: h / 1.8,
    girth: clamp(1 + (leanBmi - refLean) * 0.035, 0.82, 1.3),
    waistFat: clamp(1 + fatDelta * 0.018, 0.85, 1.6),
    limbFat: clamp(1 + fatDelta * 0.008, 0.92, 1.3),
    shoulderWidth: shape.sex === 'male' ? 1 : 0.9,
    hipWidth: shape.sex === 'male' ? 1 : 1.1,
    absDefinition: clamp((refFat + 10 - shape.bodyFatPct) / 14, 0.15, 1),
  };
}
