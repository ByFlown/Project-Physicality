import { CATEGORY, type Landmark, type Mask } from './types';

/**
 * Synthetic rasterised people for tests. Stature is 1000 px (top row 50,
 * floor row 1050), so at 180 cm one centimetre is 1000 / 180 ≈ 5.556 px.
 */
export const PX_PER_CM = 1000 / 180;
export const cmToPx = (cm: number) => cm * PX_PER_CM;

function blank(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

function set(m: Mask, x: number, y: number, c: number) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi >= 0 && yi >= 0 && xi < m.width && yi < m.height) m.data[yi * m.width + xi] = c;
}

function fillRow(m: Mask, y: number, x0: number, x1: number, c: number = CATEGORY.bodySkin) {
  for (let x = Math.round(x0); x < Math.round(x1); x++) set(m, x, y, c);
}

function ellipse(m: Mask, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(m, x, y, c);
}

/** Filled capsule from a to b with half-width r. */
function capsule(m: Mask, a: [number, number], b: [number, number], r: number, c: number = CATEGORY.bodySkin) {
  const [x0, x1] = [Math.min(a[0], b[0]) - r, Math.max(a[0], b[0]) + r];
  const [y0, y1] = [Math.min(a[1], b[1]) - r, Math.max(a[1], b[1]) + r];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  for (let y = Math.floor(y0); y <= y1; y++)
    for (let x = Math.floor(x0); x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
      if (Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= r) set(m, x, y, c);
    }
}

const interp = (pts: [number, number][], y: number) => {
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++)
    if (y <= pts[i][0]) {
      const t = (y - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    }
  return pts[pts.length - 1][1];
};

export interface FrontOptions {
  /** Draw the arms hanging against the torso instead of abducted. */
  armsTouching?: boolean;
  /** Paint the torso as clothing. */
  clothes?: boolean;
}

/** Front view. Chest 36 cm, waist 30 cm, hips 34 cm wide; upper arm 9 cm, forearm 7.5 cm; thighs 16 cm. */
export function frontPerson(opts: FrontOptions = {}): { mask: Mask; landmarks: Landmark[] } {
  const W = 800;
  const Hh = 1100;
  const m = blank(W, Hh);
  const cx = 400;
  const torsoCat = opts.clothes ? CATEGORY.clothes : CATEGORY.bodySkin;
  // Head + hair + neck
  ellipse(m, cx, 115, 45, 62, CATEGORY.faceSkin);
  for (let y = 50; y < 80; y++) fillRow(m, y, cx - 30 + (80 - y) * 0.5, cx + 30 - (80 - y) * 0.5, CATEGORY.hair);
  for (let y = 170; y < 215; y++) fillRow(m, y, cx - cmToPx(6), cx + cmToPx(6));
  // Torso half-width profile (px): shoulders incl. delts, chest, waist, hips.
  const half: [number, number][] = [
    [215, 110],
    [235, 128],
    [298, 128],
    [302, cmToPx(18)],
    [330, cmToPx(18)],
    [450, cmToPx(15)],
    [550, cmToPx(17)],
    [582, cmToPx(17)],
  ];
  for (let y = 215; y < 582; y++) {
    const h = interp(half, y);
    fillRow(m, y, cx - h, cx + h, y < 300 ? CATEGORY.bodySkin : torsoCat);
  }
  // Arms
  const armR = cmToPx(9) / 2;
  const angle = opts.armsTouching ? 0.02 : 0.3;
  const shoulderL: [number, number] = [cx - 115, 250];
  const shoulderR: [number, number] = [cx + 115, 250];
  const elbow = (s: [number, number], sign: number): [number, number] => [
    s[0] + sign * Math.sin(angle) * 167 + (opts.armsTouching ? sign * -10 : 0),
    s[1] + Math.cos(angle) * 167,
  ];
  const wrist = (e: [number, number], sign: number): [number, number] => [
    e[0] + sign * Math.sin(angle) * 144,
    e[1] + Math.cos(angle) * 144,
  ];
  const eL = elbow(shoulderL, -1);
  const eR = elbow(shoulderR, 1);
  const wL = wrist(eL, -1);
  const wR = wrist(eR, 1);
  capsule(m, shoulderL, eL, armR);
  capsule(m, shoulderR, eR, armR);
  capsule(m, eL, wL, cmToPx(7.5) / 2);
  capsule(m, eR, wR, cmToPx(7.5) / 2);
  // Legs
  const thighR = cmToPx(16) / 2;
  const hipL: [number, number] = [cx - 50, 520];
  const hipR: [number, number] = [cx + 50, 520];
  const kneeL: [number, number] = [cx - 55, 765];
  const kneeR: [number, number] = [cx + 55, 765];
  const ankleL: [number, number] = [cx - 55, 1011];
  const ankleR: [number, number] = [cx + 55, 1011];
  capsule(m, hipL, kneeL, thighR);
  capsule(m, hipR, kneeR, thighR);
  capsule(m, kneeL, ankleL, cmToPx(11) / 2);
  capsule(m, kneeR, ankleR, cmToPx(11) / 2);
  for (let y = 1011; y < 1050; y++) {
    fillRow(m, y, ankleL[0] - 20, ankleL[0] + 20);
    fillRow(m, y, ankleR[0] - 20, ankleR[0] + 20);
  }

  const pts: Record<number, [number, number]> = {
    0: [cx, 120],
    7: [cx - 45, 110],
    8: [cx + 45, 110],
    9: [cx - 10, 145],
    10: [cx + 10, 145],
    11: shoulderL,
    12: shoulderR,
    13: eL,
    14: eR,
    15: wL,
    16: wR,
    23: hipL,
    24: hipR,
    25: kneeL,
    26: kneeR,
    27: ankleL,
    28: ankleR,
  };
  const landmarks: Landmark[] = Array.from({ length: 33 }, (_, i) => {
    const p = pts[i] ?? [cx, 500];
    return { x: p[0] / W, y: p[1] / Hh, visibility: pts[i] ? 0.99 : 0.1 };
  });
  return { mask: m, landmarks };
}

