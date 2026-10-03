import type { Sex } from '../domain/schema';
import {
  CATEGORY,
  type Chord,
  type ChordId,
  type Landmark,
  type Mask,
  type ProfileRow,
  type Pt,
  type SideChord,
  type View,
  type ViewAnalysis,
  type ViewMarkup,
} from './types';

/**
 * Photo → measurement geometry. Everything here is pure and works in image
 * pixels (y grows downward). A "chord" is a two-point segment across a body
 * part; its length is the part's width (front view) or depth (side view).
 */

// ---------------------------------------------------------------- mask helpers

export function isPerson(mask: Mask, x: number, y: number): boolean {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= mask.width || yi >= mask.height) return false;
  const c = mask.data[yi * mask.width + xi];
  return c !== CATEGORY.background && c !== CATEGORY.accessories;
}

export interface Bounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Bounding box of the person, ignoring rows with only a few stray pixels. */
export function personBounds(mask: Mask, minPixels = 3): Bounds | null {
  let top = -1;
  let bottom = -1;
  let left = mask.width;
  let right = -1;
  for (let y = 0; y < mask.height; y++) {
    let count = 0;
    let rowLeft = -1;
    let rowRight = -1;
    for (let x = 0; x < mask.width; x++) {
      if (isPerson(mask, x, y)) {
        count++;
        if (rowLeft < 0) rowLeft = x;
        rowRight = x;
      }
    }
    if (count >= minPixels) {
      if (top < 0) top = y;
      bottom = y;
      left = Math.min(left, rowLeft);
      right = Math.max(right, rowRight);
    }
  }
  return top < 0 ? null : { top, bottom, left, right };
}

/** The contiguous person run on `row` containing (or nearest to) `x`, within `tolerance` px. */
export function runAt(mask: Mask, row: number, x: number, tolerance = 8): [number, number] | null {
  const y = Math.round(row);
  let start = Math.round(x);
  if (!isPerson(mask, start, y)) {
    let found = -1;
    for (let d = 1; d <= tolerance && found < 0; d++) {
      if (isPerson(mask, start - d, y)) found = start - d;
      else if (isPerson(mask, start + d, y)) found = start + d;
    }
    if (found < 0) return null;
    start = found;
  }
  let l = start;
  let r = start;
  while (isPerson(mask, l - 1, y)) l--;
  while (isPerson(mask, r + 1, y)) r++;
  return [l, r + 1];
}

/** The widest person run on `row`. */
export function longestRun(mask: Mask, row: number): [number, number] | null {
  const y = Math.round(row);
  let best: [number, number] | null = null;
  let x = 0;
  while (x < mask.width) {
    if (!isPerson(mask, x, y)) {
      x++;
      continue;
    }
    const l = x;
    while (x < mask.width && isPerson(mask, x, y)) x++;
    if (!best || x - l > best[1] - best[0]) best = [l, x];
  }
  return best;
}

/** Distance from `from` along `dir` until the first background pixel (capped at `maxLen`). */
export function march(mask: Mask, from: Pt, dir: Pt, maxLen: number): { distance: number; capped: boolean } {
  const step = 0.5;
  for (let t = 0; t <= maxLen; t += step) {
    if (!isPerson(mask, from.x + dir.x * t, from.y + dir.y * t)) return { distance: t, capped: false };
  }
  return { distance: maxLen, capped: true };
}

// ---------------------------------------------------------------- small maths

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function chordLength(c: Chord): number {
  return dist(c[0], c[1]);
}

export function chordMid(c: Chord): Pt {
  return mid(c[0], c[1]);
}

const horizontal = (y: number, l: number, r: number): Chord => [
  { x: l, y },
  { x: r, y },
];

/** Chord of `width` centred at `center`, perpendicular to `axis`. */
function perpendicular(center: Pt, axis: Pt, halfA: number, halfB: number): Chord {
  const len = Math.hypot(axis.x, axis.y) || 1;
  const n = { x: -axis.y / len, y: axis.x / len };
  return [
    { x: center.x - n.x * halfB, y: center.y - n.y * halfB },
    { x: center.x + n.x * halfA, y: center.y + n.y * halfA },
  ];
}

// ---------------------------------------------------------------- anthropometric defaults

