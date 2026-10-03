import { triangles, type HumanModel, type Vec3 } from '../../body3d/human/model';
import { posedJoints, simplePose, skin, solvePose } from '../../body3d/human/pose';
import { PART_INDEX } from '../../body3d/human/sites';
import { CATEGORY, type Landmark, type Mask } from '../types';

/**
 * Synthetic "photos" of a known body for measuring scan accuracy: the posed
 * mesh is rasterised through a pinhole camera into a segmentation mask, and
 * pose landmarks are projected from its joints. No ML model is involved, so
 * this isolates the geometry of the measurement pipeline.
 */

export interface CameraSetup {
  /** Image size in pixels (portrait). */
  width: number;
  height: number;
  /** Focal length in pixels. */
  focal: number;
  /** Camera height above the floor (m). */
  heightM: number;
  /** Distance from the camera to the body's vertical axis (m). */
  distanceM: number;
  /** Downward tilt in radians (0 = phone upright). */
  pitch: number;
}

export interface Projected {
  x: number;
  y: number;
  depth: number;
}

export function project(cam: CameraSetup, p: Vec3): Projected {
  // Camera at (0, h, D) looking along −z, rotated down by `pitch` about x.
  const X = p[0];
  const Y = p[1] - cam.heightM;
  const Z = p[2] - cam.distanceM;
  const c = Math.cos(cam.pitch);
  const s = Math.sin(cam.pitch);
  const y = Y * c - Z * s;
  const z = Y * s + Z * c;
  const depth = -z;
  return {
    x: cam.width / 2 + (cam.focal * X) / depth,
    y: cam.height / 2 - (cam.focal * y) / depth,
    depth,
  };
}

/** Rotate a posed body about the vertical axis so it faces image-right (side photo). */
export function turnToSide(positions: Float32Array): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i + 2];
    out[i + 1] = positions[i + 1];
    out[i + 2] = -positions[i];
  }
  return out;
}
const turnPoint = (p: Vec3): Vec3 => [p[2], p[1], -p[0]];

/** Scanline-free triangle rasteriser (edge functions) into a category mask. */
export function rasterise(
  cam: CameraSetup,
  positions: Float32Array,
  tris: ArrayLike<number>,
  category: (tri: number) => number = () => CATEGORY.bodySkin,
): Mask {
  const { width, height } = cam;
  const data = new Uint8Array(width * height);
  const n = positions.length / 3;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = project(cam, [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
    px[i] = p.x;
    py[i] = p.y;
  }
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t];
    const b = tris[t + 1];
    const c = tris[t + 2];
    const x0 = Math.max(0, Math.floor(Math.min(px[a], px[b], px[c])));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(px[a], px[b], px[c])));
    const y0 = Math.max(0, Math.floor(Math.min(py[a], py[b], py[c])));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(py[a], py[b], py[c])));
    const area = (px[b] - px[a]) * (py[c] - py[a]) - (py[b] - py[a]) * (px[c] - px[a]);
    if (Math.abs(area) < 1e-9) continue;
    const cat = category(t / 3);
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const sx = x + 0.5;
        const w0 = (px[b] - px[a]) * (sy - py[a]) - (py[b] - py[a]) * (sx - px[a]);
        const w1 = (px[c] - px[b]) * (sy - py[b]) - (py[c] - py[b]) * (sx - px[b]);
        const w2 = (px[a] - px[c]) * (sy - py[c]) - (py[a] - py[c]) * (sx - px[c]);
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) data[y * width + x] = cat;
      }
    }
  }
  return { width, height, data };
}

// MediaPipe pose landmark indices we synthesise.
const L = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  mouthL: 9,
  mouthR: 10,
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
  heelL: 29,
  heelR: 30,
  toeL: 31,
  toeR: 32,
};

/** Facial points picked from the mesh: nose tip, ear tips, mouth corners (by geometry, once per body). */
function facePoints(positions: Float32Array, parts: Uint8Array, joints: Record<string, Vec3>) {
  let nose = -1;
  let earL = -1;
  const head = joints['head'];
  const top = joints['head.end'];
  const headH = top[1] - head[1];
  for (let v = 0; v < parts.length; v++) {
    if (parts[v] !== PART_INDEX.head) continue;
    const y = positions[v * 3 + 1];
    if (y < head[1] + 0.1 * headH) continue;
    if (nose < 0 || positions[v * 3 + 2] > positions[nose * 3 + 2]) nose = v;
    if (y > head[1] + 0.25 * headH && y < head[1] + 0.6 * headH) {
      if (earL < 0 || positions[v * 3] > positions[earL * 3]) earL = v;
    }
  }
  const p = (v: number): Vec3 => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
  const n = p(nose);
  const e = p(earL);
  const s = (top[1] - joints['upperleg.L'][1]) / 0.8; // ≈ body scale
  const mouthY = n[1] - 0.04 * s;
  return {
    nose: n,
    earL: e,
    earR: [-e[0], e[1], e[2]] as Vec3,
    mouthL: [0.025 * s, mouthY, n[2] - 0.02 * s] as Vec3,
    mouthR: [-0.025 * s, mouthY, n[2] - 0.02 * s] as Vec3,
  };
}

export interface SynthPhoto {
  mask: Mask;
  landmarks: Landmark[];
}

export interface SynthOptions {
  front: CameraSetup;
  side: CameraSetup;
  /** Std-dev of landmark noise in pixels. */
  landmarkNoisePx?: number;
  /** Arm abduction for the front photo (radians from vertical). */
  frontArms?: number;
  rand?: () => number;
}

