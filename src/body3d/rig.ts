import type { MuscleId } from '../domain/muscles';
import type { Scan } from '../domain/schema';
import {
  forearmRings,
  JOINTS,
  partsForSegment,
  shinRings,
  thighRings,
  torsoRings,
  upperArmRings,
  type ModelDetail,
  type MusclePart,
  type SegmentId,
  type Vec3,
} from './anatomy';
import { displacementAt, prepareParts, type MuscleLook } from './deform';
import type { Ring } from './geometry';
import type { ShapeFactors } from './shape';

/**
 * Everything needed to build the 3D body, at real size in metres (feet at
 * y = 0, facing +z). The reference rig is the procedural body scaled to the
 * user's height; the scanned rig follows their measured silhouette.
 */
export interface BodyRig {
  shoulder: Vec3;
  armAngle: number;
  upperArmLength: number;
  forearmLength: number;
  forearmBend: number;
  hip: Vec3;
  legAngle: number;
  thighLength: number;
  shinLength: number;
  /** Uniform size factor versus the 1.8 m reference (hands, feet, head). */
  scale: number;
  head: { center: Vec3; radii: Vec3 };
  rings: Record<SegmentId, RigRing[]>;
  /** Maps a reference torso height (muscle footprints) to this body. */
  torsoY: (refY: number) => number;
  lengthScale: Record<SegmentId, number>;
  girthScale: Record<SegmentId, number>;
  /** Id of the scan this rig was built and calibrated from. */
  scanId?: string;
}

export interface RigRing extends Ring {
  /** Whether the ring came from a measurement and should be calibrated. */
  measured?: boolean;
}

export const SEGMENTS: SegmentId[] = ['torso', 'upperArm', 'forearm', 'thigh', 'shin'];

const scaleRings = (rings: Ring[], s: number): RigRing[] =>
  rings.map((r) => ({ y: r.y * s, w: r.w * s, d: r.d * s, x: (r.x ?? 0) * s, z: (r.z ?? 0) * s }));

const uniform = (v: number): Record<SegmentId, number> => ({ torso: v, upperArm: v, forearm: v, thigh: v, shin: v });

/** Today's procedural body, scaled to height. */
export function referenceRig(f: ShapeFactors): BodyRig {
  const s = f.scale;
  const [sx, sy, sz] = JOINTS.shoulder;
  const [hx, hy, hz] = JOINTS.hip;
  return {
    shoulder: [sx * f.shoulderWidth * f.girth * s, sy * s, sz * s],
    armAngle: JOINTS.armAngle,
    upperArmLength: JOINTS.upperArmLength * s,
    forearmLength: JOINTS.forearmLength * s,
    forearmBend: JOINTS.forearmBend,
    hip: [hx * f.hipWidth * f.girth * s, hy * s, hz * s],
    legAngle: JOINTS.legAngle,
    thighLength: JOINTS.thighLength * s,
    shinLength: JOINTS.shinLength * s,
    scale: s,
    head: { center: [0, 1.695 * s, 0.01 * s], radii: [0.08 * s, 0.11 * s, 0.096 * s] },
    rings: {
      torso: scaleRings(torsoRings(f), s),
      upperArm: scaleRings(upperArmRings(f), s),
      forearm: scaleRings(forearmRings(f), s),
      thigh: scaleRings(thighRings(f), s),
      shin: scaleRings(shinRings(f), s),
    },
    torsoY: (y) => y * s,
    lengthScale: uniform(s),
    girthScale: uniform(s),
  };
}

/** Piecewise-linear map through sorted anchors, extrapolating with `slope` beyond them. */
export function piecewise(anchors: [number, number][], slope: number): (x: number) => number {
  const pts = [...anchors].sort((a, b) => a[0] - b[0]);
  // Enforce a strictly increasing output so the torso never folds over itself.
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] <= pts[i - 1][1]) pts[i] = [pts[i][0], pts[i - 1][1] + (pts[i][0] - pts[i - 1][0]) * slope * 0.25];
  }
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1] + (x - pts[0][0]) * slope;
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
        return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
      }
    }
    const last = pts[pts.length - 1];
    return last[1] + (x - last[0]) * slope;
  };
}

/** Reference (1.8 m, neutral build) limb radii at the height each scan section is measured. */
const REF_LIMB = {
  upperArm: { w: 0.0425, d: 0.0435 },
  forearm: { w: 0.038, d: 0.035 },
  thigh: { w: 0.078, d: 0.082 },
  shin: { w: 0.05, d: 0.056 },
};
const REF_CHEST = { w: 0.172, d: 0.112 };

