import type { MuscleId } from '../domain/muscles';
import type { Ring } from './geometry';
import type { ShapeFactors } from './shape';

/**
 * Procedural anatomy of a 1.8 m reference body, facing +z, feet at y = 0.
 * Everything on one side (+x) is defined once and mirrored for the other.
 */

export type SegmentId = 'torso' | 'upperArm' | 'forearm' | 'thigh' | 'shin';

export type Vec3 = [number, number, number];

/** Joint positions (reference body). Limb segments hang along local −y. */
export const JOINTS = {
  shoulder: [0.195, 1.435, -0.005] as Vec3,
  armAngle: 0.26,
  upperArmLength: 0.3,
  forearmBend: -0.18,
  forearmLength: 0.26,
  hip: [0.092, 0.9, 0] as Vec3,
  legAngle: 0.035,
  thighLength: 0.42,
  shinLength: 0.4,
};

export function torsoRings(f: ShapeFactors): Ring[] {
  const g = f.girth;
  const sh = f.shoulderWidth;
  const hip = f.hipWidth;
  const wf = f.waistFat;
  return [
    { y: 0.76, w: 0.01, d: 0.01, z: 0 },
    { y: 0.78, w: 0.075 * hip * g, d: 0.06 * g, z: 0 },
    { y: 0.83, w: 0.13 * hip * g, d: 0.09 * g, z: 0 },
    { y: 0.9, w: 0.165 * hip * g * (1 + (wf - 1) * 0.5), d: 0.1 * g * (1 + (wf - 1) * 0.5), z: 0 },
    { y: 0.98, w: 0.158 * hip * g * (1 + (wf - 1) * 0.8), d: 0.098 * g * wf, z: 0.004 },
    { y: 1.06, w: 0.14 * g * wf, d: 0.095 * g * wf, z: 0.008 * wf },
    { y: 1.16, w: 0.148 * g * (1 + (wf - 1) * 0.7), d: 0.1 * g * (1 + (wf - 1) * 0.7), z: 0.004 },
    { y: 1.27, w: 0.162 * g * sh, d: 0.11 * g, z: 0 },
    { y: 1.37, w: 0.172 * g * sh, d: 0.112 * g, z: -0.004 },
    { y: 1.44, w: 0.17 * g * sh, d: 0.098 * g, z: -0.012 },
    { y: 1.5, w: 0.11 * g * sh, d: 0.075 * g, z: -0.018 },
    { y: 1.54, w: 0.058 * g, d: 0.056 * g, z: -0.012 },
    { y: 1.62, w: 0.052, d: 0.054, z: -0.004 },
    { y: 1.64, w: 0.01, d: 0.01, z: -0.004 },
  ];
}

export function upperArmRings(f: ShapeFactors): Ring[] {
  const g = f.girth * f.limbFat;
  return [
    { y: 0.03, w: 0.01, d: 0.01 },
    { y: 0.01, w: 0.05 * g, d: 0.052 * g },
    { y: -0.06, w: 0.046 * g, d: 0.048 * g },
    { y: -0.18, w: 0.041 * g, d: 0.043 * g },
    { y: -0.29, w: 0.036 * g, d: 0.037 * g },
    { y: -0.32, w: 0.01, d: 0.01 },
  ];
}

export function forearmRings(f: ShapeFactors): Ring[] {
  const g = f.girth * f.limbFat;
  return [
    { y: 0.02, w: 0.01, d: 0.01 },
    { y: 0.0, w: 0.036 * g, d: 0.036 * g },
    { y: -0.06, w: 0.04 * g, d: 0.036 * g },
    { y: -0.17, w: 0.03 * g, d: 0.027 * g },
    { y: -0.25, w: 0.024 * g, d: 0.02 * g },
    { y: -0.27, w: 0.01, d: 0.01 },
  ];
}