/** Heights above the floor as a fraction of stature (Drillis & Contini). */
export const HEIGHT_FRACTIONS = {
  neck: 0.85,
  shoulder: 0.818,
  armpit: 0.75,
  chest: 0.72,
  elbow: 0.63,
  waist: 0.6,
  hipJoint: 0.53,
  hips: 0.5,
  wrist: 0.485,
  crotch: 0.47,
  thigh: 0.42,
  knee: 0.285,
  calf: 0.2,
  ankle: 0.039,
} as const;

/** Default chord lengths as a fraction of stature. */
const FRONT_WIDTH: Record<string, number> = {
  neck: 0.07,
  shoulders: 0.26,
  chest: 0.19,
  waist: 0.165,
  hips: 0.19,
  upperArm: 0.055,
  forearm: 0.045,
  thigh: 0.09,
  calf: 0.06,
};
const SIDE_DEPTH: Record<SideChord, number> = {
  neck: 0.065,
  chest: 0.13,
  waist: 0.12,
  hips: 0.14,
  thigh: 0.09,
  calf: 0.06,
};

/** Starting markup for manual placement: a centred person filling 90% of the frame. */
export function defaultMarkup(view: View, width: number, height: number): ViewMarkup {
  const top = height * 0.05;
  const floor = height * 0.95;
  const H = floor - top;
  const cx = width / 2;
  const at = (f: number) => floor - f * H;
  const centred = (f: number, w: number): Chord => horizontal(at(f), cx - (w * H) / 2, cx + (w * H) / 2);
  const offset = (f: number, x: number, w: number): Chord =>
    horizontal(at(f), cx + x * H - (w * H) / 2, cx + x * H + (w * H) / 2);

  if (view === 'front') {
    return {
      view,
      width,
      height,
      top,
      floor,
      chords: {
        neck: centred(HEIGHT_FRACTIONS.neck, FRONT_WIDTH.neck),
        shoulders: centred(HEIGHT_FRACTIONS.shoulder - 0.01, FRONT_WIDTH.shoulders),
        chest: centred(HEIGHT_FRACTIONS.chest, FRONT_WIDTH.chest),
        waist: centred(HEIGHT_FRACTIONS.waist, FRONT_WIDTH.waist),
        hips: centred(HEIGHT_FRACTIONS.hips, FRONT_WIDTH.hips),
        upperArm: offset(0.72, -0.17, FRONT_WIDTH.upperArm),
        forearm: offset(0.56, -0.2, FRONT_WIDTH.forearm),
        thigh: offset(HEIGHT_FRACTIONS.thigh, -0.055, FRONT_WIDTH.thigh),
        calf: offset(HEIGHT_FRACTIONS.calf, -0.05, FRONT_WIDTH.calf),
      },
    };
  }
  const side: Partial<Record<ChordId, Chord>> = {};
  const f: Record<SideChord, number> = {
    neck: HEIGHT_FRACTIONS.neck,
    chest: HEIGHT_FRACTIONS.chest,
    waist: HEIGHT_FRACTIONS.waist,
    hips: HEIGHT_FRACTIONS.hips,
    thigh: HEIGHT_FRACTIONS.thigh,
    calf: HEIGHT_FRACTIONS.calf,
  };
  for (const id of Object.keys(f) as SideChord[]) side[id] = centred(f[id], SIDE_DEPTH[id]);
  return { view, width, height, top, floor, chords: side, facingRight: true };
}

// ---------------------------------------------------------------- landmarks

const LM = {
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
} as const;

function landmarkPoints(landmarks: Landmark[], w: number, h: number) {
  const p = (i: number): Pt => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
  return {
    p,
    visible: (i: number) => (landmarks[i]?.visibility ?? 0) >= 0.5,
    shoulder: mid(p(LM.shoulderL), p(LM.shoulderR)),
    hip: mid(p(LM.hipL), p(LM.hipR)),
    knee: mid(p(LM.kneeL), p(LM.kneeR)),
    ankle: mid(p(LM.ankleL), p(LM.ankleR)),
    mouth: mid(p(LM.mouthL), p(LM.mouthR)),
    nose: p(LM.nose),
  };
}

