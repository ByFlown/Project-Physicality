import type { Vec3 } from './model';

/**
 * Tape-measure geometry on a triangle mesh. A circumference is the perimeter
 * of the convex hull of a planar slice — exactly what a tape does: it follows
 * convex curves and bridges concave ones.
 */

export interface Plane {
  origin: Vec3;
  /** Unit normal. */
  normal: Vec3;
}

/** The mesh edge a slice point lies on: lerp(vertex a, vertex b, t). */
export interface SliceEdge {
  a: number;
  b: number;
  t: number;
}

export interface SliceLoop {
  /** Points in plane coordinates (u, v). */
  points: [number, number][];
  /** Source edge of each point (same order). */
  edges: SliceEdge[];
  /** Centroid in plane coordinates. */
  center: [number, number];
}

export interface Slice {
  u: Vec3;
  v: Vec3;
  loops: SliceLoop[];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * In-plane axes. `u` is the plane's horizontal axis when possible: for a
 * horizontal plane u = +x and v = +z; for a limb plane u lies in the
 * coronal (x–y) plane, so u-extents match what a front photo sees.
 */
export function planeAxes(normal: Vec3): { u: Vec3; v: Vec3 } {
  const n = norm(normal);
  // u ⟂ n and ⟂ z (in the coronal plane), unless n ≈ ±z.
  let u: Vec3 = cross(n, [0, 0, 1]);
  if (Math.hypot(...u) < 1e-6) u = [1, 0, 0];
  u = norm(u);
  if (u[0] < 0) u = [-u[0], -u[1], -u[2]];
  const v = norm(cross(u, n));
  // Keep v pointing to +z (front).
  return v[2] < 0 ? { u, v: [-v[0], -v[1], -v[2]] } : { u, v };
}

/** Intersect the mesh with a plane and group the cut into connected loops. */
export function slice(
  positions: Float32Array,
  tris: ArrayLike<number>,
  plane: Plane,
  include?: (vertex: number) => boolean,
): Slice {
  const n = norm(plane.normal);
  const { u, v } = planeAxes(n);
  const d0 = dot(n, plane.origin);
  const vertexCount = positions.length / 3;
  const side = new Float64Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    side[i] = n[0] * positions[i * 3] + n[1] * positions[i * 3 + 1] + n[2] * positions[i * 3 + 2] - d0;
  }
  // Edge-crossing points keyed by vertex pair, linked into loops with union-find.
  const pointOf = new Map<number, number>();
  const pts: [number, number][] = [];
  const edges: SliceEdge[] = [];
  const parent: number[] = [];
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const edgePoint = (a: number, b: number) => {
    const k = a < b ? a * vertexCount + b : b * vertexCount + a;
    let id = pointOf.get(k);
    if (id !== undefined) return id;
    const t = side[a] / (side[a] - side[b]);
    const p: Vec3 = [
      positions[a * 3] + (positions[b * 3] - positions[a * 3]) * t,
      positions[a * 3 + 1] + (positions[b * 3 + 1] - positions[a * 3 + 1]) * t,
      positions[a * 3 + 2] + (positions[b * 3 + 2] - positions[a * 3 + 2]) * t,
    ];
    const rel: Vec3 = [p[0] - plane.origin[0], p[1] - plane.origin[1], p[2] - plane.origin[2]];
    id = pts.length;
    pts.push([dot(rel, u), dot(rel, v)]);
    edges.push({ a, b, t });
    parent.push(id);
    pointOf.set(k, id);
    return id;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t];
    const b = tris[t + 1];
    const c = tris[t + 2];
    if (include && !(include(a) && include(b) && include(c))) continue;
    const sa = side[a] >= 0;
    const sb = side[b] >= 0;
    const sc = side[c] >= 0;
    if (sa === sb && sb === sc) continue;
    const cut: number[] = [];
    if (sa !== sb) cut.push(edgePoint(a, b));
    if (sb !== sc) cut.push(edgePoint(b, c));
    if (sc !== sa) cut.push(edgePoint(c, a));
    if (cut.length === 2) {
      const ra = find(cut[0]);
      const rb = find(cut[1]);
      if (ra !== rb) parent[ra] = rb;
    }
  }
  const groups = new Map<number, number[]>();
  pts.forEach((_, i) => {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  });
  const loops: SliceLoop[] = [];
  for (const ids of groups.values()) {
    const points = ids.map((i) => pts[i]);
    if (points.length < 3) continue;
    let cu = 0;
    let cv = 0;
    for (const p of points) {
      cu += p[0];
      cv += p[1];
    }
    loops.push({ points, edges: ids.map((i) => edges[i]), center: [cu / points.length, cv / points.length] });
  }
  return { u, v, loops };
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const crossZ = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function perimeter(poly: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return s;
}

/** The loop whose hull contains the plane origin, or null. */
export function loopAroundOrigin(s: Slice): SliceLoop | null {
  for (const loop of s.loops) if (contains(convexHull(loop.points), [0, 0])) return loop;
  return null;
}

/** The loop whose hull contains the plane origin, else the one nearest to it. */
export function loopAtOrigin(s: Slice): SliceLoop | null {
  let best: SliceLoop | null = null;
  let bestD = Infinity;
  for (const loop of s.loops) {
    const hull = convexHull(loop.points);
    if (contains(hull, [0, 0])) return loop;
    const d = Math.hypot(...loop.center);
    if (d < bestD) {
      bestD = d;
      best = loop;
    }
  }
  return best;
}

function contains(hull: [number, number][], p: [number, number]): boolean {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) return false;
  }
  return true;
}

export interface Girth {
  /** Tape circumference (convex hull perimeter). */
  circumference: number;
  /** Extent along u (front-view width) and v (side-view depth). */
  width: number;
  depth: number;
  /** v-extents relative to the plane origin: front (+) and back (−). */
  front: number;
  back: number;
  /** u-extents relative to the plane origin. */
  left: number;
  right: number;
}

export function girthOf(points: [number, number][]): Girth {
  const hull = convexHull(points);
  let umin = Infinity;
  let umax = -Infinity;
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const [a, b] of hull) {
    umin = Math.min(umin, a);
    umax = Math.max(umax, a);
    vmin = Math.min(vmin, b);
    vmax = Math.max(vmax, b);
  }
  return {
    circumference: perimeter(hull),
    width: umax - umin,
    depth: vmax - vmin,
    front: vmax,
    back: vmin,
    left: umin,
    right: umax,
  };
}

/** Girth of the loop through `origin` on a plane with the given normal. */
export function girthAt(
  positions: Float32Array,
  tris: ArrayLike<number>,
  origin: Vec3,
  normal: Vec3,
  include?: (vertex: number) => boolean,
): Girth | null {
  const s = slice(positions, tris, { origin, normal }, include);
  const loop = loopAtOrigin(s);
  return loop ? girthOf(loop.points) : null;
}