export function thighRings(f: ShapeFactors): Ring[] {
  const g = f.girth * f.limbFat;
  return [
    { y: 0.04, w: 0.02, d: 0.02 },
    { y: 0.0, w: 0.085 * g, d: 0.088 * g, x: -0.005 },
    { y: -0.1, w: 0.08 * g, d: 0.084 * g, x: -0.004 },
    { y: -0.24, w: 0.067 * g, d: 0.07 * g },
    { y: -0.38, w: 0.05 * g, d: 0.052 * g },
    { y: -0.43, w: 0.046 * g, d: 0.048 * g },
    { y: -0.45, w: 0.01, d: 0.01 },
  ];
}

export function shinRings(f: ShapeFactors): Ring[] {
  const g = f.girth * f.limbFat;
  return [
    { y: 0.02, w: 0.01, d: 0.01 },
    { y: 0.0, w: 0.046 * g, d: 0.048 * g },
    { y: -0.09, w: 0.05 * g, d: 0.056 * g, z: -0.008 },
    { y: -0.2, w: 0.042 * g, d: 0.045 * g, z: -0.004 },
    { y: -0.34, w: 0.03, d: 0.032 },
    { y: -0.4, w: 0.026, d: 0.028 },
    { y: -0.42, w: 0.01, d: 0.01 },
  ];
}

/**
 * A muscle's footprint on a segment's surface, in surface coordinates:
 * `y` along the segment axis, `angle` around it (0 = front, +π/2 = lateral/+x,
 * ±π = back). Width is measured along the circumference, height along the axis.
 */
export interface MusclePart {
  muscle: MuscleId;
  segment: SegmentId;
  y: number;
  angle: number;
  width: number;
  height: number;
  /** Footprint rotation in radians (positive lifts the +angle side). */
  tilt?: number;
  /** Peak outward displacement in metres at a reference (level ≈ 10) muscle. */
  bulge: number;
  /** Torso parts are mirrored to the other side unless this is false. */
  mirror?: boolean;
}

const P = Math.PI;

