import {
  coeffsFromSemantic,
  expandHalf,
  jointsOf,
  LOCAL_SLIDERS,
  shapeHalf,
  triangles,
  type HumanModel,
  type Vec3,
} from '../../body3d/human/model';
import { measureSites, vertexParts } from '../../body3d/human/sites';
import { MEASURE_SITES, type MeasureSite, type Scan, type Sex } from '../../domain/schema';
import { buildScan } from '../buildScan';
import { fitBody, modelCircumferences, scanObservations } from '../fit';
import { analyzeFront, analyzeSide, sideLevelsFromFront } from '../geometry';
import type { ViewAnalysis } from '../types';
import { biasMask, degradeMask, photograph, posed, type CameraSetup } from './synth';

/**
 * Scan accuracy benchmark. Random bodies are generated from the body model,
 * perturbed with smooth bumps the model cannot represent (real people are not
 * MakeHuman bodies), photographed synthetically, and run through the scan
 * pipeline. Errors are scan circumference − tape circumference on the mesh.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gaussian = (rand: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand());
const uniform = (rand: () => number, a: number, b: number) => a + (b - a) * rand();

export function vertexNormals(positions: Float32Array, tris: ArrayLike<number>): Float32Array {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3];
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[v + k] += f[k];
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

export interface Subject {
  sex: Sex;
  statureM: number;
  rest: Float32Array;
  joints: Record<string, Vec3>;
  /** Tape circumferences on the mesh (cm), arms relaxed at the sides. */
  truth: Partial<Record<MeasureSite, number>>;
}

/** A random adult body, with off-model bumps (amplitude in metres). */
export function randomSubject(model: HumanModel, rand: () => number, bumpAmplitude = 0.008): Subject {
  const sex = model.sex;
  const semantic = {
    age: uniform(rand, 25, 65),
    muscle: uniform(rand, 0.2, 0.95),
    weight: uniform(rand, 0.15, 0.95),
    height: rand(),
    proportions: uniform(rand, 0.3, 1),
    breast: sex === 'female' ? uniform(rand, 0.2, 0.9) : 0.5,
  };
  const local = Object.fromEntries(LOCAL_SLIDERS.map((n) => [n, Math.max(-1, Math.min(1, gaussian(rand) * 0.3))]));
  const half = shapeHalf(model, coeffsFromSemantic(model, semantic, local));
  const statureM = sex === 'male' ? uniform(rand, 1.62, 1.96) : uniform(rand, 1.5, 1.82);
  const rest = expandHalf(model, half, statureM);
  const joints = jointsOf(model, half, statureM);
  const tris = triangles(model);

  if (bumpAmplitude > 0) {
    const normals = vertexNormals(rest, tris);
    const bumps = Array.from({ length: 10 }, () => {
      const v = Math.floor(rand() * model.vertexCount);
      return {
        c: [Math.abs(rest[v * 3]), rest[v * 3 + 1], rest[v * 3 + 2]],
        r: uniform(rand, 0.04, 0.12) * statureM,
        a: gaussian(rand) * bumpAmplitude,
      };
    });
    for (let v = 0; v < model.vertexCount; v++) {
      const p = [Math.abs(rest[v * 3]), rest[v * 3 + 1], rest[v * 3 + 2]];
      let d = 0;
      for (const b of bumps) {
        const q = (p[0] - b.c[0]) ** 2 + (p[1] - b.c[1]) ** 2 + (p[2] - b.c[2]) ** 2;
        d += b.a * Math.exp(-q / (2 * b.r * b.r));
      }
      for (let k = 0; k < 3; k++) rest[v * 3 + k] += normals[v * 3 + k] * d;
    }
  }

  const parts = vertexParts(model);
  const tape = posed(model, rest, joints, 0.12);
  const sites = measureSites({ positions: tape.positions, tris, joints: tape.joints, parts, sex });
  const truth: Partial<Record<MeasureSite, number>> = {};
  for (const s of MEASURE_SITES) if (sites[s]) truth[s] = sites[s]!.circumference * 100;
  return { sex, statureM, rest, joints, truth };
}