export function landmarksUsable(landmarks: Landmark[] | null): landmarks is Landmark[] {
  if (!landmarks || landmarks.length < 33) return false;
  const core = [LM.shoulderL, LM.shoulderR, LM.hipL, LM.hipR, LM.kneeL, LM.kneeR];
  return core.every((i) => (landmarks[i].visibility ?? 0) >= 0.5);
}

// ---------------------------------------------------------------- front view

export const WARNINGS = {
  noPerson: 'No person was detected — place the measurement lines by hand.',
  small: 'You are small in the frame. Step closer or crop the photo so you fill most of its height.',
  armsTouching: 'Your arms seem to touch your body. Hold them 30–45° away for accurate torso widths.',
  legsTogether: 'Your legs seem to touch. Stand with feet hip-width apart.',
  clothes: 'Loose clothing covers much of your torso and inflates measurements. Scan in fitted clothes.',
  feetCut: 'Your feet may be cut off. The whole body must be visible for the scale to be right.',
  headCut: 'Your head may be cut off. The whole body must be visible for the scale to be right.',
  noPose: 'Body landmarks were not found — joint positions use typical proportions.',
} as const;

function clothesShare(mask: Mask, bounds: Bounds, y0: number, y1: number): number {
  let person = 0;
  let clothes = 0;
  for (let y = Math.round(y0); y <= Math.round(y1); y += 2) {
    for (let x = bounds.left; x <= bounds.right; x += 2) {
      const c = mask.data[y * mask.width + x];
      if (c === CATEGORY.background || c === CATEGORY.accessories) continue;
      person++;
      if (c === CATEGORY.clothes) clothes++;
    }
  }
  return person ? clothes / person : 0;
}

function boundsWarnings(mask: Mask, b: Bounds): string[] {
  const out: string[] = [];
  if ((b.bottom - b.top) / mask.height < 0.6) out.push(WARNINGS.small);
  if (b.bottom >= mask.height - Math.max(2, mask.height * 0.01)) out.push(WARNINGS.feetCut);
  if (b.top <= Math.max(1, mask.height * 0.005)) out.push(WARNINGS.headCut);
  return out;
}

/**
 * The floor under the ankles, in the body's own plane. The lowest mask row is
 * the toes, which stand ~20 cm closer to the camera and so project lower than
 * the body's floor: using them as the scale reference makes everything read
 * 4–6% small (measured with src/scan/bench). With visible ankle landmarks we
 * extrapolate from head top to ankle by the ankle's typical height instead.
 */
export function bodyPlaneFloor(landmarks: Landmark[] | null, height: number, top: number, bottom: number): number {
  if (!landmarks || landmarks.length < 29) return bottom;
  const rows = [LM.ankleL, LM.ankleR]
    .filter((i) => (landmarks[i]?.visibility ?? 0) >= 0.5)
    .map((i) => landmarks[i].y * height);
  if (rows.length === 0) return bottom;
  const ankle = rows.reduce((a, b) => a + b, 0) / rows.length;
  const f = HEIGHT_FRACTIONS.ankle;
  const floor = ankle + ((ankle - top) * f) / (1 - f);
  const H = bottom - top;
  // Only trust it when it lands just above the toes.
  if (floor > bottom + 0.01 * H || floor < bottom - 0.1 * H) return bottom;
  return floor;
}

function emptyAnalysis(view: View, width: number, height: number, warnings: string[]): ViewAnalysis {
  const markup = defaultMarkup(view, width, height);
  const H = markup.floor - markup.top;
  return {
    markup,
    detected: structuredClone(markup),
    landmarks: null,
    profile: null,
    crotchY: markup.floor - HEIGHT_FRACTIONS.crotch * H,
    armpitY: markup.floor - HEIGHT_FRACTIONS.armpit * H,
    warnings,
    hasMask: false,
  };
}

/**
 * Analyse a front photo. Chords are auto-placed from the segmentation mask
 * and pose landmarks; anything that cannot be found falls back to default
 * proportions so the user can correct it.
 */
