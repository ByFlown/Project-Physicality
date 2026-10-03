import { MUSCLE_IDS, type MuscleId } from '../../domain/muscles';
import type { ModelDetail } from '../anatomy';
import type { MuscleLook, RGB } from '../deform';
import { addTargets, expandHalf, jointsOf, shapeHalf, triangles, type HumanModel } from './model';
import type { MuscleMap } from './muscleMap';
import { simplePose, skin, solvePose } from './pose';
import { PART_INDEX, vertexParts } from './sites';

/**
 * The realistic body as rendered: a shape (fitted to a scan, or predicted
 * from the profile), muscle growth since that shape was observed, a relaxed
 * pose, and per-vertex colours for the muscle map and clothing.
 */

/**
 * MakeHuman's sculpted muscle targets, driven by the muscles under them.
 * Values are averaged bulge changes; the sculpt weight is `gain × Δbulge`.
 */
export const SCULPTS: { target: string; muscles: MuscleId[]; gain: number }[] = [
  { target: 'upperarm-muscle', muscles: ['biceps', 'triceps'], gain: 0.9 },
  { target: 'upperarm-shoulder-muscle', muscles: ['frontDelts', 'sideDelts', 'rearDelts'], gain: 0.9 },
  { target: 'lowerarm-muscle', muscles: ['forearms'], gain: 0.9 },
  { target: 'upperleg-muscle', muscles: ['quads', 'hamstrings', 'adductors'], gain: 0.9 },
  { target: 'lowerleg-muscle', muscles: ['calves'], gain: 0.9 },
  { target: 'torso-muscle-pectoral', muscles: ['chest'], gain: 0.9 },
  { target: 'torso-muscle-dorsi', muscles: ['lats'], gain: 0.9 },
  { target: 'buttocks-volume', muscles: ['glutes'], gain: 0.6 },
  { target: 'stomach-tone', muscles: ['abs'], gain: 0.5 },
];

/** Fat sculpts driven by the body-fat change (percentage points × gain). */
const FAT_SCULPTS: { target: string; gain: number }[] = [
  { target: 'stomach-pregnant', gain: 0.035 },
  { target: 'upperarm-fat', gain: 0.05 },
  { target: 'lowerarm-fat', gain: 0.03 },
  { target: 'upperleg-fat', gain: 0.05 },
  { target: 'lowerleg-fat', gain: 0.03 },
];

export interface AvatarInput {
  model: HumanModel;
  map: MuscleMap;
  coeffs: ArrayLike<number>;
  statureM: number;
  /** Bulge factor per muscle now, and when the shape was observed (scan date or profile start). */
  bulges: Record<MuscleId, number>;
  anchorBulges: Record<MuscleId, number>;
  /** Body-fat change since the anchor, percentage points. */
  fatDelta?: number;
  detail: ModelDetail;
  /** Arm abduction from vertical, radians. */
  armAbduction?: number;
  /** Clothing coverage per vertex; covered areas are smoothed like fabric over skin. */
  clothing?: Float32Array;
  adjacency?: Adjacency;
}

export interface AvatarGeometry {
  positions: Float32Array;
  index: Uint16Array;
  /** Dominant muscle index per vertex (−1 for none), for picking and colouring. */
  owner: Int16Array;
  /** Coverage 0..1 of the dominant muscle. */
  ownerCoverage: Float32Array;
}

const muscleIndex = new Map(MUSCLE_IDS.map((id, i) => [id, i]));

function vertexNormals(pos: Float32Array, tris: Uint16Array): Float32Array {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3;
    const b = tris[t + 1] * 3;
    const c = tris[t + 2] * 3;
    const e1x = pos[b] - pos[a];
    const e1y = pos[b + 1] - pos[a + 1];
    const e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a];
    const e2y = pos[c + 1] - pos[a + 1];
    const e2z = pos[c + 2] - pos[a + 2];
    const fx = e1y * e2z - e1z * e2y;
    const fy = e1z * e2x - e1x * e2z;
    const fz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      n[v] += fx;
      n[v + 1] += fy;
      n[v + 2] += fz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

