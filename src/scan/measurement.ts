import type { Measurement, Scan } from '../domain/schema';
import { uid } from '../lib/id';

/** The measurement entry a scan contributes to body-composition tracking. */
export function measurementFromScan(scan: Scan): Measurement {
  return {
    id: uid(),
    date: scan.date,
    values: scan.circumferences,
    bodyFatPct: scan.bodyFatPct,
    source: 'scan',
    scanId: scan.id,
  };
}
