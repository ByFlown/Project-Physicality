#!/usr/bin/env node
/**
 * Bake the realistic body model from MakeHuman's CC0 assets.
 *
 * MakeHuman (http://www.makehumancommunity.org) ships a base mesh plus
 * hundreds of sculpted "targets" (vertex offsets) that blend into any adult
 * body. Its assets were released as CC0 in September 2020; its code is AGPL
 * and is not used here — this script only reads the data files.
 *
 * Shipping the raw targets would cost >100 MB, so we sample a population of
 * plausible adult bodies per sex (macro sliders + local measurement sliders),
 * normalise each to a stature of 1, and keep the principal components —
 * the same idea as SMPL's shape space, but built from CC0 data. The mesh is
 * exactly left/right symmetric, so only one half is stored.
 *
 * Usage:
 *   git clone https://github.com/makehumancommunity/makehuman.git
 *   (cd makehuman && git checkout a8bc2d54ff0ac92e78ff71431b1023eda42bf482)
 *   node scripts/bake-body-model.mjs path/to/makehuman
 *
 * Output: src/body3d/human/assets/human-{male,female}.bin (committed).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MH = process.argv[2] ?? process.env.MAKEHUMAN_DIR;
if (!MH) {
  console.error('Usage: node scripts/bake-body-model.mjs <makehuman checkout>');
  process.exit(1);
}
const DATA = join(MH, 'makehuman', 'data');
const OUT = new URL('../src/body3d/human/assets/', import.meta.url);
const MAKEHUMAN_COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';

const K = 48; // shape components kept
const POPULATION = 900;
const VERSION = 1;

// ------------------------------------------------------------------ helpers

/** Deterministic PRNG (mulberry32) so bakes are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand) {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ------------------------------------------------------------------ base mesh

const obj = readFileSync(join(DATA, '3dobjs', 'base.obj'), 'utf8').split('\n');
const baseAll = [];
const quads = [];
let group = '';
for (const line of obj) {
  if (line.startsWith('v ')) baseAll.push(line.split(/\s+/).slice(1, 4).map(Number));
  else if (line.startsWith('g ')) group = line.slice(2).trim();
  else if (line.startsWith('f ') && group === 'body') {
    const idx = line
      .trim()
      .split(/\s+/)
      .slice(1)
      .map((t) => Number(t.split('/')[0]) - 1);
    if (idx.length !== 4) throw new Error('Expected quads in the body group');
    quads.push(idx);
  }
}
const NV = baseAll.length;
const NB = Math.max(...quads.flat()) + 1; // body vertices come first
console.log(`base mesh: ${NV} vertices, ${NB} body vertices, ${quads.length} quads`);

// Mirror map: body vertex → its mirror (x → −x).
const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
const byPos = new Map();
for (let i = 0; i < NB; i++) byPos.set(key(baseAll[i]), i);
const mirrorOf = new Int32Array(NB);
for (let i = 0; i < NB; i++) {
  const m = byPos.get(key([-baseAll[i][0], baseAll[i][1], baseAll[i][2]]));
  if (m === undefined) throw new Error(`No mirror for vertex ${i}`);
  mirrorOf[i] = m;
}

// ------------------------------------------------------------------ skeleton

const skel = JSON.parse(readFileSync(join(DATA, 'rigs', 'default.mhskel'), 'utf8'));
const jointVerts = (name) => {
  const v = skel.joints[name];
  if (!v) throw new Error(`Unknown joint ${name}`);
  return v;
};

/**
 * Simplified skeleton: 19 bones. `from` lists the MakeHuman bones whose skin
 * weights merge into it; any bone not listed merges into its nearest listed ancestor.
 */