export function analyzeFront(
  mask: Mask | null,
  landmarks: Landmark[] | null,
  width: number,
  height: number,
  sex: Sex,
): ViewAnalysis {
  const bounds = mask ? personBounds(mask) : null;
  if (!mask || !bounds) return emptyAnalysis('front', width, height, [WARNINGS.noPerson]);

  const warnings = boundsWarnings(mask, bounds);
  const top = bounds.top;
  const pose = landmarksUsable(landmarks) ? landmarkPoints(landmarks, width, height) : null;
  const floor = bodyPlaneFloor(pose ? landmarks : null, height, top, bounds.bottom + 1);
  const H = floor - top;
  const at = (f: number) => floor - f * H;
  const defaults = defaultMarkup('front', width, height);

  if (!pose) warnings.push(WARNINGS.noPose);

  const shoulderY = pose?.shoulder.y ?? at(HEIGHT_FRACTIONS.shoulder);
  const hipY = pose?.hip.y ?? at(HEIGHT_FRACTIONS.hipJoint);
  const torsoLen = Math.max(1, hipY - shoulderY);
  const massCenter = (bounds.left + bounds.right) / 2;
  const centerX = (y: number) => {
    if (!pose) return massCenter;
    const t = Math.min(1, Math.max(0, (y - shoulderY) / torsoLen));
    return lerp(pose.shoulder.x, pose.hip.x, t);
  };
  // Arm centre lines (shoulder → elbow → wrist → hand) used to cut arms off torso runs when they touch.
  const armLines: Pt[][] = pose
    ? [
        [LM.shoulderL, LM.elbowL, LM.wristL],
        [LM.shoulderR, LM.elbowR, LM.wristR],
      ]
        .filter((ids) => ids.every((i) => pose.visible(i)))
        .map((ids) => {
          const pts = ids.map((i) => pose.p(i));
          const [, e, w] = pts;
          return [...pts, { x: w.x + (w.x - e.x) * 0.45, y: w.y + (w.y - e.y) * 0.45 }];
        })
    : [];
  const armXAt = (line: Pt[], y: number): number | null => {
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return lerp(a.x, b.x, (y - a.y) / (b.y - a.y));
    }
    return null;
  };
  const armRadius = H * 0.025;
  let clippedArms = false;
  const torsoRun = (y: number): [number, number] | null => {
    const run = runAt(mask, y, centerX(y), Math.round(H * 0.02));
    if (!run) return run;
    const c = centerX(y);
    let [l, r] = run;
    // Above the armpit the arms are attached to the shoulders; that width is real (bideltoid).
    if (y < shoulderY + 0.22 * torsoLen) return run;
    for (const line of armLines) {
      const ax = armXAt(line, y);
      if (ax === null) continue;
      if (ax < c && l < ax + armRadius * 0.3) {
        l = Math.min(c - 1, ax + armRadius);
        clippedArms = true;
      } else if (ax > c && r > ax - armRadius * 0.3) {
        r = Math.max(c + 1, ax - armRadius);
        clippedArms = true;
      }
    }
    return [l, r];
  };
  const maxTorso = H * 0.36;

  const chords: Partial<Record<ChordId, Chord>> = {};
  const widestIn = (y0: number, y1: number, pickMin = false) => {
    let best: { y: number; run: [number, number] } | null = null;
    for (let y = Math.round(y0); y <= Math.round(y1); y++) {
      const run = torsoRun(y);
      if (!run) continue;
      const w = run[1] - run[0];
      if (w > maxTorso) continue;
      if (!best || (pickMin ? w < best.run[1] - best.run[0] : w > best.run[1] - best.run[0])) best = { y, run };
    }
    return best;
  };
  const place = (id: ChordId, y: number) => {
    const run = torsoRun(y);
    if (run && run[1] - run[0] <= maxTorso) chords[id] = horizontal(y, run[0], run[1]);
    else {
      chords[id] = defaults.chords[id];
      if (run) warnings.push(WARNINGS.armsTouching);
    }
  };

  // Neck
  const mouthY = pose?.mouth.y ?? at(0.88);
  const neckY = mouthY + 0.42 * (shoulderY - mouthY);
  const neckRun = runAt(mask, neckY, pose?.nose.x ?? massCenter, Math.round(H * 0.02));
  chords.neck =
    neckRun && neckRun[1] - neckRun[0] < H * 0.12 ? horizontal(neckY, neckRun[0], neckRun[1]) : defaults.chords.neck;

  // Torso
  // Bideltoid breadth: rows below the shoulder joints already include the abducted upper arms.
  const shoulders = widestIn(shoulderY - 0.08 * torsoLen, shoulderY + 0.02 * torsoLen);
  chords.shoulders = shoulders ? horizontal(shoulders.y, ...shoulders.run) : defaults.chords.shoulders;
  place('chest', shoulderY + 0.3 * torsoLen);
  if (sex === 'female') {
    const narrow = widestIn(shoulderY + 0.55 * torsoLen, shoulderY + 0.85 * torsoLen, true);
    if (narrow) chords.waist = horizontal(narrow.y, ...narrow.run);
    else place('waist', shoulderY + 0.72 * torsoLen);
  } else {
    place('waist', shoulderY + 0.72 * torsoLen);
  }
  const hips = widestIn(shoulderY + 0.85 * torsoLen, shoulderY + 1.25 * torsoLen);
  chords.hips = hips ? horizontal(hips.y, ...hips.run) : defaults.chords.hips;

  // Limbs: measure both sides, keep the cleaner one.
  if (pose) {
    const limb = (
      a: number,
      b: number,
      t: number | [number, number],
      cap: number,
    ): { chord: Chord; capped: boolean; width: number } | null => {
      if (!pose.visible(a) || !pose.visible(b)) return null;
      const pa = pose.p(a);
      const pb = pose.p(b);
      const axis = { x: pb.x - pa.x, y: pb.y - pa.y };
      const len = Math.hypot(axis.x, axis.y) || 1;
      const n = { x: -axis.y / len, y: axis.x / len };
      const ts = Array.isArray(t) ? [...Array(8)].map((_, i) => lerp(t[0], t[1], i / 7)) : [t];
      const samples = ts.map((tt) => {
        const c = lerpPt(pa, pb, tt);
        const plus = march(mask, c, n, cap);
        const minus = march(mask, c, { x: -n.x, y: -n.y }, cap);
        const capped = plus.capped || minus.capped;
        // When one side runs into the body, assume symmetry about the free side.
        const free = plus.capped ? minus.distance : plus.distance;
        const chord = capped
          ? perpendicular(c, axis, free, free)
          : perpendicular(c, axis, plus.distance, minus.distance);
        return { chord, capped, width: chordLength(chord) };
      });
      const clean = samples.filter((x) => !x.capped);
      const pool = clean.length ? clean : samples;
      // Widest clean sample (calf belly, arm mid-section); fall back to the widest estimate.
      return pool.reduce((a, b) => (b.width > a.width ? b : a));
    };
    const pickSide = (id: ChordId, left: ReturnType<typeof limb>, right: ReturnType<typeof limb>, warning: string) => {
      const options = [left, right].filter((o): o is NonNullable<typeof o> => !!o && o.width > 1);
      if (options.length === 0) return;
      options.sort((x, y) => Number(x.capped) - Number(y.capped));
      chords[id] = options[0].chord;
      if (options[0].capped) warnings.push(warning);
    };
    pickSide(
      'upperArm',
      limb(LM.shoulderL, LM.elbowL, [0.35, 0.75], H * 0.06),
      limb(LM.shoulderR, LM.elbowR, [0.35, 0.75], H * 0.06),
      WARNINGS.armsTouching,
    );
    pickSide(
      'forearm',
      limb(LM.elbowL, LM.wristL, 0.3, H * 0.05),
      limb(LM.elbowR, LM.wristR, 0.3, H * 0.05),
      WARNINGS.armsTouching,
    );
    pickSide(
      'thigh',
      limb(LM.hipL, LM.kneeL, 0.3, H * 0.08),
      limb(LM.hipR, LM.kneeR, 0.3, H * 0.08),
      WARNINGS.legsTogether,
    );
    pickSide(
      'calf',
      limb(LM.kneeL, LM.ankleL, [0.15, 0.5], H * 0.06),
      limb(LM.kneeR, LM.ankleR, [0.15, 0.5], H * 0.06),
      WARNINGS.legsTogether,
    );
  }
  for (const id of ['upperArm', 'forearm', 'thigh', 'calf'] as const) chords[id] ??= defaults.chords[id];

  // Crotch: walking up the centre line from the knees, the first row inside the body.
  const kneeY = pose?.knee.y ?? at(HEIGHT_FRACTIONS.knee);
  let crotchY = at(HEIGHT_FRACTIONS.crotch);
  const cx = pose?.hip.x ?? massCenter;
  for (let y = Math.round(hipY + 0.6 * (kneeY - hipY)); y > hipY - 0.1 * torsoLen; y--) {
    if (isPerson(mask, cx, y)) {
      crotchY = y;
      break;
    }
  }

  // Armpit: walking down from the shoulders, where the arms separate and the run narrows.
  let armpitY = shoulderY + 0.17 * torsoLen;
  const widths: number[] = [];
  for (let y = Math.round(shoulderY + 0.05 * torsoLen); y < shoulderY + 0.4 * torsoLen; y++) {
    const run = torsoRun(y);
    const w = run ? run[1] - run[0] : 0;
    if (widths.length >= 3) {
      const prev = (widths[widths.length - 1] + widths[widths.length - 2] + widths[widths.length - 3]) / 3;
      if (w < prev * 0.85) {
        armpitY = y;
        break;
      }
    }
    widths.push(w);
  }

  // Dense torso profile between crotch and armpit.
  const profile: ProfileRow[] = [];
  const hipsWidth = chords.hips ? chordLength(chords.hips) : H * 0.2;
  for (let i = 0; i <= 40; i++) {
    const y = lerp(crotchY - 1, armpitY + 1, i / 40);
    const run = torsoRun(y);
    if (run && run[1] - run[0] <= hipsWidth * 1.35) profile.push({ y, left: run[0], right: run[1] });
    else if (profile.length) profile.push({ ...profile[profile.length - 1], y });
  }

  if (clothesShare(mask, bounds, shoulderY, hipY) > 0.3) warnings.push(WARNINGS.clothes);
  if (clippedArms) warnings.push(WARNINGS.armsTouching);

  const markup: ViewMarkup = { view: 'front', width, height, top, floor, chords };
  return {
    markup,
    detected: structuredClone(markup),
    landmarks: pose ? landmarks : null,
    profile: profile.length >= 3 ? profile : null,
    crotchY,
    armpitY,
    warnings: [...new Set(warnings)],
    hasMask: true,
  };
}

