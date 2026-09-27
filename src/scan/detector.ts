import type { ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark, Mask } from './types';

/**
 * On-device body detection with MediaPipe. Models and the WASM runtime are
 * self-hosted under /vision (see scripts/prepare-vision-assets.mjs); nothing
 * is sent anywhere. Both tasks run on the CPU delegate: requesting
 * segmentation masks from PoseLandmarker crashes on CPU and reads back zeros
 * on some GPUs, so the silhouette comes from ImageSegmenter instead.
 */

const BASE = `${import.meta.env.BASE_URL}vision`;
const MODELS = {
  pose: { url: `${BASE}/pose_landmarker_full.task`, size: 9_398_198 },
  segmenter: { url: `${BASE}/selfie_multiclass_256x256.tflite`, size: 16_371_837 },
};

export type ProgressFn = (fraction: number, label: string) => void;

interface Vision {
  pose: PoseLandmarker;
  segmenter: ImageSegmenter;
}

let vision: Promise<Vision> | null = null;

async function fetchModel(url: string, expected: number, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not download ${url.split('/').pop()} (${res.status})`);
  if (res.headers.get('content-type')?.includes('text/html')) {
    throw new Error('The body-scan models are not available on this server');
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(Math.min(received, expected));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Load (once) the pose and segmentation tasks, reporting download progress. */
export function loadVision(onProgress?: ProgressFn): Promise<Vision> {
  vision ??= (async () => {
    const total = MODELS.pose.size + MODELS.segmenter.size;
    let poseBytes = 0;
    let segBytes = 0;
    const report = () => onProgress?.((poseBytes + segBytes) / total, 'Downloading body-scan models (one time)…');
    report();
    const [{ FilesetResolver, ImageSegmenter, PoseLandmarker }, poseModel, segModel] = await Promise.all([
      import('@mediapipe/tasks-vision'),
      fetchModel(MODELS.pose.url, MODELS.pose.size, (n) => {
        poseBytes = n;
        report();
      }),
      fetchModel(MODELS.segmenter.url, MODELS.segmenter.size, (n) => {
        segBytes = n;
        report();
      }),
    ]);
    onProgress?.(1, 'Starting the vision engine…');
    const fileset = await FilesetResolver.forVisionTasks(BASE);
    const [pose, segmenter] = await Promise.all([
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: poseModel, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numPoses: 1,
      }),
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: segModel, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    ]);
    return { pose, segmenter };
  })().catch((err) => {
    vision = null; // allow a retry
    throw err;
  });
  return vision;
}

export interface Detection {
  landmarks: Landmark[] | null;
  mask: Mask | null;
  error?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Detect pose landmarks and the person mask in one image. Never throws: on any
 * failure it returns an `error` so the UI can switch to manual placement.
 */
export async function detectPerson(image: HTMLCanvasElement, onProgress?: ProgressFn): Promise<Detection> {
  try {
    const { pose, segmenter } = await withTimeout(
      loadVision(onProgress),
      180_000,
      'Loading the body-scan models took too long.',
    );
    onProgress?.(1, 'Analysing photo…');
    // Let the progress message paint before the synchronous inference blocks the thread.
    await new Promise((r) => setTimeout(r, 30));
    let landmarks: Landmark[] | null = null;
    pose.detect(image, (r) => {
      const first = r.landmarks[0];
      landmarks = first ? first.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 })) : null;
    });
    let mask: Mask | null = null;
    segmenter.segment(image, (r) => {
      const m = r.categoryMask;
      if (m) mask = { width: m.width, height: m.height, data: new Uint8Array(m.getAsUint8Array()) };
    });
    return { landmarks, mask };
  } catch (err) {
    return { landmarks: null, mask: null, error: err instanceof Error ? err.message : String(err) };
  }
}