export interface Scenario {
  name: string;
  camera: (rand: () => number, statureM: number) => { front: CameraSetup; side: CameraSetup };
  landmarkNoisePx: number;
  /** Std-dev of off-model bumps (m); defaults to 8 mm. */
  offModelM?: number;
  /** Simulate a 256×256 segmentation model and a ±px edge bias. */
  degrade: boolean;
  edgeBiasPx: number;
}

/**
 * A portrait phone photo. The user aims the phone at the middle of the body
 * (so a camera above or below that point tilts), and the body fills `fill`
 * of the frame height.
 */
function portrait(statureM: number, distanceM: number, fill: number, heightM: number, pitchNoise: number): CameraSetup {
  const pitch = Math.atan2(heightM - statureM / 2, distanceM) + pitchNoise;
  return { width: 960, height: 1280, focal: (fill * 1280 * distanceM) / statureM, heightM, distanceM, pitch };
}

const idealCamera = (s: number) => portrait(s, 2.5, 0.85, s / 2, 0);
const phoneCamera = (r: () => number, s: number) =>
  portrait(s, uniform(r, 2, 3.2), uniform(r, 0.72, 0.88), uniform(r, 0.8, 1.4), gaussian(r) * 0.03);

/** Phone held upright (no tilt) near hip height; the body sits wherever the horizon puts it. */
const levelCamera = (r: () => number, s: number) => {
  const h = uniform(r, 0.8, 1.15);
  const d = uniform(r, 2, 3.2);
  const fill = Math.min(0.88, (0.95 * s) / (2 * Math.max(s - h, h)));
  return { ...portrait(s, d, fill, h, 0), pitch: gaussian(r) * 0.02 };
};

export const SCENARIOS: Record<string, Scenario> = {
  ideal: {
    name: 'ideal: exact mask + landmarks, level camera at mid-body height, 2.5 m',
    camera: (_r, s) => ({ front: idealCamera(s), side: idealCamera(s) }),
    landmarkNoisePx: 0,
    degrade: false,
    edgeBiasPx: 0,
  },
  camera: {
    name: 'camera only: 2–3.2 m away, 0.8–1.4 m high, aimed at the body',
    camera: (r, s) => ({ front: phoneCamera(r, s), side: phoneCamera(r, s) }),
    landmarkNoisePx: 0,
    degrade: false,
    edgeBiasPx: 0,
  },
  level: {
    name: 'level phone: upright (±1° tilt), 0.8–1.15 m high, 2–3.2 m away',
    camera: (r, s) => ({ front: levelCamera(r, s), side: levelCamera(r, s) }),
    landmarkNoisePx: 0,
    degrade: false,
    edgeBiasPx: 0,
  },
  offModel: {
    name: 'off-model: ideal photos of bodies with 2 cm bumps the model cannot represent',
    camera: (_r, s) => ({ front: idealCamera(s), side: idealCamera(s) }),
    landmarkNoisePx: 0,
    offModelM: 0.02,
    degrade: false,
    edgeBiasPx: 0,
  },
  segmenter: {
    name: 'segmenter only: 256-px mask, ±1 px edge bias',
    camera: (_r, s) => ({ front: idealCamera(s), side: idealCamera(s) }),
    landmarkNoisePx: 0,
    degrade: true,
    edgeBiasPx: 1,
  },
  landmarks: {
    name: 'landmarks only: 4 px noise',
    camera: (_r, s) => ({ front: idealCamera(s), side: idealCamera(s) }),
    landmarkNoisePx: 4,
    degrade: false,
    edgeBiasPx: 0,
  },
  phone: {
    name: 'phone: all of the above',
    camera: (r, s) => ({ front: phoneCamera(r, s), side: phoneCamera(r, s) }),
    landmarkNoisePx: 4,
    degrade: true,
    edgeBiasPx: 1,
  },
};

export interface ScanPipeline {
  name: string;
  run(input: { front: ViewAnalysis; side: ViewAnalysis; heightCm: number; sex: Sex }): Pick<Scan, 'circumferences'>;
}

export const CHORD_PIPELINE: ScanPipeline = {
  name: 'chords (current)',
  run: ({ front, side, heightCm, sex }) =>
    buildScan({ id: 'bench', date: '2026-01-01', heightCm, sex, front, side, photosKept: false }),
};

