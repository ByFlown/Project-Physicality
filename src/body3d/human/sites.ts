import type { MeasureSite, Sex } from '../../domain/schema';
import { girthAt, girthOf, slice, type Girth } from './measure';
import type { HumanModel, Vec3 } from './model';

/**
 * Canonical tape-measurement sites on the body model. Heights are defined
 * relative to joint centres the same way the photo pipeline places its lines
 * (from pose landmarks), so model measurements and photo measurements refer
 * to the same anatomy.
 */

export type BodyPart = 'torso' | 'head' | 'arm' | 'leg';

const PART_OF_BONE: Record<string, BodyPart> = {
  pelvis: 'torso',
  spineLow: 'torso',
  spineHigh: 'torso',
  neck: 'head',
  head: 'head',
};

/** Dominant body part per vertex, from skin weights. */
export function vertexParts(model: HumanModel): Uint8Array {
  const parts: BodyPart[] = ['torso', 'head', 'arm', 'leg'];
  const boneParts = model.bones.map((b) => {
    if (PART_OF_BONE[b.name]) return PART_OF_BONE[b.name];
    if (/^(clavicle)/.test(b.name)) return 'torso';
    if (/^(upperarm|lowerarm|hand)/.test(b.name)) return 'arm';
    return 'leg';
  });
  const out = new Uint8Array(model.vertexCount);
  for (let v = 0; v < model.vertexCount; v++) {
    const acc = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      acc[parts.indexOf(boneParts[model.skinIndex[v * 4 + k]])] += model.skinWeight[v * 4 + k];
    }
    out[v] = acc.indexOf(Math.max(...acc));
  }
  return out;
}
export const PART_INDEX: Record<BodyPart, number> = { torso: 0, head: 1, arm: 2, leg: 3 };

export interface SiteMeasurement extends Girth {
  /** Plane origin (metres). */
  origin: Vec3;
  normal: Vec3;
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const UP: Vec3 = [0, 1, 0];

export interface MeasureContext {
  positions: Float32Array;
  tris: ArrayLike<number>;
  /** Joint positions in the same (posed) space as `positions`. */
  joints: Record<string, Vec3>;
  parts: Uint8Array;
  sex: Sex;
}

/** Torso girth at height y: the hull of every non-arm loop (both thighs below the crotch). */
export function torsoGirthAt(ctx: MeasureContext, y: number): SiteMeasurement | null {
  const origin: Vec3 = [0, y, 0];
  const s = slice(ctx.positions, ctx.tris, { origin, normal: UP }, (v) => ctx.parts[v] !== PART_INDEX.arm);
  const pts = s.loops.flatMap((l) => l.points);
  if (pts.length < 3) return null;
  return { ...girthOf(pts), origin, normal: UP };
}

function limbGirth(ctx: MeasureContext, a: Vec3, b: Vec3, t: number, part: BodyPart | null): SiteMeasurement | null {
  const origin = lerp3(a, b, t);
  const normal = sub(b, a);
  const g = girthAt(
    ctx.positions,
    ctx.tris,
    origin,
    normal,
    part ? (v) => ctx.parts[v] === PART_INDEX[part] : undefined,
  );
  return g ? { ...g, origin, normal } : null;
}

function best(
  items: (SiteMeasurement | null)[],
  pick: (a: SiteMeasurement, b: SiteMeasurement) => boolean,
): SiteMeasurement | null {
  let out: SiteMeasurement | null = null;
  for (const m of items) if (m && (!out || pick(m, out))) out = m;
  return out;
}
const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

/** Tape measurements at every site (metres), on the left side for limbs. */
export function measureSites(ctx: MeasureContext): Partial<Record<MeasureSite, SiteMeasurement>> {
  const j = ctx.joints;
  const shoulderY = (j['upperarm.L'][1] + j['upperarm.R'][1]) / 2;
  const hipY = (j['upperleg.L'][1] + j['upperleg.R'][1]) / 2;
  const torsoLen = shoulderY - hipY;
  const at = (f: number) => shoulderY - f * torsoLen;
  const out: Partial<Record<MeasureSite, SiteMeasurement>> = {};

  // Just below the larynx, perpendicular to the neck. No part filter: skin weights blend across the neck.
  const neck = limbGirth(ctx, j.neck, j.head, 0.4, null);
  if (neck) out.neck = neck;
  const chest = torsoGirthAt(ctx, at(0.3));
  if (chest) out.chest = chest;

  const waistCandidates =
    ctx.sex === 'female' ? range(0.55, 0.85, 16).map((f) => torsoGirthAt(ctx, at(f))) : [torsoGirthAt(ctx, at(0.72))];
  const waist = best(waistCandidates, (a, b) => a.circumference < b.circumference);
  if (waist) out.waist = waist;
  const hips = best(
    range(0.85, 1.25, 21).map((f) => torsoGirthAt(ctx, at(f))),
    (a, b) => a.circumference > b.circumference,
  );
  if (hips) out.hips = hips;

  // Shoulders: around both deltoids and the chest, with the arms at the sides.
  const shoulders = best(
    range(-0.08, 0.14, 12).map((f) => {
      const origin: Vec3 = [0, at(f), 0];
      const s = slice(ctx.positions, ctx.tris, { origin, normal: UP }, (v) => ctx.parts[v] !== PART_INDEX.head);
      const pts = s.loops.flatMap((l) => l.points);
      return pts.length >= 3 ? { ...girthOf(pts), origin, normal: UP } : null;
    }),
    (a, b) => a.circumference > b.circumference,
  );
  if (shoulders) out.shoulders = shoulders;

  const upperArm = limbGirth(ctx, j['upperarm.L'], j['elbow.L'], 0.5, 'arm');
  if (upperArm) out.upperArm = upperArm;
  const forearm = best(
    range(0.15, 0.45, 7).map((t) => limbGirth(ctx, j['elbow.L'], j['wrist.L'], t, 'arm')),
    (a, b) => a.circumference > b.circumference,
  );
  if (forearm) out.forearm = forearm;
  const thigh = limbGirth(ctx, j['upperleg.L'], j['knee.L'], 0.3, 'leg');
  if (thigh) out.thigh = thigh;
  const calf = best(
    range(0.15, 0.5, 8).map((t) => limbGirth(ctx, j['knee.L'], j['ankle.L'], t, 'leg')),
    (a, b) => a.circumference > b.circumference,
  );
  if (calf) out.calf = calf;
  return out;
}
