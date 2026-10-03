import { partsForSegment, type MusclePart, type SegmentId } from '../anatomy';
import { piecewise } from '../rig';
import { expandHalf, jointsOf, shapeHalf, type HumanModel, type Vec3 } from './model';

/**
 * Maps the procedural muscle footprints (src/body3d/anatomy.ts, defined in
 * surface coordinates on a 1.8 m reference body) onto the realistic mesh.
 *
 * For every vertex of the mean body in its rest pose we compute surface
 * coordinates per body segment — height along the torso or limb axis
 * (rescaled to reference proportions) and angle around it — then evaluate
 * every footprint once. Segments blend by skin weight, so the deltoids fade
 * into the shoulder and the glutes into the thigh. Topology is shared by all
 * body shapes, so the map is computed once per sex.
 */

export interface MuscleMap {
  /** All footprints (torso parts mirrored across the midline; limb parts serve both sides). */
  parts: MusclePart[];
  /** CSR layout: the influences of vertex v are entries offsets[v] … offsets[v+1]−1. */
  offsets: Uint32Array;
  part: Uint16Array;
  /** Peak-normalised bulge profile (0..1) times the segment's skin weight. */
  height: Float32Array;
  /** Colour coverage (0..1) times the segment's skin weight. */
  coverage: Float32Array;
}

const SEGMENT_OF_BONE: Record<string, SegmentId | null> = {
  pelvis: 'torso',
  spineLow: 'torso',
  spineHigh: 'torso',
  neck: 'torso',
  clavicle: 'torso',
  upperarm: 'upperArm',
  lowerarm: 'forearm',
  upperleg: 'thigh',
  lowerleg: 'shin',
  head: null,
  hand: null,
  foot: null,
};
const REF_LENGTH: Record<Exclude<SegmentId, 'torso'>, number> = {
  upperArm: 0.3,
  forearm: 0.26,
  thigh: 0.42,
  shin: 0.4,
};
const LIMB_JOINTS: Record<Exclude<SegmentId, 'torso'>, [string, string]> = {
  upperArm: ['upperarm.L', 'elbow.L'],
  forearm: ['lowerarm.L', 'wrist.L'],
  thigh: ['upperleg.L', 'knee.L'],
  shin: ['lowerleg.L', 'ankle.L'],
};

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Footprint profile at surface coordinates: (part index, height 0..1, coverage 0..1). */
function footprints(
  parts: MusclePart[],
  indices: number[],
  y: number,
  a: number,
  r: number,
  emit: (p: number, h: number, c: number) => void,
) {
  for (const i of indices) {
    const p = parts[i];
    const reach = Math.max(p.width, p.height);
    if (y < p.y - reach || y > p.y + reach) continue;
    const t = p.tilt ?? 0;
    const u0 = wrapAngle(a - p.angle) * r;
    const v0 = y - p.y;
    const u = u0 * Math.cos(t) + v0 * Math.sin(t);
    const w = -u0 * Math.sin(t) + v0 * Math.cos(t);
    const d2 = (u / (p.width / 2)) ** 2 + (w / (p.height / 2)) ** 2;
    if (d2 >= 1) continue;
    emit(i, (1 - d2) ** 1.5, 1 - smoothstep(0.78, 1, Math.sqrt(d2)));
  }
}

