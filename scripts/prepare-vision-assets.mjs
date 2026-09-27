// Copies the MediaPipe WASM runtime and downloads the pinned pose model into
// public/vision so body scans run fully offline and same-origin (no CDN, no
// photo ever leaves the device). Idempotent; verifies the model checksum.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vision');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

// Versioned URLs ("/1/", not "/latest/") so the checksums stay stable.
const MODELS = [
  {
    file: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
    env: 'PHYSICALITY_POSE_MODEL',
  },
  {
    file: 'selfie_multiclass_256x256.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
    sha256: 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0',
    env: 'PHYSICALITY_SEGMENTER_MODEL',
  },
];

const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const exists = (p) =>
  stat(p).then(
    () => true,
    () => false,
  );

await mkdir(out, { recursive: true });
for (const f of WASM_FILES) await copyFile(join(wasmSrc, f), join(out, f));

for (const MODEL of MODELS) {
  const modelPath = join(out, MODEL.file);
  if ((await exists(modelPath)) && sha256(await readFile(modelPath)) === MODEL.sha256) {
    console.log(`[vision] ${MODEL.file} up to date`);
    continue;
  }
  // An env var can point at a local copy (offline machines, CI caches).
  const local = process.env[MODEL.env];
  let buf;
  if (local) {
    buf = await readFile(local);
  } else {
    console.log(`[vision] downloading ${MODEL.url}`);
    const res = await fetch(MODEL.url);
    if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const hash = sha256(buf);
  if (hash !== MODEL.sha256) throw new Error(`${MODEL.file} checksum mismatch: ${hash}`);
  await writeFile(modelPath, buf);
  console.log(`[vision] ${MODEL.file} ready (${(buf.length / 1e6).toFixed(1)} MB)`);
}
