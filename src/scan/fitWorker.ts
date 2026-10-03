/// <reference lib="webworker" />
import { parseHumanModel } from '../body3d/human/model';
import type { BodyFit, Scan } from '../domain/schema';
import type { BuildScanInput } from './buildScan';
import { fitStoredScanWithModel, refineScanWithModel } from './refine';

export type FitRequest =
  /** A new scan with its photo analyses: fit and measure. */
  | { kind: 'refine'; scan: Scan; input: BuildScanInput; modelUrl: string }
  /** A stored scan without a fitted body: fit from its numbers only. */
  | { kind: 'stored'; scan: Scan; modelUrl: string };
export type FitResponse = { ok: true; scan: Scan } | { ok: true; body: BodyFit } | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<FitRequest>) => {
  const post = (r: FitResponse) => (self as unknown as Worker).postMessage(r);
  try {
    const res = await fetch(e.data.modelUrl);
    if (!res.ok) throw new Error(`Could not load the body model (${res.status})`);
    const model = parseHumanModel(await res.arrayBuffer());
    if (e.data.kind === 'refine') post({ ok: true, scan: refineScanWithModel(e.data.scan, e.data.input, model) });
    else post({ ok: true, body: fitStoredScanWithModel(e.data.scan, model) });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