const BONES = [
  { name: 'pelvis', parent: null, head: 'spine05____head', from: ['root', 'pelvis.L', 'pelvis.R', 'spine05'] },
  { name: 'spineLow', parent: 'pelvis', head: 'spine04____head', from: ['spine04', 'spine03'] },
  { name: 'spineHigh', parent: 'spineLow', head: 'spine02____head', from: ['spine02', 'spine01'] },
  { name: 'neck', parent: 'spineHigh', head: 'neck01____head', from: ['neck01', 'neck02', 'neck03'] },
  { name: 'head', parent: 'neck', head: 'head____head', tail: 'head____tail', from: ['head'] },
];
for (const s of ['L', 'R']) {
  BONES.push(
    {
      name: `clavicle.${s}`,
      parent: 'spineHigh',
      head: `clavicle.${s}____head`,
      from: [`clavicle.${s}`, `shoulder01.${s}`],
    },
    {
      name: `upperarm.${s}`,
      parent: `clavicle.${s}`,
      head: `upperarm01.${s}____head`,
      from: [`upperarm01.${s}`, `upperarm02.${s}`],
    },
    {
      name: `lowerarm.${s}`,
      parent: `upperarm.${s}`,
      head: `lowerarm01.${s}____head`,
      from: [`lowerarm01.${s}`, `lowerarm02.${s}`],
    },
    {
      name: `hand.${s}`,
      parent: `lowerarm.${s}`,
      head: `wrist.${s}____head`,
      tail: `finger3-3.${s}____tail`,
      from: [`wrist.${s}`],
    },
    {
      name: `upperleg.${s}`,
      parent: 'pelvis',
      head: `upperleg01.${s}____head`,
      from: [`upperleg01.${s}`, `upperleg02.${s}`],
    },
    {
      name: `lowerleg.${s}`,
      parent: `upperleg.${s}`,
      head: `lowerleg01.${s}____head`,
      from: [`lowerleg01.${s}`, `lowerleg02.${s}`],
    },
    {
      name: `foot.${s}`,
      parent: `lowerleg.${s}`,
      head: `foot.${s}____head`,
      tail: `foot.${s}____tail`,
      from: [`foot.${s}`],
    },
  );
}
// Named joint points (centroids of MakeHuman's joint helpers) baked into the shape space.
const JOINTS = [];
for (const b of BONES) {
  JOINTS.push({ name: b.name, verts: jointVerts(b.head) });
  if (b.tail) JOINTS.push({ name: `${b.name}.end`, verts: jointVerts(b.tail) });
}
// Extra points: elbow / wrist / knee / ankle as bone *tails*, which differ slightly from child heads.
for (const s of ['L', 'R']) {
  JOINTS.push({ name: `elbow.${s}`, verts: jointVerts(`upperarm02.${s}____tail`) });
  JOINTS.push({ name: `wrist.${s}`, verts: jointVerts(`lowerarm02.${s}____tail`) });
  JOINTS.push({ name: `knee.${s}`, verts: jointVerts(`upperleg02.${s}____tail`) });
  JOINTS.push({ name: `ankle.${s}`, verts: jointVerts(`lowerleg02.${s}____tail`) });
}
const jointIndex = new Map(JOINTS.map((j, i) => [j.name, i]));
const centroid = (positions, verts) => {
  const c = [0, 0, 0];
  for (const v of verts) for (let k = 0; k < 3; k++) c[k] += positions[v * 3 + k];
  return c.map((x) => x / verts.length);
};

// Skin weights → simplified bones, top 4 per vertex.
const mhw = JSON.parse(readFileSync(join(DATA, 'rigs', 'default_weights.mhw'), 'utf8')).weights;
const boneIndex = new Map(BONES.map((b, i) => [b.name, i]));
const mapBone = (mh) => {
  for (let name = mh; name; name = skel.bones[name]?.parent) {
    const hit = BONES.find((b) => b.from.includes(name));
    if (hit) return boneIndex.get(hit.name);
  }
  return 0;
};
const vertexWeights = Array.from({ length: NB }, () => new Map());
for (const [mhBone, list] of Object.entries(mhw)) {
  const b = mapBone(mhBone);
  for (const [v, w] of list) {
    if (v >= NB) continue;
    const m = vertexWeights[v];
    m.set(b, (m.get(b) ?? 0) + w);
  }
}
const skinIndex = new Uint8Array(NB * 4);
const skinWeight = new Uint8Array(NB * 4);
for (let v = 0; v < NB; v++) {
  const top = [...vertexWeights[v].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (top.length === 0) top.push([0, 1]);
  const total = top.reduce((s, [, w]) => s + w, 0);
  // Quantise to bytes that sum to exactly 255; the rounding remainder goes to the heaviest bone.
  const q = top.map(([, w]) => Math.floor((w / total) * 255));
  q[0] += 255 - q.reduce((a, b) => a + b, 0);
  top.forEach(([b], i) => {
    skinIndex[v * 4 + i] = b;
    skinWeight[v * 4 + i] = q[i];
  });
}

// ------------------------------------------------------------------ targets

const targetCache = new Map();
/** Sparse target as parallel arrays (indices, xyz deltas), restricted to body + joint helper vertices. */
function target(name) {
  let t = targetCache.get(name);
  if (t) return t;
  const path = join(DATA, 'targets', `${name}.target`);
  const idx = [];
  const d = [];
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!/^\d/.test(line)) continue;
      const p = line.trim().split(/\s+/);
      idx.push(Number(p[0]));
      d.push(Number(p[1]), Number(p[2]), Number(p[3]));
    }
  } else if (!/universal-.*-averagemuscle-averageweight/.test(name)) {
    throw new Error(`Missing target ${name}`);
  }
  t = { idx: Int32Array.from(idx), d: Float64Array.from(d) };
  targetCache.set(name, t);
  return t;
}
function addTarget(positions, name, w) {
  if (!w) return;
  const t = target(name);
  for (let i = 0; i < t.idx.length; i++) {
    const v = t.idx[i] * 3;
    positions[v] += w * t.d[i * 3];
    positions[v + 1] += w * t.d[i * 3 + 1];
    positions[v + 2] += w * t.d[i * 3 + 2];
  }
}

