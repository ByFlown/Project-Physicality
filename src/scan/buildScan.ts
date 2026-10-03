import { navyBodyFat } from '../domain/bodycomp';
import type { LocalDate } from '../domain/dates';
import { scanSchema, type MeasurementValues, type Scan, type Section, type Sex } from '../domain/schema';
import {
  chordLength,
  chordMid,
  correctProfile,
  HEIGHT_FRACTIONS,
  isEdited,
  landmarksUsable,
  WARNINGS,
} from './geometry';
import type { ChordId, Pt, ViewAnalysis, ViewMarkup } from './types';

/** Ramanujan's second approximation of an ellipse perimeter from full width and depth. */
export function ellipsePerimeter(width: number, depth: number): number {
  const a = width / 2;
  const b = depth / 2;
  if (a + b === 0) return 0;
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * Real cross-sections sit between an ellipse and a rectangle. `k` blends the
 * two perimeters (1 = pure ellipse). Values are starting estimates, ±3–5 cm.
 */
export const SECTION_SHAPE: Record<keyof Scan['sections'], number> = {
  neck: 1,
  shoulders: 0.75,
  chest: 0.72,
  waist: 0.92,
  hips: 0.85,
  upperArm: 1,
  forearm: 1,
  thigh: 1,
  calf: 1,
};

export function circumference(section: Section, k: number): number {
  return k * ellipsePerimeter(section.w, section.d) + (1 - k) * 2 * (section.w + section.d);
}

/** Plausible adult circumference ranges (cm) at 180 cm stature; scaled by height. */
export const PLAUSIBLE: Record<keyof Scan['sections'], [number, number]> = {
  neck: [28, 52],
  shoulders: [85, 150],
  chest: [72, 145],
  waist: [55, 150],
  hips: [70, 150],
  upperArm: [20, 52],
  forearm: [18, 40],
  thigh: [38, 80],
  calf: [26, 52],
};

const SITE_NAMES: Record<keyof Scan['sections'], string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  upperArm: 'Upper arm',
  forearm: 'Forearm',
  thigh: 'Thigh',
  calf: 'Calf',
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Scale {
  pxPerCm: number;
  /** Centimetres above the floor for an image row. */
  heightOf: (y: number) => number;
  /** Image row for a height above the floor. */
  rowOf: (cm: number) => number;
  cm: (px: number) => number;
}

export function scaleFor(m: ViewMarkup, heightCm: number): Scale {
  const pxPerCm = Math.max(1e-6, (m.floor - m.top) / heightCm);
  return {
    pxPerCm,
    heightOf: (y) => (m.floor - y) / pxPerCm,
    rowOf: (cm) => m.floor - cm * pxPerCm,
    cm: (px) => px / pxPerCm,
  };
}

/** Linear interpolation over points sorted by x. */
function interp(points: { x: number; y: number }[], x: number): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (x <= sorted[i].x) {
      const t = (x - sorted[i - 1].x) / (sorted[i].x - sorted[i - 1].x || 1);
      return sorted[i - 1].y + (sorted[i].y - sorted[i - 1].y) * t;
    }
  }
  return sorted[sorted.length - 1].y;
}

export interface BuildScanInput {
  id: string;
  date: LocalDate;
  heightCm: number;
  sex: Sex;
  front: ViewAnalysis;
  side: ViewAnalysis;
  photosKept: boolean;
}