export function buildMuscleMap(model: HumanModel): MuscleMap {
  const S = 1.8; // evaluate on the mean body at the reference stature
  const half = shapeHalf(model, []);
  const pos = expandHalf(model, half, S);
  const joints = jointsOf(model, half, S);
  const n = model.vertexCount;

  const parts = (['torso', 'upperArm', 'forearm', 'thigh', 'shin'] as SegmentId[]).flatMap((s) =>
    partsForSegment(s, 'precise'),
  );
  const bySegment = new Map<SegmentId, number[]>();
  parts.forEach((p, i) => bySegment.set(p.segment, [...(bySegment.get(p.segment) ?? []), i]));

  // Torso: reference heights via joint anchors, angle around the torso's centre line.
  let crotch = Infinity;
  for (let v = 0; v < n; v++) if (Math.abs(pos[v * 3]) < 1e-5) crotch = Math.min(crotch, pos[v * 3 + 1]);
  const toRef = piecewise(
    [
      [crotch, 0.78],
      [joints['upperleg.L'][1], 0.9],
      [joints['upperarm.L'][1], 1.435],
      [joints['neck'][1], 1.54],
    ],
    1,
  );
  // Centre of the torso cross-section (z) per 1 cm band, from torso-weighted vertices.
  const bandLo = new Map<number, number>();
  const bandHi = new Map<number, number>();
  const boneSeg = model.bones.map((b) => SEGMENT_OF_BONE[b.name.replace(/\.[LR]$/, '')] ?? null);
  for (let v = 0; v < n; v++) {
    const b = boneSeg[model.skinIndex[v * 4]];
    if (b !== 'torso') continue;
    const k = Math.round(pos[v * 3 + 1] * 100);
    const z = pos[v * 3 + 2];
    bandLo.set(k, Math.min(bandLo.get(k) ?? Infinity, z));
    bandHi.set(k, Math.max(bandHi.get(k) ?? -Infinity, z));
  }
  const centreZ = (y: number) => {
    const k = Math.round(y * 100);
    for (let d = 0; d < 20; d++) {
      for (const kk of [k - d, k + d]) {
        if (bandLo.has(kk)) return (bandLo.get(kk)! + bandHi.get(kk)!) / 2;
      }
    }
    return 0;
  };

  // Limb frames (left side; right-side vertices are mirrored into it).
  const frames = Object.fromEntries(
    (Object.keys(LIMB_JOINTS) as (keyof typeof LIMB_JOINTS)[]).map((seg) => {
      const [a, b] = LIMB_JOINTS[seg];
      const axis = unit(sub(joints[b], joints[a]));
      const front = unit(sub([0, 0, 1], axis.map((x) => x * axis[2]) as Vec3));
      const lateral = cross(front, axis);
      const len = Math.hypot(...sub(joints[b], joints[a]));
      return [seg, { origin: joints[a], axis, front, lateral, scale: REF_LENGTH[seg] / len }];
    }),
  ) as Record<keyof typeof LIMB_JOINTS, { origin: Vec3; axis: Vec3; front: Vec3; lateral: Vec3; scale: number }>;

  const offsets = new Uint32Array(n + 1);
  const partOut: number[] = [];
  const heightOut: number[] = [];
  const covOut: number[] = [];
  for (let v = 0; v < n; v++) {
    offsets[v] = partOut.length;
    const seen = new Map<number, number>();
    const segWeight = new Map<SegmentId, number>();
    for (let k = 0; k < 4; k++) {
      const s = boneSeg[model.skinIndex[v * 4 + k]];
      const w = model.skinWeight[v * 4 + k];
      if (s && w > 0) segWeight.set(s, (segWeight.get(s) ?? 0) + w);
    }
    const x = pos[v * 3];
    const p: Vec3 = [Math.abs(x), pos[v * 3 + 1], pos[v * 3 + 2]];
    for (const [seg, w] of segWeight) {
      if (w < 0.03) continue;
      let y: number;
      let a: number;
      let r: number;
      if (seg === 'torso') {
        const zc = centreZ(p[1]);
        y = toRef(p[1]);
        a = Math.atan2(x, p[2] - zc); // signed: torso parts are mirrored by angle
        r = Math.hypot(x, p[2] - zc);
      } else {
        const f = frames[seg];
        const d = sub(p, f.origin);
        const along = dot(d, f.axis);
        const perp: Vec3 = [d[0] - along * f.axis[0], d[1] - along * f.axis[1], d[2] - along * f.axis[2]];
        y = -along * f.scale;
        a = Math.atan2(dot(perp, f.lateral), dot(perp, f.front));
        r = Math.hypot(...perp);
      }
      footprints(parts, bySegment.get(seg) ?? [], y, a, r, (i, h, c) => {
        const at = seen.get(i);
        if (at === undefined) {
          seen.set(i, partOut.length);
          partOut.push(i);
          heightOut.push(h * w);
          covOut.push(c * w);
        } else {
          heightOut[at] += h * w;
          covOut[at] += c * w;
        }
      });
    }
  }
  offsets[n] = partOut.length;
  return {
    parts,
    offsets,
    part: Uint16Array.from(partOut),
    height: Float32Array.from(heightOut),
    coverage: Float32Array.from(covOut),
  };
}