// Macro sliders, MakeHuman semantics (0..1, 0.5 = average).
const tri = (v) => {
  const max = Math.max(0, v * 2 - 1);
  const min = Math.max(0, 1 - v * 2);
  return { min, average: 1 - min - max, max };
};
const ends = (v) => ({ min: Math.max(0, 1 - v * 2), max: Math.max(0, v * 2 - 1) });

/** Local sliders (−1..1), merged symmetrically, randomised in the population. */
const LOCAL = [
  ...[
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
  ].map((n) => ({ name: n, files: [`measure/measure-${n}`] })),
  ...['torso-scale-depth', 'torso-scale-horiz', 'torso-vshape', 'torso-muscle-dorsi', 'torso-muscle-pectoral'].map(
    (n) => ({ name: n, files: [`torso/${n}`] }),
  ),
  { name: 'hip-scale-depth', files: ['hip/hip-scale-depth'] },
  { name: 'hip-scale-horiz', files: ['hip/hip-scale-horiz'] },
  { name: 'stomach-pregnant', files: ['stomach/stomach-pregnant'] },
  { name: 'stomach-tone', files: ['stomach/stomach-tone'] },
  { name: 'buttocks-volume', files: ['buttocks/buttocks-volume'] },
  ...[
    'upperarm-fat',
    'upperarm-muscle',
    'upperarm-shoulder-muscle',
    'lowerarm-fat',
    'lowerarm-muscle',
    'upperleg-fat',
    'upperleg-muscle',
    'lowerleg-fat',
    'lowerleg-muscle',
  ].map((n) => ({ name: n, files: [`armslegs/l-${n}`, `armslegs/r-${n}`] })),
];
/** Local sliders also shipped as exact sparse targets (muscle growth and fat on the realistic model). */
const SHIPPED_TARGETS = [
  'upperarm-muscle',
  'upperarm-shoulder-muscle',
  'lowerarm-muscle',
  'upperleg-muscle',
  'lowerleg-muscle',
  'torso-muscle-pectoral',
  'torso-muscle-dorsi',
  'buttocks-volume',
  'stomach-tone',
  'stomach-pregnant',
  'upperarm-fat',
  'lowerarm-fat',
  'upperleg-fat',
  'lowerleg-fat',
];

/** MakeHuman age slider from years (0.5 = 25 y, 1 = 90 y). */
const ageSlider = (years) => 0.5 + (0.5 * (clamp(years, 25, 90) - 25)) / 65;