/** Model-based: fit the body model to the photo observations, measure the fitted mesh. */
export function modelPipeline(models: Record<Sex, HumanModel>): ScanPipeline {
  return {
    name: 'model fit',
    run: ({ front, side, heightCm, sex }) => {
      const input = { id: 'bench', date: '2026-01-01', heightCm, sex, front, side, photosKept: false };
      const scan = buildScan(input);
      const model = models[sex];
      const fit = fitBody(model, scanObservations(input, scan), {
        statureM: heightCm / 100,
        armAbduction: scan.joints.armAngle,
      });
      return { circumferences: modelCircumferences(model, fit.coeffs, heightCm / 100, sex) };
    },
  };
}

export interface SiteStats {
  n: number;
  bias: number;
  sd: number;
  mae: number;
  max: number;
}

export interface BenchResult {
  scenario: string;
  pipeline: string;
  sites: Partial<Record<MeasureSite, SiteStats>>;
  /** Mean absolute error over all sites. */
  overallMae: number;
}

export function runBenchmark(opts: {
  models: HumanModel[];
  subjectsPerModel: number;
  scenario: Scenario;
  pipelines: ScanPipeline[];
  seed?: number;
}): BenchResult[] {
  const errors = opts.pipelines.map(() => new Map<MeasureSite, number[]>());
  for (const model of opts.models) {
    const rand = mulberry32((opts.seed ?? 1) * 7919 + (model.sex === 'male' ? 0 : 104729));
    const parts = vertexParts(model);
    for (let i = 0; i < opts.subjectsPerModel; i++) {
      const subject = randomSubject(model, rand, opts.scenario.offModelM);
      const cams = opts.scenario.camera(rand, subject.statureM);
      const photos = photograph(model, subject.rest, subject.joints, parts, {
        front: cams.front,
        side: cams.side,
        landmarkNoisePx: opts.scenario.landmarkNoisePx,
        rand,
      });
      const prep = (m: typeof photos.front.mask) => {
        let out = opts.scenario.degrade ? degradeMask(m) : m;
        if (opts.scenario.edgeBiasPx) out = biasMask(out, Math.round(uniform(rand, -1, 1) * opts.scenario.edgeBiasPx));
        return out;
      };
      const fm = prep(photos.front.mask);
      const sm = prep(photos.side.mask);
      const front = analyzeFront(fm, photos.front.landmarks, fm.width, fm.height, subject.sex);
      const side = analyzeSide(sm, photos.side.landmarks, sm.width, sm.height, sideLevelsFromFront(front));
      opts.pipelines.forEach((p, k) => {
        const scan = p.run({ front, side, heightCm: subject.statureM * 100, sex: subject.sex });
        for (const site of MEASURE_SITES) {
          const t = subject.truth[site];
          const v = scan.circumferences[site];
          if (t === undefined || v === undefined) continue;
          const list = errors[k].get(site) ?? [];
          list.push(v - t);
          errors[k].set(site, list);
        }
      });
    }
  }
  return opts.pipelines.map((p, k) => {
    const sites: Partial<Record<MeasureSite, SiteStats>> = {};
    let absSum = 0;
    let absN = 0;
    for (const [site, e] of errors[k]) {
      const n = e.length;
      const bias = e.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(e.reduce((a, b) => a + (b - bias) ** 2, 0) / Math.max(1, n - 1));
      const mae = e.reduce((a, b) => a + Math.abs(b), 0) / n;
      sites[site] = { n, bias, sd, mae, max: Math.max(...e.map(Math.abs)) };
      absSum += mae * n;
      absN += n;
    }
    return { scenario: opts.scenario.name, pipeline: p.name, sites, overallMae: absSum / Math.max(1, absN) };
  });
}

export function formatResults(results: BenchResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`\n${r.pipeline} — ${r.scenario}`);
    lines.push('site        n   bias    sd    MAE    max   (cm)');
    for (const site of MEASURE_SITES) {
      const s = r.sites[site];
      if (!s) continue;
      const f = (x: number) => x.toFixed(1).padStart(6);
      lines.push(`${site.padEnd(10)}${String(s.n).padStart(3)} ${f(s.bias)}${f(s.sd)}${f(s.mae)}${f(s.max)}`);
    }
    lines.push(`overall MAE ${r.overallMae.toFixed(2)} cm`);
  }
  return lines.join('\n');
}
