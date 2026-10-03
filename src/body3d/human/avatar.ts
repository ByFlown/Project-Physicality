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

  const bones = solvePose(
    model,
    joints,
    simplePose(joints, { armAbduction: input.armAbduction ?? 0.2, elbowFlex: 0.12 }),
  );
  return { positions: skin(model, rest, bones), index, owner, ownerCoverage };
}

/**
 * How much each vertex is covered by simple fitted underwear (0..1, soft edges), from its
 * position on the mean body. Computed once per model; the realistic body is otherwise nude.
 */
export function clothingMask(model: HumanModel): Float32Array {
  const half = shapeHalf(model, []);
  const pos = expandHalf(model, half, 1);
  const j = jointsOf(model, half, 1);
  const hip = j['upperleg.L'][1];
  const knee = j['knee.L'][1];
  const shoulder = j['upperarm.L'][1];
  const parts = vertexParts(model);
  const mask = new Float32Array(model.vertexCount);
  let crotch = Infinity;
  for (let v = 0; v < model.vertexCount; v++)
    if (Math.abs(pos[v * 3]) < 1e-5) crotch = Math.min(crotch, pos[v * 3 + 1]);
  const soft = 0.005; // ≈ 1 cm at 1.8 m
  const band = (y: number, lo: number, hi: number) => smoothstep(-soft, soft, Math.min(y - lo, hi - y));
  const top = hip + 0.06;
  const legCut = crotch - 0.035;
  for (let v = 0; v < model.vertexCount; v++) {
    if (parts[v] === PART_INDEX.arm || parts[v] === PART_INDEX.head) continue;
    const x = Math.abs(pos[v * 3]);
    const y = pos[v * 3 + 1];
    if (y < knee) continue;
    // Briefs: below the navel to the top of the thighs; leg openings rise toward the hips.
    const bottom = legCut + Math.min(1, x / 0.11) * (hip - 0.02 - legCut) * 0.55;
    let w = band(y, bottom, top);
    // Sports top for female bodies: under the shoulders to below the bust.
    if (model.sex === 'female') {
      const z = pos[v * 3 + 2];
      const chestTop = shoulder - 0.045 + (z > 0 ? 0 : 0.02);
      w = Math.max(w, band(y, shoulder - 0.17, chestTop) * smoothstep(-soft, soft, 0.13 - x));
    }
    mask[v] = w;
  }
  return mask;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export interface ColorOptions {
  skin: RGB;
  cloth: RGB;
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
    const cw = clothing[v];
    const o = geo.owner[v];
    let r = opts.skin[0] + (opts.cloth[0] - opts.skin[0]) * cw;
    let g = opts.skin[1] + (opts.cloth[1] - opts.skin[1]) * cw;
    let b = opts.skin[2] + (opts.cloth[2] - opts.skin[2]) * cw;
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