function buildBody(sex, p) {
  const pos = new Float64Array(NV * 3);
  for (let i = 0; i < NV; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = baseAll[i][k];
  const old = Math.max(0, p.age * 2 - 1);
  const ages = { young: 1 - old, old };
  const mu = tri(p.muscle);
  const we = tri(p.weight);
  const he = ends(p.height);
  const pr = { ideal: Math.max(0, p.proportions * 2 - 1), uncommon: Math.max(0, 1 - p.proportions * 2) };
  const br = ends(p.breast);
  for (const [age, aw] of Object.entries(ages)) {
    if (!aw) continue;
    for (const e of ['african', 'asian', 'caucasian']) addTarget(pos, `macrodetails/${e}-${sex}-${age}`, aw / 3);
    for (const [m, mw] of Object.entries(mu)) {
      for (const [w, ww] of Object.entries(we)) {
        const k = aw * mw * ww;
        if (!k) continue;
        const stem = `${sex}-${age}-${m}muscle-${w}weight`;
        addTarget(pos, `macrodetails/universal-${stem}`, k);
        for (const [h, hw] of Object.entries(he)) addTarget(pos, `macrodetails/height/${stem}-${h}height`, k * hw);
        for (const [q, qw] of Object.entries(pr))
          addTarget(pos, `macrodetails/proportions/${stem}-${q}proportions`, k * qw);
        if (sex === 'female') {
          for (const [c, cw] of Object.entries(br)) addTarget(pos, `breast/${stem}-${c}cup-averagefirmness`, k * cw);
        }
      }
    }
  }
  for (const l of LOCAL) {
    const v = p.local[l.name] ?? 0;
    for (const f of l.files) addTarget(pos, `${f}-${v < 0 ? 'decr' : 'incr'}`, Math.abs(v));
  }
  return pos;
}

// ------------------------------------------------------------------ normalisation & half layout

// Half = body vertices with x ≥ 0 (centre line included), then centre and left (.L) joints.
const halfVerts = [];
const halfOf = new Int32Array(NB).fill(-1);
for (let i = 0; i < NB; i++) {
  if (baseAll[i][0] >= -1e-6) {
    halfOf[i] = halfVerts.length;
    halfVerts.push(i);
  }
}
const isCentre = (i) => Math.abs(baseAll[i][0]) < 1e-6;
const halfJoints = JOINTS.filter((j) => !/\.R(\.end)?$/.test(j.name));
const H = halfVerts.length + halfJoints.length;
const D = H * 3;
console.log(`half layout: ${halfVerts.length} vertices + ${halfJoints.length} joints`);

/** Stature-normalised half vector: feet at y = 0, stature 1, hip joints at z = 0. */
function normalise(pos) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < NB; i++) {
    const y = pos[i * 3 + 1];
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const s = 1 / (hi - lo);
  const hipL = centroid(pos, JOINTS[jointIndex.get('upperleg.L')].verts);
  const hipR = centroid(pos, JOINTS[jointIndex.get('upperleg.R')].verts);
  const z0 = (hipL[2] + hipR[2]) / 2;
  const out = new Float64Array(D);
  // Symmetrise: average each half vertex with the mirror of its partner.
  halfVerts.forEach((v, h) => {
    const m = mirrorOf[v];
    const x = isCentre(v) ? 0 : (pos[v * 3] - pos[m * 3]) / 2;
    out[h * 3] = x * s;
    out[h * 3 + 1] = ((pos[v * 3 + 1] + pos[m * 3 + 1]) / 2 - lo) * s;
    out[h * 3 + 2] = ((pos[v * 3 + 2] + pos[m * 3 + 2]) / 2 - z0) * s;
  });
  halfJoints.forEach((j, h) => {
    const c = centroid(pos, j.verts);
    const mirrorName = /\.L(\.end)?$/.test(j.name) ? j.name.replace(/\.L(\.end)?$/, '.R$1') : null;
    const m = mirrorName ? centroid(pos, JOINTS[jointIndex.get(mirrorName)].verts) : [-c[0], c[1], c[2]];
    const o = (halfVerts.length + h) * 3;
    out[o] = ((c[0] - m[0]) / 2) * s;
    out[o + 1] = ((c[1] + m[1]) / 2 - lo) * s;
    out[o + 2] = ((c[2] + m[2]) / 2 - z0) * s;
  });
  return { vec: out, stature: hi - lo };
}

// ------------------------------------------------------------------ linear algebra

/** Jacobi eigen-decomposition of a small symmetric matrix (row-major n×n). */
function jacobiEigen(A, n) {
  const a = Float64Array.from(A);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p];
          const vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = Array.from({ length: n }, (_, i) => a[i * n + i]);
  const order = values.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
  return {
    values: order.map(([v]) => v),
    vectors: order.map(([, i]) => Float64Array.from({ length: n }, (_, k) => V[k * n + i])),
  };
}