// ---------------------------------------------------------------- side view

/** Heights (fraction of stature above the floor) at which side chords are measured. */
export type SideLevels = Record<SideChord, number> & { crotch: number; armpit: number };

export function sideLevelsFromFront(front: ViewAnalysis): SideLevels {
  const { top, floor, chords } = front.markup;
  const H = floor - top;
  const frac = (y: number) => (floor - y) / H;
  const y = (id: ChordId, fallback: number) => {
    const c = chords[id];
    return c ? frac(chordMid(c).y) : fallback;
  };
  return {
    neck: y('neck', HEIGHT_FRACTIONS.neck),
    chest: y('chest', HEIGHT_FRACTIONS.chest),
    waist: y('waist', HEIGHT_FRACTIONS.waist),
    hips: y('hips', HEIGHT_FRACTIONS.hips),
    thigh: y('thigh', HEIGHT_FRACTIONS.thigh),
    calf: y('calf', HEIGHT_FRACTIONS.calf),
    crotch: frac(front.crotchY),
    armpit: frac(front.armpitY),
  };
}

function facesRight(mask: Mask, bounds: Bounds, landmarks: Landmark[] | null, width: number): boolean {
  if (landmarks && landmarks.length >= 33) {
    const ears = (landmarks[LM.leftEar].x + landmarks[LM.rightEar].x) / 2;
    if (Math.abs(landmarks[LM.nose].x - ears) * width > 2) return landmarks[LM.nose].x > ears;
  }
  // The face (skin) sits in front of the hair when seen from the side.
  const headBottom = bounds.top + (bounds.bottom - bounds.top) * 0.13;
  let faceX = 0;
  let faceN = 0;
  let hairX = 0;
  let hairN = 0;
  for (let y = bounds.top; y < headBottom; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      const c = mask.data[y * mask.width + x];
      if (c === CATEGORY.faceSkin) {
        faceX += x;
        faceN++;
      } else if (c === CATEGORY.hair) {
        hairX += x;
        hairN++;
      }
    }
  }
  if (faceN && hairN) return faceX / faceN > hairX / hairN;
  return true;
}

