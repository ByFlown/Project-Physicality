/**
 * Runtime side of the baked MakeHuman body model (see scripts/bake-body-model.mjs).
 *
 * A body is `mean + Σ coeffs[k] · basis[k]` over one (x ≥ 0) half of the mesh,
 * stature-normalised (feet at y = 0, top of head at y = 1, hip joints at z = 0,
 * facing +z, the body's left side at +x). The other half is mirrored. Optional
 * sparse targets (muscle and fat sculpts) are added on top.
 */

export type Vec3 = [number, number, number];

export interface SparseTarget {
  /** Half-layout vertex indices. */
  idx: Uint16Array;
  /** xyz deltas per index, stature-normalised. */
  delta: Float32Array;
}

export interface HumanModel {
  sex: 'male' | 'female';
  vertexCount: number;
  halfVertexCount: number;
  /** Half vertices plus joints. */
  halfCount: number;
  components: number;
  /** Population standard deviation of each coefficient. */
  sigmas: Float32Array;
  mean: Float32Array;
  /** components × halfCount × 3, dequantised. */
  basis: Float32Array;
  quads: Uint16Array;
  /** For every full vertex, the half vertex it copies (mirrored when `mirrored[i]`). */
  halfIndex: Uint16Array;
  mirrored: Uint8Array;
  /** Half-layout joint names (centre and left side; right side is mirrored). */
  jointNames: string[];
  bones: { name: string; parent: string | null }[];
  skinIndex: Uint8Array;
  /** 0..1 skin weights, 4 per vertex. */
  skinWeight: Float32Array;
  semantic: string[];
  featureNames: string[];
  regression: number[][];
  localDirs: Record<string, { incr: number[]; decr: number[] }>;
  targets: Record<string, SparseTarget>;
}

interface BlockMeta {
  offset: number;
  length: number;
  type: string;
}

const ARRAYS = {
  Float32Array,
  Int8Array,
  Uint8Array,
  Uint16Array,
} as const;

/** Decode a baked `human-*.bin` file. */
export function parseHumanModel(buffer: ArrayBuffer): HumanModel {
  const view = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
  if (magic !== 'PHB1') throw new Error('Not a body model file');
  const jsonLength = view.getUint32(4, true);
  const dataStart = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, jsonLength)));
  const blocks = header.blocks as Record<string, BlockMeta>;
  const block = <T extends keyof typeof ARRAYS>(name: string, type: T): InstanceType<(typeof ARRAYS)[T]> => {
    const b = blocks[name];
    if (!b || b.type !== type) throw new Error(`Body model block ${name} missing`);
    const Ctor = ARRAYS[type] as unknown as new (
      buf: ArrayBuffer,
      offset: number,
      length: number,
    ) => InstanceType<(typeof ARRAYS)[T]>;
    return new Ctor(buffer, dataStart + b.offset, b.length);
  };

  const K: number = header.components;
  const halfCount = header.halfVertexCount + header.joints.length;
  const D = halfCount * 3;
  const q = block('basis', 'Int8Array');
  const scales = block('basisScale', 'Float32Array');
  const basis = new Float32Array(K * D);
  for (let c = 0; c < K; c++) {
    const s = scales[c];
    for (let d = 0; d < D; d++) basis[c * D + d] = q[c * D + d] * s;
  }
  const skinW = block('skinWeight', 'Uint8Array');
  const targets: Record<string, SparseTarget> = {};
  for (const [id, meta] of Object.entries(header.targets as Record<string, { scale: number }>)) {
    const d = block(`t:${id}:d`, 'Int8Array');
    targets[id] = { idx: block(`t:${id}:idx`, 'Uint16Array'), delta: Float32Array.from(d, (x) => x * meta.scale) };
  }
  return {
    sex: header.sex,
    vertexCount: header.vertexCount,
    halfVertexCount: header.halfVertexCount,
    halfCount,
    components: K,
    sigmas: Float32Array.from(header.sigmas),
    mean: block('mean', 'Float32Array'),
    basis,
    quads: block('quads', 'Uint16Array'),
    halfIndex: block('halfIndex', 'Uint16Array'),
    mirrored: block('mirrored', 'Uint8Array'),
    jointNames: header.joints,
    bones: header.bones,
    skinIndex: block('skinIndex', 'Uint8Array'),
    skinWeight: Float32Array.from(skinW, (x) => x / 255),
    semantic: header.semantic,
    featureNames: header.featureNames,
    regression: header.regression,
    localDirs: header.localDirs,
    targets,
  };
}

/** Half-layout shape for the given coefficients (missing ones count as 0). */
export function shapeHalf(model: HumanModel, coeffs: ArrayLike<number>, out?: Float32Array): Float32Array {
  const D = model.halfCount * 3;
  const half = out ?? new Float32Array(D);
  half.set(model.mean);
  const K = Math.min(model.components, coeffs.length);
  for (let c = 0; c < K; c++) {
    const w = coeffs[c];
    if (!w) continue;
    const off = c * D;
    const b = model.basis;
    for (let d = 0; d < D; d++) half[d] += w * b[off + d];
  }
  return half;
}

