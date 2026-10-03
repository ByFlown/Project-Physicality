/// <reference lib="webworker" />
import { parseHumanModel } from '../body3d/human/model';
import type { Scan } from '../domain/schema';
import type { BuildScanInput } from './buildScan';
import { refineScanWithModel } from './refine';

export interface FitRequest {
  scan: Scan;
  input: BuildScanInput;
  modelUrl: string;
}
export type FitResponse = { ok: true; scan: Scan } | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<FitRequest>) => {
  try {
    const res = await fetch(e.data.modelUrl);
    if (!res.ok) throw new Error(`Could not load the body model (${res.status})`);
    const model = parseHumanModel(await res.arrayBuffer());
    const scan = refineScanWithModel(e.data.scan, e.data.input, model);
    (self as unknown as Worker).postMessage({ ok: true, scan } satisfies FitResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies FitResponse);
  }
};
