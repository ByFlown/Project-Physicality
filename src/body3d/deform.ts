import { MUSCLE_IDS, type MuscleId } from '../domain/muscles';
import type { MusclePart } from './anatomy';
import type { Loft } from './geometry';

export type RGB = [number, number, number];

export interface MuscleLook {
  /** Linear-space colour. */
  color: RGB;
  /** Multiplier on each part's bulge (derived from level). */
  bulgeScale: number;
  /** 0..1 — brighten for hover / selection. */
  highlight: number;
}

export interface DeformOptions {
  skin: RGB;
  /** 0..1 — scales abdominal definition with body fat. */
  absDefinition: number;
  /** Colour opacity of muscle regions over skin. */
  tint?: number;
}

const MUSCLE_INDEX = new Map(MUSCLE_IDS.map((id, i) => [id, i]));

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface PreparedPart {
  p: MusclePart;
  cos: number;
  sin: number;
  hw: number;
  hh: number;
  bulge: number;
  color: RGB;
  index: number;
  yMin: number;
  yMax: number;
}

/** Resolve per-part bulge, colour and footprint trigonometry once per render. */
export function prepareParts(
  parts: MusclePart[],
  looks: Record<MuscleId, MuscleLook>,
  absDefinition: number,
): PreparedPart[] {
  return parts.map((p) => {
    const t = p.tilt ?? 0;
    const look = looks[p.muscle];
    const bulge = p.bulge * look.bulgeScale * (p.muscle === 'abs' ? absDefinition : 1);
    const hi = look.highlight;
    const c = look.color;
    return {
      p,
      cos: Math.cos(t),
      sin: Math.sin(t),
      hw: p.width / 2,
      hh: p.height / 2,
      bulge,
      color: [c[0] + (1 - c[0]) * hi * 0.5, c[1] + (1 - c[1]) * hi * 0.5, c[2] + (1 - c[2]) * hi * 0.5],
      index: MUSCLE_INDEX.get(p.muscle) ?? -1,
      yMin: p.y - Math.max(p.width, p.height),
      yMax: p.y + Math.max(p.width, p.height),
    };
  });
}

export interface SurfaceSample {
  /** Outward displacement along the surface normal, metres. */
  disp: number;
  /** 0..1 — how strongly the dominant muscle colours this point. */
  coverage: number;
  color: RGB | null;
  index: number;
}

/**
 * Muscle displacement at a surface point given in segment coordinates
 * (height `y`, angle `a` around the axis, local radius `r`). Overlapping
 * muscles combine as the strongest bulge plus 30% of the rest, which keeps
 * visible creases between neighbouring muscles.
 */
export function displacementAt(prepared: PreparedPart[], y: number, a: number, r: number): SurfaceSample {
  let hMax = 0;
  let hSum = 0;
  let coverage = 0;
  let color: RGB | null = null;
  let index = -1;
  for (const q of prepared) {
    if (y < q.yMin || y > q.yMax) continue;
    const u0 = wrapAngle(a - q.p.angle) * r;
    const v0 = y - q.p.y;
    const u = u0 * q.cos + v0 * q.sin;
    const w = -u0 * q.sin + v0 * q.cos;
    const d2 = (u / q.hw) ** 2 + (w / q.hh) ** 2;
    if (d2 >= 1) continue;
    const h = q.bulge * (1 - d2) ** 1.5;
    hSum += h;
    if (h > hMax) hMax = h;
    const cov = 1 - smoothstep(0.78, 1, Math.sqrt(d2));
    if (cov > coverage) {
      coverage = cov;
      color = q.color;
      index = q.index;
    }
  }
  return { disp: hMax + 0.3 * (hSum - hMax), coverage, color, index };
}

/**
 * Displace a lofted skin outward where muscles lie and paint vertex colours.
 * Returns the dominant muscle index per vertex (−1 for bare skin) for picking.
 */
export function deformLoft(
  loft: Loft,
  parts: MusclePart[],
  looks: Record<MuscleId, MuscleLook>,
  opts: DeformOptions,
): Int16Array {
  const { basePositions, baseNormals, params, vertexCount, geometry } = loft;
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const pos = position.array as Float32Array;
  const col = color.array as Float32Array;
  const owner = new Int16Array(vertexCount).fill(-1);
  const tint = opts.tint ?? 0.9;
  const prepared = prepareParts(parts, looks, opts.absDefinition);

  for (let v = 0; v < vertexCount; v++) {
    const i3 = v * 3;
    const y = params[i3];
    const s = Number.isNaN(y)
      ? { disp: 0, coverage: 0, color: null, index: -1 }
      : displacementAt(prepared, y, params[i3 + 1], params[i3 + 2]);

    pos[i3] = basePositions[i3] + baseNormals[i3] * s.disp;
    pos[i3 + 1] = basePositions[i3 + 1] + baseNormals[i3 + 1] * s.disp;
    pos[i3 + 2] = basePositions[i3 + 2] + baseNormals[i3 + 2] * s.disp;

    const k = s.color ? s.coverage * tint : 0;
    const c = s.color ?? opts.skin;
    col[i3] = opts.skin[0] * (1 - k) + c[0] * k;
    col[i3 + 1] = opts.skin[1] * (1 - k) + c[1] * k;
    col[i3 + 2] = opts.skin[2] * (1 - k) + c[2] * k;
    if (s.coverage > 0.35) owner[v] = s.index;
  }

  position.needsUpdate = true;
  color.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return owner;
}