/** Top-k principal directions of the centred rows of X (N×D) via the Gram matrix and subspace iteration. */
function pca(rows, k) {
  const N = rows.length;
  const G = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    const ri = rows[i];
    for (let j = i; j < N; j++) {
      const rj = rows[j];
      let s = 0;
      for (let d = 0; d < D; d++) s += ri[d] * rj[d];
      G[i * N + j] = s;
      G[j * N + i] = s;
    }
  }
  const m = k + 16;
  const rand = rng(7);
  let Q = Array.from({ length: m }, () => Float64Array.from({ length: N }, () => gaussian(rand)));
  const orthonormalise = (cols) => {
    for (let a = 0; a < cols.length; a++) {
      for (let b = 0; b < a; b++) {
        let dot = 0;
        for (let i = 0; i < N; i++) dot += cols[a][i] * cols[b][i];
        for (let i = 0; i < N; i++) cols[a][i] -= dot * cols[b][i];
      }
      let n = 0;
      for (let i = 0; i < N; i++) n += cols[a][i] ** 2;
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < N; i++) cols[a][i] /= n;
    }
    return cols;
  };
  const mul = (col) => {
    const out = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < N; j++) s += G[i * N + j] * col[j];
      out[i] = s;
    }
    return out;
  };
  Q = orthonormalise(Q);
  for (let it = 0; it < 60; it++) Q = orthonormalise(Q.map(mul));
  // Rayleigh–Ritz.
  const GQ = Q.map(mul);
  const T = new Float64Array(m * m);
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < m; b++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += Q[a][i] * GQ[b][i];
      T[a * m + b] = s;
    }
  }
  const { values, vectors } = jacobiEigen(T, m);
  const comps = [];
  const sigmas = [];
  for (let c = 0; c < k; c++) {
    const u = new Float64Array(N);
    for (let a = 0; a < m; a++) for (let i = 0; i < N; i++) u[i] += vectors[c][a] * Q[a][i];
    const sv = Math.sqrt(Math.max(values[c], 1e-30));
    const dir = new Float64Array(D);
    for (let i = 0; i < N; i++) {
      const w = u[i] / sv;
      const r = rows[i];
      for (let d = 0; d < D; d++) dir[d] += w * r[d];
    }
    comps.push(dir);
    sigmas.push(sv / Math.sqrt(N - 1)); // std-dev of the coefficient across the population
  }
  return { comps, sigmas };
}

/** Least squares via normal equations (small systems). */
function lstsq(F, y) {
  const n = F[0].length;
  const A = new Float64Array(n * n);
  const b = new Float64Array(n);
  for (let r = 0; r < F.length; r++) {
    for (let i = 0; i < n; i++) {
      b[i] += F[r][i] * y[r];
      for (let j = 0; j < n; j++) A[i * n + j] += F[r][i] * F[r][j];
    }
  }
  for (let i = 0; i < n; i++) A[i * n + i] += 1e-9;
  // Gaussian elimination.
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    for (let k = 0; k < n; k++) [A[c * n + k], A[p * n + k]] = [A[p * n + k], A[c * n + k]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / A[c * n + c];
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    x[r] = s / A[r * n + r];
  }
  return Array.from(x);
}

// ------------------------------------------------------------------ binary writer