const average = (b: Record<MuscleId, number>, ids: MuscleId[]) => ids.reduce((s, id) => s + b[id], 0) / ids.length;

/** Build the posed avatar mesh. */
export function buildAvatar(input: AvatarInput): AvatarGeometry {
  const { model, map, statureM: S } = input;
  const half = shapeHalf(model, input.coeffs);
  const sculpt: Record<string, number> = {};
  for (const s of SCULPTS) {
    const d = average(input.bulges, s.muscles) - average(input.anchorBulges, s.muscles);
    sculpt[s.target] = Math.max(-1, Math.min(1, s.gain * d));
  }
  for (const f of FAT_SCULPTS) {
    sculpt[f.target] = Math.max(-1, Math.min(1, (sculpt[f.target] ?? 0) + f.gain * (input.fatDelta ?? 0)));
  }
  // The sports top covers the chest: fabric doesn't follow nipples.
  if (input.clothing && model.sex === 'female') {
    sculpt['nipple-size'] = -1;
    sculpt['nipple-point'] = -1;
    sculpt['breast-point'] = -0.8;
  }
  addTargets(model, half, sculpt);
  const rest = expandHalf(model, half, S);
  const joints = jointsOf(model, half, S);
  const index = triangles(model);
  const normals = vertexNormals(rest, index);

  // Footprint displacement: change since the anchor, combined like the procedural body
  // (strongest + 30% of the rest), scaled to this stature.
  const n = model.vertexCount;
  const owner = new Int16Array(n).fill(-1);
  const ownerCoverage = new Float32Array(n);
  const scale = S / 1.8;
  const usePart = map.parts.map((p) => !p.detail || input.detail === 'precise');
  for (let v = 0; v < n; v++) {
    let maxNow = 0;
    let sumNow = 0;
    let maxThen = 0;
    let sumThen = 0;
    let bestCov = 0;
    let best = -1;
    for (let e = map.offsets[v]; e < map.offsets[v + 1]; e++) {
      const pi = map.part[e];
      if (!usePart[pi]) continue;
      const p = map.parts[pi];
      const h = map.height[e] * p.bulge * scale;
      const now = h * input.bulges[p.muscle];
      const then = h * input.anchorBulges[p.muscle];
      sumNow += now;
      sumThen += then;
      if (now > maxNow) maxNow = now;
      if (then > maxThen) maxThen = then;
      if (map.coverage[e] > bestCov) {
        bestCov = map.coverage[e];
        best = muscleIndex.get(p.muscle) ?? -1;
      }
    }
    const disp = maxNow + 0.3 * (sumNow - maxNow) - (maxThen + 0.3 * (sumThen - maxThen));
    if (disp) {
      rest[v * 3] += normals[v * 3] * disp;
      rest[v * 3 + 1] += normals[v * 3 + 1] * disp;
      rest[v * 3 + 2] += normals[v * 3 + 2] * disp;
    }
    owner[v] = bestCov > 0.35 ? best : -1;
    ownerCoverage[v] = Math.min(1, bestCov);
  }

  if (input.clothing && input.adjacency) smoothUnderClothing(rest, input.clothing, input.adjacency);

  const bones = solvePose(
    model,
    joints,
    simplePose(joints, { armAbduction: input.armAbduction ?? 0.2, elbowFlex: 0.12 }),
  );
  return { positions: skin(model, rest, bones), index, owner, ownerCoverage };
}

/**
 * Simple fitted underwear — briefs, plus a sports top for female bodies —
 * defined on the mean body's rest pose (stature 1), so it sits the same on
 * every body shape. The realistic body is otherwise nude.
 */
