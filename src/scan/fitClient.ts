import { loadHumanModel, MODEL_URLS } from '../body3d/human/load';
import type { Scan } from '../domain/schema';
import type { BuildScanInput } from './buildScan';
import type { FitRequest, FitResponse } from './fitWorker';
import { refineScanWithModel } from './refine';

/**
 * Fit the 3D body to a scan off the main thread (~1 s of maths). Falls back
 * to the main thread where workers are unavailable. Rejects on failure; the
 * caller keeps the chord-based scan.
 */
export async function refineScan(scan: Scan, input: BuildScanInput): Promise<Scan> {
  if (typeof Worker === 'undefined') return refineScanWithModel(scan, input, await loadHumanModel(input.sex));
  const worker = new Worker(new URL('./fitWorker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<Scan>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fitting the 3D body took too long.')), 60_000);
      worker.onmessage = (e: MessageEvent<FitResponse>) => {
        clearTimeout(timer);
        if (e.data.ok) resolve(e.data.scan);
        else reject(new Error(e.data.error));
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(e.message || 'The fitting worker failed.'));
      };
      const modelUrl = new URL(MODEL_URLS[input.sex], location.href).href;
      worker.postMessage({ scan, input, modelUrl } satisfies FitRequest);
    });
  } finally {
    worker.terminate();
  }
}