class Writer {
  constructor() {
    this.chunks = [];
    this.offset = 0;
    this.blocks = {};
  }
  add(name, typed) {
    const pad = (4 - (this.offset % 4)) % 4;
    if (pad) {
      this.chunks.push(new Uint8Array(pad));
      this.offset += pad;
    }
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    this.blocks[name] = { offset: this.offset, length: typed.length, type: typed.constructor.name };
    this.chunks.push(bytes.slice());
    this.offset += bytes.length;
  }
  finish(header) {
    const json = new TextEncoder().encode(JSON.stringify({ ...header, blocks: this.blocks }));
    const pre = 12 + json.length;
    const pad = (4 - (pre % 4)) % 4;
    const head = new Uint8Array(pre + pad);
    head.set(new TextEncoder().encode('PHB1'), 0);
    new DataView(head.buffer).setUint32(4, json.length, true);
    new DataView(head.buffer).setUint32(8, pre + pad, true); // data start
    head.set(json, 12);
    const total = head.length + this.offset;
    const out = new Uint8Array(total);
    out.set(head, 0);
    let o = head.length;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

/** int8 quantisation with one scale per row. */
function quantise(rows) {
  const len = rows[0].length;
  const q = new Int8Array(rows.length * len);
  const scales = new Float32Array(rows.length);
  rows.forEach((r, i) => {
    let max = 0;
    for (const v of r) max = Math.max(max, Math.abs(v));
    const s = max / 127 || 1;
    scales[i] = s;
    for (let d = 0; d < len; d++) q[i * len + d] = Math.round(r[d] / s);
  });
  return { q, scales };
}

// ------------------------------------------------------------------ bake

const SEMANTIC = ['age', 'muscle', 'weight', 'height', 'proportions', 'breast'];
const features = (p) => [
  1,
  p.age,
  p.muscle,
  p.weight,
  p.height,
  p.proportions,
  p.breast,
  p.muscle * p.muscle,
  p.weight * p.weight,
  p.muscle * p.weight,
  p.height * p.height,
  p.weight * p.height,
];
const FEATURE_NAMES = [
  '1',
  'age',
  'muscle',
  'weight',
  'height',
  'proportions',
  'breast',
  'muscle^2',
  'weight^2',
  'muscle*weight',
  'height^2',
  'weight*height',
];

const baseStature = (() => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < NB; i++) {
    lo = Math.min(lo, baseAll[i][1]);
    hi = Math.max(hi, baseAll[i][1]);
  }
  return hi - lo;
})();

mkdirSync(OUT, { recursive: true });

