import { expandHalf, jointsOf, shapeHalf, triangles, type HumanModel, type Vec3 } from '../body3d/human/model';
import { slice, type SliceEdge, type SliceLoop } from '../body3d/human/measure';
import { posedJoints, simplePose, skin, solvePose, type BoneTransform, type Quat } from '../body3d/human/pose';
import { measureSites, PART_INDEX, vertexParts } from '../body3d/human/sites';
import { MEASURE_SITES, type MeasurementValues, type Scan, type Sex } from '../domain/schema';
import { scaleFor, type BuildScanInput } from './buildScan';
import { chordLength, chordMid, landmarksUsable } from './geometry';
import type { ChordId, Pt } from './types';

/**
 * Model-based scan: fit the 3D body model's 48 shape coefficients so that its
 * silhouette matches what the two photos show, then take tape measurements
 * on the fitted mesh. Compared with turning two chords into an ellipse, this
 * uses every torso row, ties all sites to one plausible body and measures
 * real cross-sections instead of assuming their shape.
 */

export type Observation =
  /** Torso width (front) / depth (side) on a horizontal slice at height y (cm). */
  | { kind: 'torsoWidth' | 'torsoDepth'; y: number; value: number; sigma: number }
  /**
   * Side-view torso centre at height y relative to the centre at `yRef`: the
   * profile's shape (belly, chest, back), independent of where the axis is.
   */
  | { kind: 'torsoCenter'; y: number; yRef: number; value: number; sigma: number }
  /** Neck width / depth on a horizontal slice. */
  | { kind: 'neckWidth' | 'neckDepth'; y: number; value: number; sigma: number }
  /** Bideltoid breadth including the arms, horizontal slice. */
  | { kind: 'shoulderWidth'; y: number; value: number; sigma: number }
  /** Limb width perpendicular to the bone, seen from the front, at fraction t along it. */
  | { kind: 'limbWidth'; limb: Limb; t: number; value: number; sigma: number }
  /** Leg depth seen from the side (both legs overlap), horizontal slice. */
  | { kind: 'legDepth'; y: number; value: number; sigma: number }
  /** Joint centre height above the floor. */
  | { kind: 'jointHeight'; joint: string; value: number; sigma: number }
  | { kind: 'boneLength'; from: string; to: string; value: number; sigma: number };

export type Limb = 'upperArm' | 'forearm' | 'thigh' | 'calf';

const LIMB_BONES: Record<Limb, [string, string, 'arm' | 'leg']> = {
  upperArm: ['upperarm.L', 'elbow.L', 'arm'],
  forearm: ['elbow.L', 'wrist.L', 'arm'],
  thigh: ['upperleg.L', 'knee.L', 'leg'],
  calf: ['knee.L', 'ankle.L', 'leg'],
};
/** MediaPipe landmark pairs (left, right) spanning each limb. */
const LIMB_LANDMARKS: Record<Limb, [[number, number], [number, number]]> = {
  upperArm: [
    [11, 13],
    [12, 14],
  ],
  forearm: [
    [13, 15],
    [14, 16],
  ],
  thigh: [
    [23, 25],
    [24, 26],
  ],
  calf: [
    [25, 27],
    [26, 28],
  ],
};
const DEFAULT_T: Record<Limb, number> = { upperArm: 0.55, forearm: 0.3, thigh: 0.3, calf: 0.33 };

// ---------------------------------------------------------------- observations from photos