/** Analyse a side (profile) photo using chord heights taken from the front view. */
export function analyzeSide(
  mask: Mask | null,
  landmarks: Landmark[] | null,
  width: number,
  height: number,
  levels: SideLevels,
): ViewAnalysis {
  const bounds = mask ? personBounds(mask) : null;
  if (!mask || !bounds) {
    const a = emptyAnalysis('side', width, height, [WARNINGS.noPerson]);
    return a;
  }
  const warnings = boundsWarnings(mask, bounds);
  const top = bounds.top;
  const floor = bodyPlaneFloor(landmarks, height, top, bounds.bottom + 1);
  const H = floor - top;
  const at = (f: number) => floor - f * H;
  const defaults = defaultMarkup('side', width, height);

  const chords: Partial<Record<ChordId, Chord>> = {};
  const deepestIn = (f0: number, f1: number) => {
    let best: { y: number; run: [number, number] } | null = null;
    for (let y = Math.round(at(f1)); y <= Math.round(at(f0)); y++) {
      const run = longestRun(mask, y);
      if (run && (!best || run[1] - run[0] > best.run[1] - best.run[0])) best = { y, run };
    }
    return best;
  };
  for (const id of ['neck', 'chest', 'waist', 'thigh'] as const) {
    const y = at(levels[id]);
    const run = longestRun(mask, y);
    chords[id] = run ? horizontal(y, run[0], run[1]) : defaults.chords[id];
  }
  const hips = deepestIn(levels.hips - 0.04, levels.hips + 0.04);
  chords.hips = hips ? horizontal(hips.y, ...hips.run) : defaults.chords.hips;
  const calf = deepestIn(0.15, 0.27);
  chords.calf = calf ? horizontal(calf.y, ...calf.run) : defaults.chords.calf;

  const crotchY = at(levels.crotch);
  const armpitY = at(levels.armpit);
  const profile: ProfileRow[] = [];
  for (let i = 0; i <= 40; i++) {
    const y = lerp(crotchY - 1, armpitY + 1, i / 40);
    const run = longestRun(mask, y);
    if (run) profile.push({ y, left: run[0], right: run[1] });
  }

  if (clothesShare(mask, bounds, armpitY, crotchY) > 0.3) warnings.push(WARNINGS.clothes);

  const markup: ViewMarkup = {
    view: 'side',
    width,
    height,
    top,
    floor,
    chords,
    facingRight: facesRight(mask, bounds, landmarks, width),
  };
  return {
    markup,
    detected: structuredClone(markup),
    landmarks,
    profile: profile.length >= 3 ? profile : null,
    crotchY,
    armpitY,
    warnings: [...new Set(warnings)],
    hasMask: true,
  };
}