/** Build the body from a photo scan. */
export function scannedRig(scan: Scan, f: ShapeFactors): BodyRig {
  const m = (cm: number) => cm / 100;
  const H = m(scan.heightCm);
  const s = H / 1.8;
  const j = scan.joints;
  const neutral: ShapeFactors = { ...f, girth: 1, limbFat: 1, waistFat: 1, shoulderWidth: 1, hipWidth: 1 };

  const torsoY = piecewise(
    [
      [0.78, m(j.crotchY)],
      [0.9, m(j.hipY)],
      [1.37, m(j.armpitY)],
      [1.435, m(j.shoulderY)],
      [1.58, m(j.neckY)],
    ],
    s,
  );

  // Torso: measured rows between crotch and armpit, reference shape above (it contains the arms in photos).
  const rows = scan.torso;
  const first = rows[0];
  const chestW = m(scan.sections.chest.w) / 2;
  const chestD = m(scan.sections.chest.d) / 2;
  const shoulderRatio = m(j.shoulderHalf) / (JOINTS.shoulder[0] * s);
  const depthRatio = chestD / (REF_CHEST.d * s);
  const measured: RigRing[] = rows.map((r) => ({
    y: m(r.y),
    w: m(r.half),
    d: m(r.front + r.back) / 2,
    z: m(r.front - r.back) / 2,
    x: 0,
    measured: true,
  }));
  const topMeasured = measured[measured.length - 1].y;
  const upper: RigRing[] = torsoRings(neutral)
    .filter((r) => r.y >= 1.44)
    .map((r) => ({
      y: Math.max(torsoY(r.y), topMeasured + 0.01 * s),
      w: r.w * s * (r.y < 1.52 ? shoulderRatio : 1),
      d: r.d * s * (r.y < 1.52 ? depthRatio : 1),
      z: (r.z ?? 0) * s,
      x: 0,
    }));
  const torso: RigRing[] = [
    { y: m(j.crotchY) - 0.05 * s, w: 0.01, d: 0.01, x: 0, z: 0 },
    { y: m(j.crotchY) - 0.03 * s, w: m(first.half) * 0.55, d: m(first.front + first.back) * 0.3, x: 0, z: 0 },
    ...measured,
    ...upper,
  ];
  // Keep rings strictly ordered by height.
  for (let i = 1; i < torso.length; i++) torso[i].y = Math.max(torso[i].y, torso[i - 1].y + 0.002);

  const lengths = {
    upperArm: m(j.upperArmLength),
    forearm: m(j.forearmLength),
    thigh: Math.max(0.2 * s, m(j.hipY - j.kneeY)),
    shin: Math.max(0.2 * s, m(j.kneeY - j.ankleY)),
  };
  const refLength = {
    upperArm: JOINTS.upperArmLength,
    forearm: JOINTS.forearmLength,
    thigh: JOINTS.thighLength,
    shin: JOINTS.shinLength,
  };
  const section = {
    upperArm: scan.sections.upperArm,
    forearm: scan.sections.forearm,
    thigh: scan.sections.thigh,
    shin: scan.sections.calf,
  };
  const limb = (seg: keyof typeof REF_LIMB, rings: Ring[]): RigRing[] => {
    const ly = lengths[seg] / refLength[seg];
    const wr = m(section[seg].w) / 2 / REF_LIMB[seg].w;
    const dr = m(section[seg].d) / 2 / REF_LIMB[seg].d;
    return rings.map((r) => {
      const cap = r.w < 0.015;
      return {
        y: r.y * ly,
        w: cap ? r.w : r.w * wr,
        d: cap ? r.d : r.d * dr,
        x: (r.x ?? 0) * wr,
        z: (r.z ?? 0) * dr,
        measured: !cap,
      };
    });
  };

  const girth = (seg: keyof typeof REF_LIMB) =>
    Math.sqrt(((m(section[seg].w) / 2) * (m(section[seg].d) / 2)) / (REF_LIMB[seg].w * REF_LIMB[seg].d));

  return {
    shoulder: [m(j.shoulderHalf), m(j.shoulderY), JOINTS.shoulder[2] * s],
    armAngle: Math.min(0.45, Math.max(0.15, j.armAngle)),
    upperArmLength: lengths.upperArm,
    forearmLength: lengths.forearm,
    forearmBend: JOINTS.forearmBend,
    hip: [m(j.hipHalf), m(j.hipY), 0],
    legAngle: JOINTS.legAngle,
    thighLength: lengths.thigh,
    shinLength: lengths.shin,
    scale: s,
    head: { center: [0, H - 0.105 * s, 0.01 * s], radii: [0.08 * s, 0.11 * s, 0.096 * s] },
    rings: {
      torso,
      upperArm: limb('upperArm', upperArmRings(neutral)),
      forearm: limb('forearm', forearmRings(neutral)),
      thigh: limb('thigh', thighRings(neutral)),
      shin: limb('shin', shinRings(neutral)),
    },
    torsoY,
    lengthScale: {
      torso: (m(j.shoulderY) - m(j.crotchY)) / (1.435 - 0.78),
      upperArm: lengths.upperArm / refLength.upperArm,
      forearm: lengths.forearm / refLength.forearm,
      thigh: lengths.thigh / refLength.thigh,
      shin: lengths.shin / refLength.shin,
    },
    girthScale: {
      torso: Math.sqrt((chestW * chestD) / (REF_CHEST.w * REF_CHEST.d)),
      upperArm: girth('upperArm'),
      forearm: girth('forearm'),
      thigh: girth('thigh'),
      shin: girth('shin'),
    },
    scanId: scan.id,
  };
}