/** Turn two (possibly hand-corrected) photo analyses into fit observations, in cm. */
export function scanObservations(input: BuildScanInput, scan: Scan): Observation[] {
  const { front, side, heightCm } = input;
  const fs = scaleFor(front.markup, heightCm);
  const ss = scaleFor(side.markup, heightCm);
  const obs: Observation[] = [];

  // Dense torso rows (already corrected to agree with the edited chords).
  const rows = scan.torso;
  const lo = rows[0].y;
  const hi = rows[rows.length - 1].y;
  const inner = rows.filter((r) => {
    const f = (r.y - lo) / Math.max(1, hi - lo);
    return f >= 0.15 && f <= 0.92;
  });
  // Reference row for the side-profile shape: the one nearest the hips' height.
  const ref = inner.reduce((a, b) => (Math.abs(b.y - scan.joints.hipY) < Math.abs(a.y - scan.joints.hipY) ? b : a));
  for (const r of inner) {
    obs.push({ kind: 'torsoWidth', y: r.y, value: 2 * r.half, sigma: 1.2 });
    obs.push({ kind: 'torsoDepth', y: r.y, value: r.front + r.back, sigma: 1.4 });
    if (r !== ref) {
      const centre = (x: typeof r) => (x.front - x.back) / 2;
      obs.push({ kind: 'torsoCenter', y: r.y, yRef: ref.y, value: centre(r) - centre(ref), sigma: 1.5 });
    }
  }

  const fChord = (id: ChordId) => front.markup.chords[id];
  const sChord = (id: ChordId) => side.markup.chords[id];
  // Checked chords count more than the dense rows.
  for (const id of ['chest', 'waist', 'hips'] as const) {
    const c = fChord(id);
    if (c) obs.push({ kind: 'torsoWidth', y: fs.heightOf(chordMid(c).y), value: fs.cm(chordLength(c)), sigma: 0.7 });
    const d = sChord(id);
    if (d) obs.push({ kind: 'torsoDepth', y: ss.heightOf(chordMid(d).y), value: ss.cm(chordLength(d)), sigma: 0.9 });
  }
  const neck = fChord('neck');
  if (neck)
    obs.push({ kind: 'neckWidth', y: fs.heightOf(chordMid(neck).y), value: fs.cm(chordLength(neck)), sigma: 0.6 });
  const neckSide = sChord('neck');
  if (neckSide) {
    obs.push({
      kind: 'neckDepth',
      y: ss.heightOf(chordMid(neckSide).y),
      value: ss.cm(chordLength(neckSide)),
      sigma: 1.2,
    });
  }
  const shoulders = fChord('shoulders');
  if (shoulders) {
    obs.push({
      kind: 'shoulderWidth',
      y: fs.heightOf(chordMid(shoulders).y),
      value: fs.cm(chordLength(shoulders)),
      sigma: 2,
    });
  }

  // Limbs: the chord's position along the bone comes from the landmarks when present.
  const lm = landmarksUsable(front.landmarks) ? front.landmarks : null;
  const px = (i: number): Pt => ({ x: lm![i].x * front.markup.width, y: lm![i].y * front.markup.height });
  for (const limb of ['upperArm', 'forearm', 'thigh', 'calf'] as const) {
    const c = fChord(limb);
    if (!c) continue;
    let t = DEFAULT_T[limb];
    if (lm) {
      const m = chordMid(c);
      const best = LIMB_LANDMARKS[limb]
        .map(([a, b]) => {
          const A = px(a);
          const B = px(b);
          const d = { x: B.x - A.x, y: B.y - A.y };
          const len2 = d.x * d.x + d.y * d.y || 1;
          const tt = ((m.x - A.x) * d.x + (m.y - A.y) * d.y) / len2;
          const off = Math.abs((m.x - A.x) * d.y - (m.y - A.y) * d.x) / Math.sqrt(len2);
          return { tt, off };
        })
        .sort((a, b) => a.off - b.off)[0];
      if (best.tt > 0.02 && best.tt < 0.98) t = best.tt;
    }
    obs.push({ kind: 'limbWidth', limb, t, value: fs.cm(chordLength(c)), sigma: 0.5 });
  }
  for (const id of ['thigh', 'calf'] as const) {
    const d = sChord(id);
    if (d) obs.push({ kind: 'legDepth', y: ss.heightOf(chordMid(d).y), value: ss.cm(chordLength(d)), sigma: 0.9 });
  }

  // Skeleton proportions from landmarks.
  if (lm) {
    const j = scan.joints;
    obs.push({ kind: 'jointHeight', joint: 'upperarm.L', value: j.shoulderY, sigma: 1.5 });
    obs.push({ kind: 'jointHeight', joint: 'upperleg.L', value: j.hipY, sigma: 2 });
    obs.push({ kind: 'jointHeight', joint: 'knee.L', value: j.kneeY, sigma: 1.5 });
    obs.push({ kind: 'jointHeight', joint: 'ankle.L', value: j.ankleY, sigma: 1 });
    obs.push({ kind: 'boneLength', from: 'upperarm.L', to: 'elbow.L', value: j.upperArmLength, sigma: 2 });
    obs.push({ kind: 'boneLength', from: 'elbow.L', to: 'wrist.L', value: j.forearmLength, sigma: 2 });
  }
  return obs;
}

// ---------------------------------------------------------------- model evaluation

interface FitContext {
  model: HumanModel;
  statureM: number;
  armAbduction: number;
  tris: Uint16Array;
  parts: Uint8Array;
}

interface Evaluation {
  values: number[];
  /** Gradient of each value with respect to the coefficients (cm per unit coefficient). */
  grads: Float64Array[];
}