// ---------------------------------------------------------------- corrections

/**
 * Rescale a detected silhouette profile so it agrees with the (possibly
 * hand-edited) chords: at each chord height the width ratio edited/detected
 * applies, linearly interpolated in between and held constant beyond.
 */
export function correctProfile(
  profile: ProfileRow[],
  detected: ViewMarkup,
  edited: ViewMarkup,
  ids: ChordId[],
): ProfileRow[] {
  const anchors = ids
    .map((id) => {
      const d = detected.chords[id];
      const e = edited.chords[id];
      if (!d || !e) return null;
      const dl = chordLength(d);
      return dl > 0 ? { y: chordMid(d).y, ratio: chordLength(e) / dl } : null;
    })
    .filter((a): a is { y: number; ratio: number } => !!a)
    .sort((a, b) => a.y - b.y);
  if (anchors.length === 0) return profile;
  const ratioAt = (y: number) => {
    if (y <= anchors[0].y) return anchors[0].ratio;
    for (let i = 1; i < anchors.length; i++) {
      if (y <= anchors[i].y) {
        const t = (y - anchors[i - 1].y) / (anchors[i].y - anchors[i - 1].y);
        return lerp(anchors[i - 1].ratio, anchors[i].ratio, t);
      }
    }
    return anchors[anchors.length - 1].ratio;
  };
  return profile.map((row) => {
    const c = (row.left + row.right) / 2;
    const half = ((row.right - row.left) / 2) * ratioAt(row.y);
    return { y: row.y, left: c - half, right: c + half };
  });
}

/** True when the user changed any chord or scale line relative to detection. */
export function isEdited(a: ViewAnalysis): boolean {
  return JSON.stringify(a.markup) !== JSON.stringify(a.detected);
}