/** Side view facing image-right. Chest 24 cm, waist 22 cm, hips 25 cm deep; thigh 17 cm; calf 11 cm. */
export function sidePerson(facingRight = true): Mask {
  const W = 500;
  const Hh = 1100;
  const m = blank(W, Hh);
  const axis = 250;
  const dir = facingRight ? 1 : -1;
  // Head: face in front, hair behind.
  ellipse(m, axis + dir * 5, 115, 55, 62, CATEGORY.hair);
  ellipse(m, axis + dir * 30, 125, 30, 50, CATEGORY.faceSkin);
  for (let y = 170; y < 215; y++) fillRow(m, y, axis - cmToPx(6), axis + cmToPx(6));
  // Torso: [row, front extent, back extent] in cm from the axis.
  const prof: [number, number, number][] = [
    [215, 9, 10],
    [330, 13, 11],
    [450, 12, 10],
    [550, 11, 14],
    [582, 10, 12],
  ];
  const f = prof.map(([y, fr]) => [y, cmToPx(fr)] as [number, number]);
  const b = prof.map(([y, , bk]) => [y, cmToPx(bk)] as [number, number]);
  for (let y = 215; y < 582; y++) {
    const fr = interp(f, y);
    const bk = interp(b, y);
    fillRow(m, y, facingRight ? axis - bk : axis - fr, facingRight ? axis + fr : axis + bk);
  }
  // Legs (overlapping in profile)
  for (let y = 582; y < 1011; y++) {
    const depth =
      y < 765
        ? interp(
            [
              [582, 17],
              [765, 11],
            ],
            y,
          )
        : interp(
            [
              [765, 10],
              [840, 11],
              [1011, 7],
            ],
            y,
          );
    const half = cmToPx(depth) / 2;
    fillRow(m, y, axis - half, axis + half);
  }
  for (let y = 1011; y < 1050; y++) fillRow(m, y, axis - 20, axis + 60 * dir + 20 * (1 - dir));
  return m;
}