/** Posed positions plus joints for a body given in rest space (metres). */
export function posed(model: HumanModel, rest: Float32Array, joints: Record<string, Vec3>, armAbduction: number) {
  const bones = solvePose(model, joints, simplePose(joints, { armAbduction, elbowFlex: 0.05 }));
  return { positions: skin(model, rest, bones), joints: posedJoints(model, joints, bones) };
}

function gaussian(rand: () => number) {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Render a front and a side photo of a body. */
export function photograph(
  model: HumanModel,
  rest: Float32Array,
  joints: Record<string, Vec3>,
  parts: Uint8Array,
  opts: SynthOptions,
): { front: SynthPhoto; side: SynthPhoto } {
  const tris = triangles(model);
  const rand = opts.rand ?? Math.random;
  const noise = opts.landmarkNoisePx ?? 0;
  const jitter = () => (noise ? gaussian(rand) * noise : 0);

  const shoot = (cam: CameraSetup, positions: Float32Array, pts: Record<number, Vec3>, turn: boolean): SynthPhoto => {
    const placed = turn ? turnToSide(positions) : positions;
    const mask = rasterise(cam, placed, tris);
    const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    for (const [i, p] of Object.entries(pts)) {
      const q = project(cam, turn ? turnPoint(p) : p);
      landmarks[Number(i)] = { x: (q.x + jitter()) / cam.width, y: (q.y + jitter()) / cam.height, visibility: 1 };
    }
    return { mask, landmarks };
  };

  const landmarkPoints = (positions: Float32Array, j: Record<string, Vec3>): Record<number, Vec3> => {
    const f = facePoints(positions, parts, j);
    const heel = (s: 'L' | 'R'): Vec3 => [
      j[`ankle.${s}`][0],
      0.02 * (j['head.end'][1] / 1.7),
      j[`ankle.${s}`][2] - 0.05,
    ];
    return {
      [L.nose]: f.nose,
      [L.leftEar]: f.earL,
      [L.rightEar]: f.earR,
      [L.mouthL]: f.mouthL,
      [L.mouthR]: f.mouthR,
      [L.shoulderL]: j['upperarm.L'],
      [L.shoulderR]: j['upperarm.R'],
      [L.elbowL]: j['elbow.L'],
      [L.elbowR]: j['elbow.R'],
      [L.wristL]: j['wrist.L'],
      [L.wristR]: j['wrist.R'],
      [L.hipL]: j['upperleg.L'],
      [L.hipR]: j['upperleg.R'],
      [L.kneeL]: j['knee.L'],
      [L.kneeR]: j['knee.R'],
      [L.ankleL]: j['ankle.L'],
      [L.ankleR]: j['ankle.R'],
      [L.heelL]: heel('L'),
      [L.heelR]: heel('R'),
      [L.toeL]: j['foot.L.end'],
      [L.toeR]: j['foot.R.end'],
    };
  };

  const fp = posed(model, rest, joints, opts.frontArms ?? 0.6);
  const sp = posed(model, rest, joints, 0.12);
  return {
    front: shoot(opts.front, fp.positions, landmarkPoints(fp.positions, fp.joints), false),
    side: shoot(opts.side, sp.positions, landmarkPoints(sp.positions, sp.joints), true),
  };
}

/** Nearest-neighbour down- and up-sampling, mimicking a low-resolution segmentation model. */
export function degradeMask(mask: Mask, modelSize = 256): Mask {
  const small = new Uint8Array(modelSize * modelSize);
  for (let y = 0; y < modelSize; y++) {
    for (let x = 0; x < modelSize; x++) {
      const sx = Math.min(mask.width - 1, Math.floor(((x + 0.5) * mask.width) / modelSize));
      const sy = Math.min(mask.height - 1, Math.floor(((y + 0.5) * mask.height) / modelSize));
      small[y * modelSize + x] = mask.data[sy * mask.width + sx];
    }
  }
  const data = new Uint8Array(mask.width * mask.height);
  for (let y = 0; y < mask.height; y++) {
    const sy = Math.min(modelSize - 1, Math.floor((y * modelSize) / mask.height));
    for (let x = 0; x < mask.width; x++) {
      const sx = Math.min(modelSize - 1, Math.floor((x * modelSize) / mask.width));
      data[y * mask.width + x] = small[sy * modelSize + sx];
    }
  }
  return { width: mask.width, height: mask.height, data };
}

/** Grow (px > 0) or shrink (px < 0) the person region by whole pixels, like a biased segmenter. */
export function biasMask(mask: Mask, px: number): Mask {
  let cur = mask;
  for (let i = 0; i < Math.abs(px); i++) {
    const grow = px > 0;
    const data = new Uint8Array(cur.data);
    for (let y = 1; y < cur.height - 1; y++) {
      for (let x = 1; x < cur.width - 1; x++) {
        const o = y * cur.width + x;
        const on = cur.data[o] !== CATEGORY.background;
        const n4 = [o - 1, o + 1, o - cur.width, o + cur.width];
        if (grow && !on) {
          const hit = n4.find((k) => cur.data[k] !== CATEGORY.background);
          if (hit !== undefined) data[o] = cur.data[hit];
        } else if (!grow && on && n4.some((k) => cur.data[k] === CATEGORY.background)) {
          data[o] = CATEGORY.background;
        }
      }
    }
    cur = { width: cur.width, height: cur.height, data };
  }
  return cur;
}
