import type { Sex } from '../../domain/schema';
import {
  AVERAGE_SHAPE,
  coeffsFromSemantic,
  expandHalf,
  shapeHalf,
  triangles,
  type HumanModel,
  type SemanticShape,
} from './model';

/**
 * A plausible body for someone we have not scanned, from their profile:
 * MakeHuman's "muscle" slider from the fat-free mass index, and its "weight"
 * slider solved so the mesh volume times body density (Siri, from body fat)
 * equals their actual weight.
 */

export interface ProfileShape {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct: number;
  ageYears: number;
}

/** Enclosed volume of a closed triangle mesh (m³), by the divergence theorem. */
export function meshVolume(pos: Float32Array, tris: ArrayLike<number>): number {
  let v = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    v +=
      pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
      pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
      pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return Math.abs(v) / 6;
}

/** Whole-body density (kg/m³) from body fat, inverting Siri's equation BF = 495/ρ − 450. */
export const bodyDensity = (bodyFatPct: number) => (495 / (bodyFatPct + 450)) * 1000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Muscle slider from FFMI: 0.5 at an untrained average, 1 near the natural ceiling. */
export function muscleSlider(p: ProfileShape): number {
  const h = p.heightCm / 100;
  const ffmi = (p.weightKg * (1 - p.bodyFatPct / 100)) / (h * h);
  const [avg, top] = p.sex === 'male' ? [18.5, 25] : [15, 21];
  return clamp(0.5 + (0.5 * (ffmi - avg)) / (top - avg), 0.1, 1);
}

export function profileSemantic(model: HumanModel, p: ProfileShape): SemanticShape {
  const statureM = p.heightCm / 100;
  const tris = triangles(model);
  const base: SemanticShape = { ...AVERAGE_SHAPE, age: clamp(p.ageYears, 25, 70), muscle: muscleSlider(p) };
  const mass = (weight: number) => {
    const half = shapeHalf(model, coeffsFromSemantic(model, { ...base, weight }));
    return meshVolume(expandHalf(model, half, statureM), tris) * bodyDensity(p.bodyFatPct);
  };
  // Mass grows monotonically with the weight slider: bisect.
  let lo = 0;
  let hi = 1;
  if (mass(lo) >= p.weightKg) return { ...base, weight: lo };
  if (mass(hi) <= p.weightKg) return { ...base, weight: hi };
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (mass(mid) < p.weightKg) lo = mid;
    else hi = mid;
  }
  return { ...base, weight: (lo + hi) / 2 };
}

/** Shape coefficients for a profile. */
export function profileCoeffs(model: HumanModel, p: ProfileShape): Float32Array {
  return coeffsFromSemantic(model, profileSemantic(model, p));
}