/** Muscle footprints mapped onto this body. */
export function placeParts(segment: SegmentId, rig: BodyRig, detail: ModelDetail): MusclePart[] {
  const g = rig.girthScale[segment];
  return partsForSegment(segment, detail).map((p) => {
    if (segment === 'torso') {
      const stretch = (rig.torsoY(p.y + 0.01) - rig.torsoY(p.y - 0.01)) / 0.02;
      return { ...p, y: rig.torsoY(p.y), width: p.width * g, height: p.height * stretch, bulge: p.bulge * g };
    }
    const L = rig.lengthScale[segment];
    return { ...p, y: p.y * L, width: p.width * g, height: p.height * L, bulge: p.bulge * g };
  });
}

/**
 * Shrink the measured rings by the muscle displacement at scan-date levels,
 * so base + bulges reproduces the photographed silhouette exactly at scan time.
 * Later level changes then grow or shrink the body from that anchor.
 */
export function calibrateRig(
  rig: BodyRig,
  looksAtScan: Record<MuscleId, MuscleLook>,
  absDefinition: number,
  detail: ModelDetail,
): BodyRig {
  const rings = {} as Record<SegmentId, RigRing[]>;
  for (const seg of SEGMENTS) {
    const prepared = prepareParts(placeParts(seg, rig, detail), looksAtScan, absDefinition);
    rings[seg] = rig.rings[seg].map((ring) => {
      if (!ring.measured) return ring;
      const z0 = ring.z ?? 0;
      const front = z0 + ring.d;
      const back = z0 - ring.d;
      let { w, d } = ring;
      let z = z0;
      for (let i = 0; i < 3; i++) {
        const r = Math.sqrt((w * w + d * d) / 2);
        const side =
          (displacementAt(prepared, ring.y, Math.PI / 2, r).disp +
            displacementAt(prepared, ring.y, -Math.PI / 2, r).disp) /
          2;
        const dF = displacementAt(prepared, ring.y, 0, r).disp;
        const dB = displacementAt(prepared, ring.y, Math.PI, r).disp;
        w = Math.max(ring.w * 0.4, ring.w - side);
        d = Math.max(ring.d * 0.4, (front - back - dF - dB) / 2);
        z = (front + back - dF + dB) / 2;
      }
      return { ...ring, w, d, z };
    });
  }
  return { ...rig, rings };
}

/** Silhouette extents (half width, front, back) of a ring once muscles are applied. */
export function deformedExtents(
  ring: RigRing,
  segment: SegmentId,
  rig: BodyRig,
  looks: Record<MuscleId, MuscleLook>,
  absDefinition: number,
  detail: ModelDetail,
) {
  const prepared = prepareParts(placeParts(segment, rig, detail), looks, absDefinition);
  const r = Math.sqrt((ring.w * ring.w + ring.d * ring.d) / 2);
  const at = (a: number) => displacementAt(prepared, ring.y, a, r).disp;
  const z = ring.z ?? 0;
  return {
    half: ring.w + (at(Math.PI / 2) + at(-Math.PI / 2)) / 2,
    front: z + ring.d + at(0),
    back: z - ring.d - at(Math.PI),
  };
}

/**
 * The rig to render: in precise mode with a scan, the scanned body calibrated
 * to the muscle bulges the user had on the scan date; otherwise the reference body.
 */
export function buildRig(
  f: ShapeFactors,
  detail: ModelDetail,
  scan: Scan | null | undefined,
  bulgesAtScan: Record<MuscleId, number> | null | undefined,
): BodyRig {
  if (detail !== 'precise' || !scan || !bulgesAtScan) return referenceRig(f);
  const looks = Object.fromEntries(
    (Object.keys(bulgesAtScan) as MuscleId[]).map((id) => [
      id,
      { color: [0, 0, 0], bulgeScale: bulgesAtScan[id], highlight: 0 } satisfies MuscleLook,
    ]),
  ) as Record<MuscleId, MuscleLook>;
  return calibrateRig(scannedRig(scan, f), looks, f.absDefinition, detail);
}
