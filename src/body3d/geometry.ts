import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from 'three';

/** An elliptical cross-section of a lofted body part. */
export interface Ring {
  y: number;
  /** Half-width along x. */
  w: number;
  /** Half-depth along z. */
  d: number;
  /** Centre offset along x / z. */
  x?: number;
  z?: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Smoothly interpolate control rings into `perSpan` rings per segment. */
export function sampleRings(rings: Ring[], perSpan: number): Required<Ring>[] {
  const out: Required<Ring>[] = [];
  const get = (i: number) => rings[Math.min(rings.length - 1, Math.max(0, i))];
  const keys = ['y', 'w', 'd', 'x', 'z'] as const;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan;
      const r = {} as Required<Ring>;
      for (const k of keys) {
        r[k] = catmullRom(get(i - 1)[k] ?? 0, get(i)[k] ?? 0, get(i + 1)[k] ?? 0, get(i + 2)[k] ?? 0, t);
      }
      r.w = Math.max(0.001, r.w);
      r.d = Math.max(0.001, r.d);
      out.push(r);
    }
  }
  const last = rings[rings.length - 1];
  out.push({ x: 0, z: 0, ...last });
  return out;
}

/**
 * A lofted surface plus the per-vertex surface parameters needed to deform it.
 * `params` holds (y, angle, radius) per vertex; cap centres get NaN.
 * Angle 0 faces +z (front), +π/2 faces +x.
 */
export interface Loft {
  geometry: BufferGeometry;
  basePositions: Float32Array;
  baseNormals: Float32Array;
  params: Float32Array;
  vertexCount: number;
}

export function buildLoft(rings: Ring[], radial = 48, perSpan = 8): Loft {
  const samples = sampleRings(rings, perSpan);
  const positions: number[] = [];
  const normals: number[] = [];
  const params: number[] = [];
  const indices: number[] = [];

  for (const r of samples) {
    const radius = Math.sqrt((r.w * r.w + r.d * r.d) / 2);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      positions.push(r.x + s * r.w, r.y, r.z + c * r.d);
      const nx = s / r.w;
      const nz = c / r.d;
      const len = Math.hypot(nx, nz) || 1;
      normals.push(nx / len, 0, nz / len);
      params.push(r.y, a > Math.PI ? a - Math.PI * 2 : a, radius);
    }
  }
  const ascending = samples[samples.length - 1].y > samples[0].y;
  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      if (ascending) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ringIndex: number, flip: boolean) => {
    const r = samples[ringIndex];
    const center = positions.length / 3;
    positions.push(r.x, r.y, r.z);
    normals.push(0, ascending === (ringIndex === 0) ? -1 : 1, 0);
    params.push(Number.NaN, Number.NaN, Number.NaN);
    for (let j = 0; j < radial; j++) {
      const a = ringIndex * radial + j;
      const b = ringIndex * radial + ((j + 1) % radial);
      if (flip) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  };
  addCap(0, ascending);
  addCap(samples.length - 1, !ascending);

  const geometry = new BufferGeometry();
  const basePositions = new Float32Array(positions);
  geometry.setAttribute('position', new Float32BufferAttribute(basePositions.slice(), 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return {
    geometry,
    basePositions,
    baseNormals: new Float32Array(normals),
    params: new Float32Array(params),
    vertexCount: positions.length / 3,
  };
}

/** Shared unit sphere for head, hands and feet. */
export const UNIT_SPHERE = new SphereGeometry(1, 40, 28);