/** Muscle footprints (defined for the +x side; limbs are mirrored with their segment). */
export const MUSCLE_PARTS: MusclePart[] = [
  // Chest — clavicular and sternal pectoralis
  { muscle: 'chest', segment: 'torso', y: 1.362, angle: 0.52, width: 0.2, height: 0.085, tilt: 0.32, bulge: 0.014 },
  { muscle: 'chest', segment: 'torso', y: 1.3, angle: 0.44, width: 0.215, height: 0.13, tilt: 0.12, bulge: 0.027 },

  // Abs — three segments per side, lower abdomen
  { muscle: 'abs', segment: 'torso', y: 1.215, angle: 0.22, width: 0.055, height: 0.065, bulge: 0.009 },
  { muscle: 'abs', segment: 'torso', y: 1.145, angle: 0.22, width: 0.058, height: 0.065, bulge: 0.009 },
  { muscle: 'abs', segment: 'torso', y: 1.075, angle: 0.22, width: 0.06, height: 0.067, bulge: 0.009 },
  { muscle: 'abs', segment: 'torso', y: 0.99, angle: 0.24, width: 0.066, height: 0.095, bulge: 0.007 },

  // Obliques & serratus
  { muscle: 'obliques', segment: 'torso', y: 1.08, angle: 1.0, width: 0.165, height: 0.196, tilt: -0.35, bulge: 0.012 },
  { muscle: 'obliques', segment: 'torso', y: 1.22, angle: 1.15, width: 0.105, height: 0.103, tilt: -0.3, bulge: 0.009 },

  // Traps — upper slope and mid-back
  { muscle: 'traps', segment: 'torso', y: 1.49, angle: 2.0, width: 0.195, height: 0.081, tilt: -0.2, bulge: 0.024 },
  { muscle: 'traps', segment: 'torso', y: 1.41, angle: 2.85, width: 0.12, height: 0.172, bulge: 0.012 },

  // Upper back — rhomboids, teres
  { muscle: 'upperBack', segment: 'torso', y: 1.33, angle: 2.72, width: 0.135, height: 0.115, bulge: 0.013 },
  { muscle: 'upperBack', segment: 'torso', y: 1.375, angle: 2.2, width: 0.105, height: 0.063, bulge: 0.015 },

  // Lats — the V-taper
  { muscle: 'lats', segment: 'torso', y: 1.23, angle: 2.05, width: 0.195, height: 0.253, tilt: 0.45, bulge: 0.02 },

  // Lower back — spinal erectors
  { muscle: 'lowerBack', segment: 'torso', y: 1.07, angle: 2.93, width: 0.083, height: 0.241, bulge: 0.013 },

  // Glutes — maximus & medius
  { muscle: 'glutes', segment: 'torso', y: 0.875, angle: 2.55, width: 0.255, height: 0.196, bulge: 0.034 },
  { muscle: 'glutes', segment: 'torso', y: 0.945, angle: 1.75, width: 0.12, height: 0.081, bulge: 0.012 },

  // Deltoids (upper-arm segment; y = 0 at the shoulder joint)
  { muscle: 'frontDelts', segment: 'upperArm', y: -0.04, angle: 0.45, width: 0.112, height: 0.127, bulge: 0.016 },
  { muscle: 'sideDelts', segment: 'upperArm', y: -0.045, angle: 1.57, width: 0.112, height: 0.138, bulge: 0.02 },
  { muscle: 'rearDelts', segment: 'upperArm', y: -0.04, angle: 2.65, width: 0.112, height: 0.127, bulge: 0.015 },

  // Upper arm
  { muscle: 'biceps', segment: 'upperArm', y: -0.17, angle: 0.05, width: 0.098, height: 0.196, bulge: 0.019 },
  { muscle: 'triceps', segment: 'upperArm', y: -0.14, angle: -2.9, width: 0.09, height: 0.218, bulge: 0.015 },
  { muscle: 'triceps', segment: 'upperArm', y: -0.12, angle: 2.4, width: 0.083, height: 0.161, bulge: 0.017 },

  // Forearm
  { muscle: 'forearms', segment: 'forearm', y: -0.06, angle: 0.95, width: 0.083, height: 0.149, bulge: 0.012 },
  { muscle: 'forearms', segment: 'forearm', y: -0.08, angle: -0.6, width: 0.098, height: 0.172, bulge: 0.011 },
  { muscle: 'forearms', segment: 'forearm', y: -0.08, angle: 2.3, width: 0.083, height: 0.161, bulge: 0.009 },

  // Quads — rectus femoris, vastus lateralis, vastus medialis
  { muscle: 'quads', segment: 'thigh', y: -0.2, angle: 0.05, width: 0.125, height: 0.35, bulge: 0.017 },
  { muscle: 'quads', segment: 'thigh', y: -0.21, angle: 1.15, width: 0.135, height: 0.345, bulge: 0.019 },
  { muscle: 'quads', segment: 'thigh', y: -0.33, angle: -0.62, width: 0.098, height: 0.149, bulge: 0.019 },

  // Hamstrings — biceps femoris, semitendinosus
  { muscle: 'hamstrings', segment: 'thigh', y: -0.22, angle: 2.7, width: 0.098, height: 0.345, bulge: 0.016 },
  { muscle: 'hamstrings', segment: 'thigh', y: -0.23, angle: -2.75, width: 0.098, height: 0.345, bulge: 0.016 },

  // Adductors — inner thigh
  { muscle: 'adductors', segment: 'thigh', y: -0.13, angle: -1.6, width: 0.15, height: 0.253, bulge: 0.012 },

  // Calves — gastrocnemius heads, soleus
  { muscle: 'calves', segment: 'shin', y: -0.1, angle: -2.65, width: 0.083, height: 0.172, bulge: 0.019 },
  { muscle: 'calves', segment: 'shin', y: -0.09, angle: 2.65, width: 0.075, height: 0.149, bulge: 0.015 },
  { muscle: 'calves', segment: 'shin', y: -0.2, angle: P, width: 0.12, height: 0.115, bulge: 0.008 },
];

/** Torso parts for both sides (mirrored copies appended). */
export function partsForSegment(segment: SegmentId): MusclePart[] {
  const parts = MUSCLE_PARTS.filter((p) => p.segment === segment);
  if (segment !== 'torso') return parts;
  return [
    ...parts,
    ...parts.filter((p) => p.mirror !== false).map((p) => ({ ...p, angle: -p.angle, tilt: -(p.tilt ?? 0) })),
  ];
}