for (const sex of ['male', 'female']) {
  const t0 = Date.now();
  const rand = rng(sex === 'male' ? 1 : 2);
  const params = [];
  const vecs = [];
  const statures = [];
  for (let n = 0; n < POPULATION; n++) {
    const p = {
      age: ageSlider(25 + rand() * 45),
      muscle: 0.15 + rand() * 0.85,
      weight: 0.1 + rand() * 0.9,
      height: rand(),
      proportions: 0.25 + rand() * 0.75,
      breast: sex === 'female' ? 0.15 + rand() * 0.8 : 0.5,
      local: Object.fromEntries(LOCAL.map((l) => [l.name, clamp(gaussian(rand) * 0.35, -1, 1)])),
    };
    const { vec, stature } = normalise(buildBody(sex, p));
    params.push(p);
    vecs.push(vec);
    statures.push(stature);
  }
  const mean = new Float64Array(D);
  for (const v of vecs) for (let d = 0; d < D; d++) mean[d] += v[d] / POPULATION;
  const centred = vecs.map((v) => v.map((x, d) => x - mean[d]));
  const train = centred.slice(0, POPULATION - 100);
  const test = centred.slice(POPULATION - 100);
  const { comps, sigmas } = pca(train, K);
  const { q, scales } = quantise(comps);
  const deq = comps.map((_, c) => Float64Array.from({ length: D }, (_, d) => q[c * D + d] * scales[c]));

  // Reconstruction error on held-out bodies (mm at 1.8 m stature).
  let sq = 0;
  let max = 0;
  let count = 0;
  for (const v of test) {
    const coef = deq.map((b) => {
      let s = 0;
      for (let d = 0; d < D; d++) s += b[d] * v[d];
      return s;
    });
    for (let h = 0; h < halfVerts.length; h++) {
      let e2 = 0;
      for (let k = 0; k < 3; k++) {
        let r = v[h * 3 + k];
        for (let c = 0; c < K; c++) r -= coef[c] * deq[c][h * 3 + k];
        e2 += r * r;
      }
      const e = Math.sqrt(e2) * 1800;
      sq += e * e;
      max = Math.max(max, e);
      count++;
    }
  }
  console.log(`${sex}: PCA reconstruction rms ${Math.sqrt(sq / count).toFixed(2)} mm, max ${max.toFixed(1)} mm`);

  // Regression: semantic sliders → shape coefficients (used when there is no scan yet).
  const coefOf = (v) =>
    deq.map((b) => {
      let s = 0;
      for (let d = 0; d < D; d++) s += b[d] * v[d];
      return s;
    });
  const allCoefs = centred.map(coefOf);
  const F = params.map(features);
  const regression = [];
  for (let c = 0; c < K; c++)
    regression.push(
      lstsq(
        F,
        allCoefs.map((a) => a[c]),
      ),
    );

  // Local slider directions in shape space: Δcoef for slider = ±1 on an average body.
  const avg = { age: ageSlider(30), muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5, breast: 0.5 };
  const ref = normalise(buildBody(sex, { ...avg, local: {} })).vec.map((x, d) => x - mean[d]);
  const refCoef = coefOf(ref);
  const localDirs = {};
  for (const l of LOCAL) {
    const plus = coefOf(normalise(buildBody(sex, { ...avg, local: { [l.name]: 1 } })).vec.map((x, d) => x - mean[d]));
    const minus = coefOf(normalise(buildBody(sex, { ...avg, local: { [l.name]: -1 } })).vec.map((x, d) => x - mean[d]));
    localDirs[l.name] = {
      incr: plus.map((x, c) => +(x - refCoef[c]).toPrecision(5)),
      decr: minus.map((x, c) => +(x - refCoef[c]).toPrecision(5)),
    };
  }

  // Exact sparse targets for muscle/fat display, half layout, stature-normalised.
  const w = new Writer();
  const targetsMeta = {};
  for (const name of SHIPPED_TARGETS) {
    const l = LOCAL.find((x) => x.name === name);
    for (const dir of ['incr', 'decr']) {
      const delta = new Float64Array(NB * 3);
      for (const f of l.files) {
        const t = target(`${f}-${dir}`);
        for (let i = 0; i < t.idx.length; i++) {
          if (t.idx[i] >= NB) continue;
          for (let k = 0; k < 3; k++) delta[t.idx[i] * 3 + k] += t.d[i * 3 + k] / baseStature;
        }
      }
      const idx = [];
      const vals = [];
      halfVerts.forEach((v, h) => {
        const m = mirrorOf[v];
        const dx = isCentre(v) ? 0 : (delta[v * 3] - delta[m * 3]) / 2;
        const dy = (delta[v * 3 + 1] + delta[m * 3 + 1]) / 2;
        const dz = (delta[v * 3 + 2] + delta[m * 3 + 2]) / 2;
        if (Math.hypot(dx, dy, dz) * 1800 < 0.05) return; // drop < 0.05 mm
        idx.push(h);
        vals.push(dx, dy, dz);
      });
      let mx = 0;
      for (const x of vals) mx = Math.max(mx, Math.abs(x));
      const s = mx / 127 || 1;
      const id = `${name}-${dir}`;
      w.add(`t:${id}:idx`, Uint16Array.from(idx));
      w.add(
        `t:${id}:d`,
        Int8Array.from(vals, (x) => Math.round(x / s)),
      );
      targetsMeta[id] = { scale: s, count: idx.length };
    }
  }

  // Mesh topology and the half → full mapping.
  const halfIndex = new Uint16Array(NB);
  const mirrored = new Uint8Array(NB);
  for (let i = 0; i < NB; i++) {
    if (halfOf[i] >= 0) halfIndex[i] = halfOf[i];
    else {
      halfIndex[i] = halfOf[mirrorOf[i]];
      mirrored[i] = 1;
    }
  }
  w.add('mean', Float32Array.from(mean));
  w.add('basis', q);
  w.add('basisScale', scales);
  w.add('quads', Uint16Array.from(quads.flat()));
  w.add('halfIndex', halfIndex);
  w.add('mirrored', mirrored);
  w.add('skinIndex', skinIndex);
  w.add('skinWeight', skinWeight);

  const header = {
    format: 'physicality-human',
    version: VERSION,
    sex,
    source: `MakeHuman assets (CC0), commit ${MAKEHUMAN_COMMIT}`,
    vertexCount: NB,
    halfVertexCount: halfVerts.length,
    components: K,
    sigmas: sigmas.map((x) => +x.toPrecision(6)),
    joints: halfJoints.map((j) => j.name),
    bones: BONES.map((b) => ({ name: b.name, parent: b.parent })),
    semantic: SEMANTIC,
    featureNames: FEATURE_NAMES,
    regression: regression.map((r) => r.map((x) => +x.toPrecision(6))),
    localDirs,
    targets: targetsMeta,
    meanStatureDm: statures.reduce((a, b) => a + b, 0) / statures.length,
  };
  const bytes = w.finish(header);
  writeFileSync(new URL(`human-${sex}.bin`, OUT), bytes);
  console.log(`${sex}: wrote ${(bytes.length / 1024).toFixed(0)} KiB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