/** Turn two (possibly hand-corrected) photo analyses into a validated body scan. */
export function buildScan(input: BuildScanInput): Scan {
  const { front, side, heightCm, sex } = input;
  const fs = scaleFor(front.markup, heightCm);
  const ss = scaleFor(side.markup, heightCm);
  const fChord = (id: ChordId) => {
    const c = front.markup.chords[id];
    return c ? fs.cm(chordLength(c)) : 0;
  };
  const sChord = (id: ChordId) => {
    const c = side.markup.chords[id];
    return c ? ss.cm(chordLength(c)) : 0;
  };
  const fHeight = (id: ChordId, fallback: number) => {
    const c = front.markup.chords[id];
    return c ? fs.heightOf(chordMid(c).y) : fallback * heightCm;
  };

  const sections: Scan['sections'] = {
    neck: { w: fChord('neck'), d: sChord('neck') },
    shoulders: { w: fChord('shoulders'), d: sChord('chest') * 1.05 },
    chest: { w: fChord('chest'), d: sChord('chest') },
    waist: { w: fChord('waist'), d: sChord('waist') },
    hips: { w: fChord('hips'), d: sChord('hips') },
    upperArm: { w: fChord('upperArm'), d: fChord('upperArm') * 0.97 },
    forearm: { w: fChord('forearm'), d: fChord('forearm') * 0.85 },
    thigh: { w: fChord('thigh'), d: sChord('thigh') },
    calf: { w: fChord('calf'), d: sChord('calf') },
  };
  for (const s of Object.values(sections)) {
    s.w = round1(clamp(s.w, 1, 150));
    s.d = round1(clamp(s.d, 1, 150));
  }

  const circ = (k: keyof Scan['sections']) => round1(circumference(sections[k], SECTION_SHAPE[k]));
  const circumferences: MeasurementValues = {
    neck: circ('neck'),
    shoulders: circ('shoulders'),
    chest: circ('chest'),
    waist: circ('waist'),
    hips: circ('hips'),
    upperArm: circ('upperArm'),
    forearm: circ('forearm'),
    thigh: circ('thigh'),
    calf: circ('calf'),
  };

  // ---- torso profile (cm), from crotch to armpit
  const crotchCm = fs.heightOf(front.crotchY);
  const armpitCm = Math.max(crotchCm + 10, fs.heightOf(front.armpitY));
  const torsoIds: ChordId[] = ['chest', 'waist', 'hips'];

  const frontProfile = front.profile
    ? correctProfile(front.profile, front.detected, front.markup, torsoIds).map((r) => ({
        x: fs.heightOf(r.y),
        y: fs.cm(r.right - r.left) / 2,
      }))
    : torsoIds.map((id) => ({ x: fHeight(id, HEIGHT_FRACTIONS[id as 'chest' | 'waist' | 'hips']), y: fChord(id) / 2 }));

  // Side view: the body axis is the middle of the hips chord; front/back extents are measured from it.
  const hipsSide = side.markup.chords.hips;
  const axisX = hipsSide ? chordMid(hipsSide).x : side.markup.width / 2;
  const facingRight = side.markup.facingRight ?? true;
  const extents = (left: number, right: number) => {
    const front = facingRight ? right - axisX : axisX - left;
    const back = facingRight ? axisX - left : right - axisX;
    return { front: Math.max(0.5, ss.cm(front)), back: Math.max(0.5, ss.cm(back)) };
  };
  let sideFront: { x: number; y: number }[];
  let sideBack: { x: number; y: number }[];
  if (side.profile) {
    const rows = correctProfile(side.profile, side.detected, side.markup, torsoIds);
    sideFront = rows.map((r) => ({ x: ss.heightOf(r.y), y: extents(r.left, r.right).front }));
    sideBack = rows.map((r) => ({ x: ss.heightOf(r.y), y: extents(r.left, r.right).back }));
  } else {
    const pts = torsoIds
      .map((id) => {
        const c = side.markup.chords[id];
        if (!c) return null;
        const e = extents(Math.min(c[0].x, c[1].x), Math.max(c[0].x, c[1].x));
        return { h: ss.heightOf(chordMid(c).y), ...e };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);
    sideFront = pts.map((p) => ({ x: p.h, y: p.front }));
    sideBack = pts.map((p) => ({ x: p.h, y: p.back }));
  }

  const torso: Scan['torso'] = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const y = crotchCm + ((armpitCm - crotchCm) * i) / N;
    torso.push({
      y: round1(y),
      half: round1(clamp(interp(frontProfile, y), 3, 60)),
      front: round1(clamp(interp(sideFront, y), 1, 60)),
      back: round1(clamp(interp(sideBack, y), 1, 60)),
    });
  }

  // ---- joints
  const lm = landmarksUsable(front.landmarks) ? front.landmarks : null;
  const P = (i: number): Pt => ({ x: lm![i].x * front.markup.width, y: lm![i].y * front.markup.height });
  const pxDist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const avg = (a: number, b: number) => (a + b) / 2;
  const H = heightCm;
  const joints: Scan['joints'] = lm
    ? {
        shoulderY: fs.heightOf(avg(P(11).y, P(12).y)),
        shoulderHalf: fs.cm(Math.abs(P(11).x - P(12).x)) / 2,
        armpitY: armpitCm,
        hipY: fs.heightOf(avg(P(23).y, P(24).y)),
        hipHalf: fs.cm(Math.abs(P(23).x - P(24).x)) / 2,
        crotchY: crotchCm,
        kneeY: fs.heightOf(avg(P(25).y, P(26).y)),
        ankleY: fs.heightOf(avg(P(27).y, P(28).y)),
        neckY: fHeight('neck', HEIGHT_FRACTIONS.neck),
        upperArmLength: fs.cm(avg(pxDist(P(11), P(13)), pxDist(P(12), P(14)))),
        forearmLength: fs.cm(avg(pxDist(P(13), P(15)), pxDist(P(14), P(16)))),
        armAngle: avg(
          Math.abs(Math.atan2(P(13).x - P(11).x, P(13).y - P(11).y)),
          Math.abs(Math.atan2(P(14).x - P(12).x, P(14).y - P(12).y)),
        ),
      }
    : {
        shoulderY: HEIGHT_FRACTIONS.shoulder * H,
        shoulderHalf: 0.108 * H,
        armpitY: armpitCm,
        hipY: HEIGHT_FRACTIONS.hipJoint * H,
        hipHalf: 0.051 * H,
        crotchY: crotchCm,
        kneeY: HEIGHT_FRACTIONS.knee * H,
        ankleY: HEIGHT_FRACTIONS.ankle * H,
        neckY: fHeight('neck', HEIGHT_FRACTIONS.neck),
        upperArmLength: 0.167 * H,
        forearmLength: 0.144 * H,
        armAngle: 0.26,
      };
  // Keep joints anatomically ordered and within plausible ranges.
  joints.shoulderHalf = clamp(joints.shoulderHalf, 0.07 * H, 0.15 * H);
  joints.hipHalf = clamp(joints.hipHalf, 0.03 * H, 0.08 * H);
  joints.upperArmLength = clamp(joints.upperArmLength, 0.12 * H, 0.22 * H);
  joints.forearmLength = clamp(joints.forearmLength, 0.1 * H, 0.19 * H);
  joints.armAngle = clamp(joints.armAngle, 0.05, 1.1);
  joints.ankleY = clamp(joints.ankleY, 0.02 * H, 0.08 * H);
  joints.kneeY = clamp(joints.kneeY, 0.22 * H, 0.34 * H);
  joints.hipY = clamp(joints.hipY, Math.max(joints.kneeY + 0.1 * H, 0.46 * H), 0.6 * H);
  joints.crotchY = clamp(joints.crotchY, joints.kneeY + 0.08 * H, joints.hipY);
  joints.shoulderY = clamp(joints.shoulderY, 0.76 * H, 0.86 * H);
  joints.armpitY = clamp(joints.armpitY, joints.hipY + 0.1 * H, joints.shoulderY - 0.01 * H);
  joints.neckY = clamp(joints.neckY, joints.shoulderY + 0.005 * H, 0.9 * H);
  for (const k of Object.keys(joints) as (keyof Scan['joints'])[]) {
    joints[k] = k === 'armAngle' ? Math.round(joints[k] * 1000) / 1000 : round1(joints[k]);
  }

  // ---- quality
  const implausible = (Object.keys(PLAUSIBLE) as (keyof Scan['sections'])[]).filter((k) => {
    const v = circumferences[k];
    const [lo, hi] = PLAUSIBLE[k].map((x) => (x * heightCm) / 180);
    return v === undefined || v < lo || v > hi;
  });
  const warnings = [
    ...new Set([
      ...front.warnings,
      ...side.warnings,
      ...implausible.map(
        (k) => `${SITE_NAMES[k]} (${circumferences[k]} cm) looks implausible — check that line on both photos.`,
      ),
    ]),
  ];
  let quality = 1 - 0.1 * implausible.length;
  if (!lm) quality -= 0.25;
  if (!front.hasMask) quality -= 0.3;
  if (!side.hasMask) quality -= 0.3;
  if (warnings.includes(WARNINGS.armsTouching)) quality -= 0.1;
  if (warnings.includes(WARNINGS.legsTogether)) quality -= 0.1;
  if (warnings.includes(WARNINGS.clothes)) quality -= 0.2;
  if (warnings.includes(WARNINGS.small)) quality -= 0.15;
  const edited = isEdited(front) || isEdited(side);
  const method = !front.hasMask && !side.hasMask ? 'manual' : edited ? 'adjusted' : 'auto';
  if (method === 'adjusted') quality += 0.1; // a human checked the lines

  const bf = navyBodyFat(sex, heightCm, circumferences);

  return scanSchema.parse({
    id: input.id,
    date: input.date,
    heightCm,
    method,
    quality: Math.round(clamp(quality, 0, 1) * 100) / 100,
    warnings: warnings.slice(0, 12),
    joints,
    torso,
    sections,
    circumferences,
    bodyFatPct: bf !== undefined && bf >= 3 && bf <= 60 ? bf : undefined,
    photosKept: input.photosKept,
  });
}