export interface ClothingPattern {
  /** Rest-pose position of every vertex on the mean body (stature 1). */
  rest: Float32Array;
  /** 1 for vertices that never wear clothing (arms, hands, head). */
  bare: Float32Array;
  hip: number;
  knee: number;
  shoulder: number;
  legCut: number;
  briefTop: number;
  top: boolean;
}

const CLOTH_SOFT = 0.004; // ≈ 7 mm at 1.8 m

export function clothingPattern(model: HumanModel): ClothingPattern {
  const half = shapeHalf(model, []);
  const rest = expandHalf(model, half, 1);
  const j = jointsOf(model, half, 1);
  const parts = vertexParts(model);
  let crotch = Infinity;
  for (let v = 0; v < model.vertexCount; v++)
    if (Math.abs(rest[v * 3]) < 1e-5) crotch = Math.min(crotch, rest[v * 3 + 1]);
  const hip = j['upperleg.L'][1];
  return {
    rest,
    bare: Float32Array.from(parts, (p) => (p === PART_INDEX.arm || p === PART_INDEX.head ? 1 : 0)),
    hip,
    knee: j['knee.L'][1],
    shoulder: j['upperarm.L'][1],
    legCut: crotch - 0.035,
    briefTop: hip + 0.06,
    top: model.sex === 'female',
  };
}

/** Clothing coverage (0..1) at a rest-pose point. Mirrored in HumanScene's shader — keep them in sync. */
export function clothingAt(c: ClothingPattern, px: number, y: number, z: number): number {
  const x = Math.abs(px);
  if (y < c.knee) return 0;
  const band = (lo: number, hi: number) => smoothstep(-CLOTH_SOFT, CLOTH_SOFT, Math.min(y - lo, hi - y));
  // Leg openings rise toward the hips.
  const bottom = c.legCut + Math.min(1, x / 0.11) * (c.hip - 0.02 - c.legCut) * 0.55;
  let w = band(bottom, c.briefTop);
  if (c.top) {
    const chestTop = c.shoulder - 0.045 + (z > 0 ? 0 : 0.02);
    w = Math.max(w, band(c.shoulder - 0.17, chestTop) * smoothstep(-CLOTH_SOFT, CLOTH_SOFT, 0.13 - x));
  }
  return w;
}

/** Per-vertex clothing coverage (used to relax the skin under fabric). */
export function clothingMask(model: HumanModel, pattern = clothingPattern(model)): Float32Array {
  const r = pattern.rest;
  return Float32Array.from({ length: model.vertexCount }, (_, v) =>
    pattern.bare[v] ? 0 : clothingAt(pattern, r[v * 3], r[v * 3 + 1], r[v * 3 + 2]),
  );
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export interface ColorOptions {
  skin: RGB;
  /** Paint clothing into the vertex colours (omit when a shader draws it). */
  cloth?: RGB;
  /** Opacity of the muscle colours over skin (0 = skin only; hovered/selected muscles still show). */
  tint: number;
  adjacency?: Adjacency;
}

/** Vertex colours: skin, clothing, and muscles by their look (level/status colour, highlight). */
export function avatarColors(
  geo: AvatarGeometry,
  clothing: Float32Array,
  looks: Record<MuscleId, MuscleLook>,
  opts: ColorOptions,
  out?: Float32Array,
): Float32Array {
  const n = geo.owner.length;
  const col = out ?? new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const cw = opts.cloth ? clothing[v] : 0;
    const cloth = opts.cloth ?? opts.skin;
    const o = geo.owner[v];
    let r = opts.skin[0] + (cloth[0] - opts.skin[0]) * cw;
    let g = opts.skin[1] + (cloth[1] - opts.skin[1]) * cw;
    let b = opts.skin[2] + (cloth[2] - opts.skin[2]) * cw;
    if (o >= 0) {
      const look = looks[MUSCLE_IDS[o]];
      const hi = look.highlight;
      const c = look.color;
      // Muscles under clothing show through faintly.
      const k = geo.ownerCoverage[v] * Math.min(1, opts.tint + hi * 0.6) * (1 - 0.9 * cw);
      const cr = c[0] + (1 - c[0]) * hi * 0.45;
      const cg = c[1] + (1 - c[1]) * hi * 0.45;
      const cb = c[2] + (1 - c[2]) * hi * 0.45;
      r = r * (1 - k) + cr * k;
      g = g * (1 - k) + cg * k;
      b = b * (1 - k) + cb * k;
    }
    col[v * 3] = r;
    col[v * 3 + 1] = g;
    col[v * 3 + 2] = b;
  }
  if (opts.adjacency) smoothColors(col, opts.adjacency, 2);
  return col;
}