type Mat3 = number[];
function quatToMat(q: Quat): Mat3 {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

function evaluate(ctx: FitContext, coeffs: Float64Array, obs: Observation[]): Evaluation {
  const { model, statureM: S } = ctx;
  const K = model.components;
  const D = model.halfCount * 3;
  const half = shapeHalf(model, coeffs);
  const rest = expandHalf(model, half, S);
  const joints = jointsOf(model, half, S);
  const bones = solvePose(model, joints, simplePose(joints, { armAbduction: ctx.armAbduction, elbowFlex: 0 }));
  const posed = skin(model, rest, bones);
  const pj = posedJoints(model, joints, bones);
  const boneMats = bones.map((b: BoneTransform) => quatToMat(b.q));

  /** d(posed vertex · dir)/d coeffs, in metres per unit coefficient. */
  const vertexGrad = (v: number, dir: Vec3, out: Float64Array, scale: number) => {
    // Blended rotation transposed times dir.
    let ex = 0;
    let ey = 0;
    let ez = 0;
    for (let k = 0; k < 4; k++) {
      const w = model.skinWeight[v * 4 + k];
      if (!w) continue;
      const m = boneMats[model.skinIndex[v * 4 + k]];
      ex += w * (m[0] * dir[0] + m[3] * dir[1] + m[6] * dir[2]);
      ey += w * (m[1] * dir[0] + m[4] * dir[1] + m[7] * dir[2]);
      ez += w * (m[2] * dir[0] + m[5] * dir[1] + m[8] * dir[2]);
    }
    const h = model.halfIndex[v] * 3;
    const sx = model.mirrored[v] ? -1 : 1;
    const b = model.basis;
    for (let c = 0; c < K; c++) {
      const o = c * D + h;
      out[c] += scale * S * (ex * sx * b[o] + ey * b[o + 1] + ez * b[o + 2]);
    }
  };
  const posOf = (v: number): Vec3 => [posed[v * 3], posed[v * 3 + 1], posed[v * 3 + 2]];

  /**
   * Gradient of a slice point's in-plane coordinate along `dir` — including the
   * slide of the crossing point along its edge as the vertices move.
   */
  const edgeGrad = (e: SliceEdge, dir: Vec3, normal: Vec3, out: Float64Array, scale: number) => {
    const A = posOf(e.a);
    const B = posOf(e.b);
    const ab: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const nab = normal[0] * ab[0] + normal[1] * ab[1] + normal[2] * ab[2];
    const along = dir[0] * ab[0] + dir[1] * ab[1] + dir[2] * ab[2];
    // P = A + t(B−A), with t chosen so n·P = const → dP·dir = (1−t)dA·dir' + t dB·dir', dir' = dir − n (along/nab).
    const k = Math.abs(nab) > 1e-9 ? along / nab : 0;
    const eff: Vec3 = [dir[0] - normal[0] * k, dir[1] - normal[1] * k, dir[2] - normal[2] * k];
    vertexGrad(e.a, eff, out, scale * (1 - e.t));
    vertexGrad(e.b, eff, out, scale * e.t);
  };

  /** Extent of the given loops along `dir` (max − min), with gradient. */
  const extent = (loops: SliceLoop[], u: Vec3, uIndex: 0 | 1, normal: Vec3, mode: 'size' | 'center' = 'size') => {
    let lo = Infinity;
    let hi = -Infinity;
    let eLo: SliceEdge | null = null;
    let eHi: SliceEdge | null = null;
    for (const l of loops) {
      l.points.forEach((p, i) => {
        if (p[uIndex] < lo) {
          lo = p[uIndex];
          eLo = l.edges[i];
        }
        if (p[uIndex] > hi) {
          hi = p[uIndex];
          eHi = l.edges[i];
        }
      });
    }
    const g = new Float64Array(K);
    if (!eLo || !eHi) return { value: 0, grad: g };
    if (mode === 'center') {
      edgeGrad(eHi, u, normal, g, 50);
      edgeGrad(eLo, u, normal, g, 50);
      return { value: ((hi + lo) / 2) * 100, grad: g };
    }
    edgeGrad(eHi, u, normal, g, 100);
    edgeGrad(eLo, u, normal, g, -100);
    return { value: (hi - lo) * 100, grad: g };
  };

  const UP: Vec3 = [0, 1, 0];
  const X: Vec3 = [1, 0, 0];
  const Z: Vec3 = [0, 0, 1];
  const cache = new Map<string, SliceLoop[]>();
  const horizontal = (y: number, filter: (v: number) => boolean, key: string) => {
    const k = `${key}@${y.toFixed(2)}`;
    let loops = cache.get(k);
    if (!loops) {
      loops = slice(posed, ctx.tris, { origin: [0, y / 100, 0], normal: UP }, filter).loops;
      cache.set(k, loops);
    }
    return loops;
  };
  const notArm = (v: number) => ctx.parts[v] !== PART_INDEX.arm;
  const isHead = (v: number) => ctx.parts[v] === PART_INDEX.head;
  const notHead = (v: number) => ctx.parts[v] !== PART_INDEX.head;

  const values: number[] = [];
  const grads: Float64Array[] = [];
  for (const o of obs) {
    let r: { value: number; grad: Float64Array };
    switch (o.kind) {
      case 'torsoWidth':
        r = extent(horizontal(o.y, notArm, 'torso'), X, 0, UP);
        break;
      case 'torsoDepth':
        r = extent(horizontal(o.y, notArm, 'torso'), Z, 1, UP);
        break;
      case 'torsoCenter': {
        const a = extent(horizontal(o.y, notArm, 'torso'), Z, 1, UP, 'center');
        const b = extent(horizontal(o.yRef, notArm, 'torso'), Z, 1, UP, 'center');
        r = { value: a.value - b.value, grad: a.grad.map((x, k) => x - b.grad[k]) };
        break;
      }
      case 'neckWidth':
        r = extent(horizontal(o.y, isHead, 'head'), X, 0, UP);
        break;
      case 'neckDepth':
        r = extent(horizontal(o.y, isHead, 'head'), Z, 1, UP);
        break;
      case 'shoulderWidth':
        r = extent(horizontal(o.y, notHead, 'all'), X, 0, UP);
        break;
      case 'legDepth':
        // A side photo sees both legs (and the buttocks above the gluteal fold) as one silhouette.
        r = extent(horizontal(o.y, notArm, 'torso'), Z, 1, UP);
        break;
      case 'limbWidth': {
        const [a, b, part] = LIMB_BONES[o.limb];
        const A = pj[a];
        const B = pj[b];
        const origin: Vec3 = [A[0] + (B[0] - A[0]) * o.t, A[1] + (B[1] - A[1]) * o.t, A[2] + (B[2] - A[2]) * o.t];
        const n0: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const nl = Math.hypot(...n0) || 1;
        const normal: Vec3 = [n0[0] / nl, n0[1] / nl, n0[2] / nl];
        const s = slice(posed, ctx.tris, { origin, normal }, (v) => ctx.parts[v] === PART_INDEX[part]);
        // The loop around the bone: the one containing (or nearest) the origin.
        const loop = s.loops.reduce<SliceLoop | null>(
          (best, l) => (!best || Math.hypot(...l.center) < Math.hypot(...best.center) ? l : best),
          null,
        );
        r = extent(loop ? [loop] : [], s.u, 0, normal);
        break;
      }
      case 'jointHeight': {
        const j = model.jointNames.indexOf(o.joint);
        const g = new Float64Array(K);
        if (j >= 0) {
          const off = (model.halfVertexCount + j) * 3 + 1;
          for (let c = 0; c < K; c++) g[c] = model.basis[c * D + off] * S * 100;
        }
        r = { value: (pj[o.joint]?.[1] ?? 0) * 100, grad: g };
        break;
      }
      case 'boneLength': {
        const A = joints[o.from];
        const B = joints[o.to];
        const d: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const len = Math.hypot(...d) || 1;
        const ia = model.jointNames.indexOf(o.from);
        const ib = model.jointNames.indexOf(o.to);
        const g = new Float64Array(K);
        if (ia >= 0 && ib >= 0) {
          const oa = (model.halfVertexCount + ia) * 3;
          const ob = (model.halfVertexCount + ib) * 3;
          for (let c = 0; c < K; c++) {
            let s = 0;
            for (let k = 0; k < 3; k++) s += (d[k] / len) * (model.basis[c * D + ob + k] - model.basis[c * D + oa + k]);
            g[c] = s * S * 100;
          }
        }
        r = { value: len * 100, grad: g };
        break;
      }
    }
    values.push(r.value);
    grads.push(r.grad);
  }
  return { values, grads };
}

// ---------------------------------------------------------------- solver

function solve(A: Float64Array, b: Float64Array, n: number): Float64Array {
  // Cholesky (A is symmetric positive definite thanks to the prior).
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

export interface FitResult {
  coeffs: number[];
  /** RMS of the data residuals in cm. */
  rmsCm: number;
  /** Data residual (predicted − observed, cm) per observation. */
  residuals: number[];
  iterations: number;
}

export interface FitOptions {
  statureM: number;
  /** Arm abduction in the front photo (radians from vertical). */
  armAbduction: number;
  /** Prior strength on coefficients (1 = population prior). */
  prior?: number;
  maxIterations?: number;
  /** Starting coefficients. */
  start?: ArrayLike<number>;
}

/** Fit shape coefficients to observations (Levenberg–Marquardt with a population prior). */
export function fitBody(model: HumanModel, obs: Observation[], opts: FitOptions): FitResult {
  const K = model.components;
  const ctx: FitContext = {
    model,
    statureM: opts.statureM,
    armAbduction: opts.armAbduction,
    tris: triangles(model),
    parts: vertexParts(model),
  };
  const prior = opts.prior ?? 1;
  const c = new Float64Array(K);
  if (opts.start) for (let k = 0; k < K; k++) c[k] = opts.start[k] ?? 0;

  // Huber loss: residuals beyond HUBER sigmas (a hand over the waist, a clothing fold) count linearly.
  const HUBER = 2.5;
  const rho = (z: number) => (Math.abs(z) <= HUBER ? z * z : 2 * HUBER * Math.abs(z) - HUBER * HUBER);
  const cost = (e: Evaluation, coeffs: Float64Array) => {
    let s = 0;
    obs.forEach((o, i) => (s += rho((e.values[i] - o.value) / o.sigma)));
    for (let k = 0; k < K; k++) s += prior * (coeffs[k] / model.sigmas[k]) ** 2;
    return s;
  };

  let ev = evaluate(ctx, c, obs);
  let current = cost(ev, c);
  let lambda = 1e-3;
  let it = 0;
  let converged = false;
  for (; it < (opts.maxIterations ?? 15) && !converged; it++) {
    const A = new Float64Array(K * K);
    const g = new Float64Array(K);
    obs.forEach((o, i) => {
      const r = ev.values[i] - o.value;
      const z = Math.abs(r / o.sigma);
      const w = (z <= HUBER ? 1 : HUBER / z) / (o.sigma * o.sigma);
      const J = ev.grads[i];
      for (let a = 0; a < K; a++) {
        if (!J[a]) continue;
        g[a] += w * J[a] * r;
        for (let b = 0; b < K; b++) A[a * K + b] += w * J[a] * J[b];
      }
    });
    for (let k = 0; k < K; k++) {
      const p = prior / (model.sigmas[k] * model.sigmas[k]);
      A[k * K + k] += p;
      g[k] += p * c[k];
    }
    let improved = false;
    for (let tries = 0; tries < 6 && !improved; tries++) {
      const Ad = Float64Array.from(A);
      for (let k = 0; k < K; k++) Ad[k * K + k] *= 1 + lambda;
      const step = solve(Ad, g, K);
      const next = Float64Array.from(c, (x, k) => x - step[k]);
      const evNext = evaluate(ctx, next, obs);
      const nextCost = cost(evNext, next);
      if (nextCost < current) {
        const gain = (current - nextCost) / current;
        c.set(next);
        ev = evNext;
        current = nextCost;
        lambda = Math.max(1e-6, lambda / 3);
        improved = true;
        converged = gain < 1e-4;
      } else {
        lambda *= 8;
      }
    }
    if (!improved) break;
  }
  const residuals = obs.map((o, i) => ev.values[i] - o.value);
  const rmsCm = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, residuals.length));
  return { coeffs: Array.from(c), rmsCm, residuals, iterations: it };
}

/** Tape measurements on a fitted body with the arms relaxed at the sides (cm). */
export function modelCircumferences(
  model: HumanModel,
  coeffs: ArrayLike<number>,
  statureM: number,
  sex: Sex,
): MeasurementValues {
  const half = shapeHalf(model, coeffs);
  const rest = expandHalf(model, half, statureM);
  const joints = jointsOf(model, half, statureM);
  const bones = solvePose(model, joints, simplePose(joints, { armAbduction: 0.12, elbowFlex: 0.05 }));
  const sites = measureSites({
    positions: skin(model, rest, bones),
    tris: triangles(model),
    joints: posedJoints(model, joints, bones),
    parts: vertexParts(model),
    sex,
  });
  const out: MeasurementValues = {};
  for (const s of MEASURE_SITES) {
    const m = sites[s];
    if (m) out[s] = Math.round(m.circumference * 1000) / 10;
  }
  return out;
}
