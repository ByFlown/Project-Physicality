import { loadHumanModel, MODEL_URLS } from '../body3d/human/load';
import type { BodyFit, Scan, Sex } from '../domain/schema';
import type { BuildScanInput } from './buildScan';
import type { FitRequest, FitResponse } from './fitWorker';
import { fitStoredScanWithModel, refineScanWithModel } from './refine';

/** Run one fitting job in a worker (~1 s of maths); rejects on failure. */
function runInWorker(request: FitRequest): Promise<FitResponse & { ok: true }> {
  const worker = new Worker(new URL('./fitWorker.ts', import.meta.url), { type: 'module' });
  return new Promise<FitResponse & { ok: true }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fitting the 3D body took too long.')), 60_000);
    worker.onmessage = (e: MessageEvent<FitResponse>) => {
      clearTimeout(timer);
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message || 'The fitting worker failed.'));
    };
    worker.postMessage(request);
  }).finally(() => worker.terminate());
}

const modelUrl = (sex: Sex) => new URL(MODEL_URLS[sex], location.href).href;

/**
 * Fit the 3D body to a new scan off the main thread. Falls back to the main
 * thread where workers are unavailable. The caller keeps the chord-based scan on failure.
 */
export async function refineScan(scan: Scan, input: BuildScanInput): Promise<Scan> {
  if (typeof Worker === 'undefined') return refineScanWithModel(scan, input, await loadHumanModel(input.sex));
  const r = await runInWorker({ kind: 'refine', scan, input, modelUrl: modelUrl(input.sex) });
  if (!('scan' in r)) throw new Error('Unexpected fitting result');
  return r.scan;
}

const storedFits = new Map<string, Promise<BodyFit>>();

/** Fit (once per session) a body to a stored scan that has none — older scans and the demo. */
export function fitStoredScan(scan: Scan, sex: Sex): Promise<BodyFit> {
  const key = `${scan.id}:${sex}:${scan.date}`;
  let p = storedFits.get(key);
  if (!p) {
    p =
      typeof Worker === 'undefined'
        ? loadHumanModel(sex).then((m) => fitStoredScanWithModel(scan, m))
        : runInWorker({ kind: 'stored', scan, modelUrl: modelUrl(sex) }).then((r) => {
            if (!('body' in r)) throw new Error('Unexpected fitting result');
            return r.body;
          });
    p.catch(() => storedFits.delete(key));
    storedFits.set(key, p);
  }
  return p;
}