/** Vertex neighbours (CSR) from the quad topology. */
export interface Adjacency {
  offsets: Uint32Array;
  neighbours: Uint16Array;
}

export function vertexAdjacency(model: HumanModel): Adjacency {
  const sets = Array.from({ length: model.vertexCount }, () => new Set<number>());
  const q = model.quads;
  for (let i = 0; i < q.length; i += 4) {
    for (let k = 0; k < 4; k++) {
      const a = q[i + k];
      const b = q[i + ((k + 1) % 4)];
      sets[a].add(b);
      sets[b].add(a);
    }
  }
  const offsets = new Uint32Array(model.vertexCount + 1);
  const out: number[] = [];
  sets.forEach((s, v) => {
    offsets[v] = out.length;
    out.push(...s);
  });
  offsets[model.vertexCount] = out.length;
  return { offsets, neighbours: Uint16Array.from(out) };
}

/** Fabric does not follow small skin detail (nipples, navel): relax covered vertices toward their neighbours. */
function smoothUnderClothing(pos: Float32Array, clothing: Float32Array, adj: Adjacency, iterations = 10) {
  const next = new Float32Array(pos.length);
  for (let it = 0; it < iterations; it++) {
    next.set(pos);
    for (let v = 0; v < clothing.length; v++) {
      const c = clothing[v];
      if (c < 0.05) continue;
      const lo = adj.offsets[v];
      const hi = adj.offsets[v + 1];
      if (hi === lo) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (let e = lo; e < hi; e++) {
        const u = adj.neighbours[e] * 3;
        x += pos[u];
        y += pos[u + 1];
        z += pos[u + 2];
      }
      const k = (0.6 * c) / (hi - lo);
      next[v * 3] += x * k - 0.6 * c * pos[v * 3];
      next[v * 3 + 1] += y * k - 0.6 * c * pos[v * 3 + 1];
      next[v * 3 + 2] += z * k - 0.6 * c * pos[v * 3 + 2];
    }
    pos.set(next);
  }
}

/** Soften blocky per-vertex colour edges by averaging with neighbours. */
function smoothColors(col: Float32Array, adj: Adjacency, passes: number) {
  const tmp = new Float32Array(col.length);
  for (let p = 0; p < passes; p++) {
    const n = adj.offsets.length - 1;
    for (let v = 0; v < n; v++) {
      let r = 0;
      let g = 0;
      let b = 0;
      const lo = adj.offsets[v];
      const hi = adj.offsets[v + 1];
      for (let e = lo; e < hi; e++) {
        const u = adj.neighbours[e] * 3;
        r += col[u];
        g += col[u + 1];
        b += col[u + 2];
      }
      const k = hi > lo ? 0.5 / (hi - lo) : 0;
      tmp[v * 3] = col[v * 3] * (hi > lo ? 0.5 : 1) + r * k;
      tmp[v * 3 + 1] = col[v * 3 + 1] * (hi > lo ? 0.5 : 1) + g * k;
      tmp[v * 3 + 2] = col[v * 3 + 2] * (hi > lo ? 0.5 : 1) + b * k;
    }
    col.set(tmp);
  }
}