/** Add sparse targets in place. Positive values use the `-incr` sculpt, negative the `-decr` one. */
export function addTargets(model: HumanModel, half: Float32Array, weights: Record<string, number>): Float32Array {
  for (const [name, value] of Object.entries(weights)) {
    if (!value) continue;
    const t = model.targets[`${name}-${value > 0 ? 'incr' : 'decr'}`];
    if (!t) continue;
    const w = Math.abs(value);
    for (let i = 0; i < t.idx.length; i++) {
      const o = t.idx[i] * 3;
      half[o] += w * t.delta[i * 3];
      half[o + 1] += w * t.delta[i * 3 + 1];
      half[o + 2] += w * t.delta[i * 3 + 2];
    }
  }
  return half;
}

/** Full mesh vertex positions (xyz per vertex), multiplied by `scale` (e.g. stature in metres). */
export function expandHalf(model: HumanModel, half: Float32Array, scale = 1, out?: Float32Array): Float32Array {
  const n = model.vertexCount;
  const pos = out ?? new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const h = model.halfIndex[i] * 3;
    const sx = model.mirrored[i] ? -scale : scale;
    pos[i * 3] = half[h] * sx;
    pos[i * 3 + 1] = half[h + 1] * scale;
    pos[i * 3 + 2] = half[h + 2] * scale;
  }
  return pos;
}

/** Named joint positions (both sides), multiplied by `scale`. */
export function jointsOf(model: HumanModel, half: Float32Array, scale = 1): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  model.jointNames.forEach((name, j) => {
    const o = (model.halfVertexCount + j) * 3;
    const p: Vec3 = [half[o] * scale, half[o + 1] * scale, half[o + 2] * scale];
    if (name.endsWith('.L')) {
      out[name] = p;
      out[name.replace(/\.L$/, '.R')] = [-p[0], p[1], p[2]];
    } else if (/\.L\.end$/.test(name)) {
      out[name] = p;
      out[name.replace(/\.L\.end$/, '.R.end')] = [-p[0], p[1], p[2]];
    } else {
      out[name] = [0, p[1], p[2]];
    }
  });
  return out;
}

/** Triangle indices for the full mesh (two triangles per quad). */
export function triangles(model: HumanModel): Uint16Array {
  const q = model.quads;
  const out = new Uint16Array((q.length / 4) * 6);
  for (let i = 0, o = 0; i < q.length; i += 4, o += 6) {
    out[o] = q[i];
    out[o + 1] = q[i + 1];
    out[o + 2] = q[i + 2];
    out[o + 3] = q[i];
    out[o + 4] = q[i + 2];
    out[o + 5] = q[i + 3];
  }
  return out;
}

/** MakeHuman-style sliders (0..1, 0.5 = average) that predict a typical body without a scan. */
export interface SemanticShape {
  /** Years, 25–70. */
  age: number;
  muscle: number;
  weight: number;
  height: number;
  proportions: number;
  breast: number;
}

export const AVERAGE_SHAPE: SemanticShape = {
  age: 30,
  muscle: 0.5,
  weight: 0.5,
  height: 0.5,
  proportions: 0.5,
  breast: 0.5,
};

const ageSlider = (years: number) => 0.5 + (0.5 * (Math.min(90, Math.max(25, years)) - 25)) / 65;

/** Shape coefficients predicted from semantic sliders, optionally plus local sliders (−1..1). */
export function coeffsFromSemantic(
  model: HumanModel,
  s: SemanticShape,
  local: Record<string, number> = {},
): Float32Array {
  const a = ageSlider(s.age);
  const f: Record<string, number> = {
    '1': 1,
    age: a,
    muscle: s.muscle,
    weight: s.weight,
    height: s.height,
    proportions: s.proportions,
    breast: s.breast,
    'muscle^2': s.muscle * s.muscle,
    'weight^2': s.weight * s.weight,
    'muscle*weight': s.muscle * s.weight,
    'height^2': s.height * s.height,
    'weight*height': s.weight * s.height,
  };
  const feats = model.featureNames.map((n) => f[n] ?? 0);
  const out = new Float32Array(model.components);
  for (let c = 0; c < model.components; c++) {
    const r = model.regression[c];
    let v = 0;
    for (let i = 0; i < feats.length; i++) v += r[i] * feats[i];
    out[c] = v;
  }
  for (const [name, value] of Object.entries(local)) {
    const dir = model.localDirs[name];
    if (!dir || !value) continue;
    const d = value > 0 ? dir.incr : dir.decr;
    const w = Math.abs(value);
    for (let c = 0; c < model.components; c++) out[c] += w * d[c];
  }
  return out;
}

export const LOCAL_SLIDERS = [
  'neck-circ',
  'neck-height',
  'upperarm-circ',
  'upperarm-length',
  'lowerarm-length',
  'wrist-circ',
  'frontchest-dist',
  'bust-circ',
  'underbust-circ',
  'waist-circ',
  'napetowaist-dist',
  'waisttohip-dist',
  'shoulder-dist',
  'hips-circ',
  'upperleg-height',
  'thigh-circ',
  'lowerleg-height',
  'knee-circ',
  'calf-circ',
  'ankle-circ',
  'torso-scale-depth',
  'torso-scale-horiz',
  'torso-vshape',
  'torso-muscle-dorsi',
  'torso-muscle-pectoral',
  'hip-scale-depth',
  'hip-scale-horiz',
  'stomach-pregnant',
  'stomach-tone',
  'buttocks-volume',
  'upperarm-fat',
  'upperarm-muscle',
  'upperarm-shoulder-muscle',
  'lowerarm-fat',
  'lowerarm-muscle',
  'upperleg-fat',
  'upperleg-muscle',
  'lowerleg-fat',
  'lowerleg-muscle',
] as const;
