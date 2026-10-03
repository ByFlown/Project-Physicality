import type { HumanModel, Vec3 } from './model';

/**
 * Linear blend skinning for the baked body. Bones rotate about their rest
 * head joint; a pose is a set of per-bone rotations (quaternions) applied
 * down the hierarchy. The rest pose is MakeHuman's A-pose: arms ~40° out,
 * elbows slightly bent forward.
 */

export type Quat = [number, number, number, number]; // x, y, z, w

const IDENTITY: Quat = [0, 0, 0, 1];

export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const n = Math.hypot(...axis) || 1;
  const s = Math.sin(angle / 2) / n;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Shortest-arc rotation taking direction `a` to direction `b`. */
export function quatFromTo(a: Vec3, b: Vec3): Quat {
  const na = Math.hypot(...a) || 1;
  const nb = Math.hypot(...b) || 1;
  const u: Vec3 = [a[0] / na, a[1] / na, a[2] / na];
  const v: Vec3 = [b[0] / nb, b[1] / nb, b[2] / nb];
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.999999) {
    const axis: Vec3 = Math.abs(u[0]) < 0.9 ? [0, -u[2], u[1]] : [-u[2], 0, u[0]];
    return quatAxisAngle(axis, Math.PI);
  }
  const c: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Per-bone world rotation and the translation that goes with it (rest → posed). */
export interface BoneTransform {
  q: Quat;
  /** posed = rotate(q, rest - head) + headPosed */
  head: Vec3;
  headPosed: Vec3;
}

/** Joint positions keyed by bone name: the bone's head. */
export function boneHeads(joints: Record<string, Vec3>, model: HumanModel): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  for (const b of model.bones) out[b.name] = joints[b.name];
  return out;
}

/** World transforms for local rotations `local` (bone name → quaternion in world-aligned rest frame). */
export function solvePose(
  model: HumanModel,
  joints: Record<string, Vec3>,
  local: Record<string, Quat>,
): BoneTransform[] {
  const index = new Map(model.bones.map((b, i) => [b.name, i]));
  const out: BoneTransform[] = [];
  model.bones.forEach((b) => {
    const head = joints[b.name];
    const parent = b.parent ? out[index.get(b.parent)!] : null;
    const parentQ = parent ? parent.q : IDENTITY;
    const headPosed = parent ? add(rotate(parent.q, sub(head, parent.head)), parent.headPosed) : head;
    out.push({ q: quatMul(parentQ, local[b.name] ?? IDENTITY), head, headPosed });
  });
  return out;
}

/** Skin positions (xyz per vertex) with the given bone transforms. Normals can be recomputed after. */
export function skin(model: HumanModel, rest: Float32Array, bones: BoneTransform[], out?: Float32Array): Float32Array {
  const n = model.vertexCount;
  const pos = out ?? new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const p: Vec3 = [rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 4; k++) {
      const w = model.skinWeight[v * 4 + k];
      if (!w) continue;
      const b = bones[model.skinIndex[v * 4 + k]];
      const r = rotate(b.q, sub(p, b.head));
      x += w * (r[0] + b.headPosed[0]);
      y += w * (r[1] + b.headPosed[1]);
      z += w * (r[2] + b.headPosed[2]);
    }
    pos[v * 3] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;
  }
  return pos;
}

/** Posed joint positions (any named joint, carried by the given bone). */
export function poseJoint(bones: BoneTransform[], boneIndex: number, rest: Vec3): Vec3 {
  const b = bones[boneIndex];
  return add(rotate(b.q, sub(rest, b.head)), b.headPosed);
}

/** A simple, photo-friendly pose: straight limbs at given abduction angles (radians from vertical). */
export interface SimplePose {
  /** Upper-arm abduction in the coronal plane. */
  armAbduction: number;
  /** Elbow flexion, forward. 0 = straight. */
  elbowFlex?: number;
  /** Leg abduction. */
  legAbduction?: number;
}

/**
 * Local rotations for a SimplePose, applied symmetrically. Arms are aimed so
 * the upper arm points `armAbduction` from straight down within the coronal
 * plane, with the forearm continuing in line (minus `elbowFlex`).
 */
export function simplePose(joints: Record<string, Vec3>, p: SimplePose): Record<string, Quat> {
  const out: Record<string, Quat> = {};
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    const shoulder = joints[`upperarm.${s}`];
    const elbow = joints[`lowerarm.${s}`];
    const wrist = joints[`hand.${s}`];
    const upperDir: Vec3 = [sign * Math.sin(p.armAbduction), -Math.cos(p.armAbduction), 0];
    const qUpper = quatFromTo(sub(elbow, shoulder), upperDir);
    out[`upperarm.${s}`] = qUpper;
    // Forearm: aim (in world) along the upper arm, bent forward by elbowFlex.
    const flex = p.elbowFlex ?? 0;
    // Flexion axis = upperDir × forward, so a positive angle swings the forearm toward +z.
    const target = rotate(quatAxisAngle([upperDir[1], -upperDir[0], 0], flex), upperDir);
    const restFore = sub(wrist, elbow);
    const foreAfterParent = rotate(qUpper, restFore);
    // Local rotation in world-aligned frame: q_world = qUpper * q_local → q_local = qUpper⁻¹ * q(fore→target) * qUpper
    const qWorldFix = quatFromTo(foreAfterParent, target);
    const inv: Quat = [-qUpper[0], -qUpper[1], -qUpper[2], qUpper[3]];
    out[`lowerarm.${s}`] = quatMul(inv, quatMul(qWorldFix, qUpper));
    if (p.legAbduction !== undefined) {
      const hip = joints[`upperleg.${s}`];
      const knee = joints[`lowerleg.${s}`];
      const legDir: Vec3 = [sign * Math.sin(p.legAbduction), -Math.cos(p.legAbduction), 0];
      const qLeg = quatFromTo(sub(knee, hip), legDir);
      out[`upperleg.${s}`] = qLeg;
      // Keep the shin and foot oriented as at rest relative to the world.
      out[`lowerleg.${s}`] = [-qLeg[0], -qLeg[1], -qLeg[2], qLeg[3]];
    }
  }
  return out;
}

/** Which bone carries each non-head joint point. */
const CARRIER: Record<string, string> = {
  'head.end': 'head',
  'hand.L.end': 'hand.L',
  'hand.R.end': 'hand.R',
  'foot.L.end': 'foot.L',
  'foot.R.end': 'foot.R',
  'elbow.L': 'upperarm.L',
  'elbow.R': 'upperarm.R',
  'wrist.L': 'lowerarm.L',
  'wrist.R': 'lowerarm.R',
  'knee.L': 'upperleg.L',
  'knee.R': 'upperleg.R',
  'ankle.L': 'lowerleg.L',
  'ankle.R': 'lowerleg.R',
};

/** All named joints moved into the pose. */
export function posedJoints(
  model: HumanModel,
  joints: Record<string, Vec3>,
  bones: BoneTransform[],
): Record<string, Vec3> {
  const index = new Map(model.bones.map((b, i) => [b.name, i]));
  const out: Record<string, Vec3> = {};
  for (const [name, p] of Object.entries(joints)) {
    const own = index.get(name);
    if (own !== undefined) out[name] = bones[own].headPosed;
    else out[name] = poseJoint(bones, index.get(CARRIER[name] ?? 'pelvis')!, p);
  }
  return out;
}
