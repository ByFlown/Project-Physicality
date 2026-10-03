import type { MuscleId } from '../../domain/muscles';
import type { Scan, Sex } from '../../domain/schema';
import type { ProfileShape } from './profileShape';

/**
 * What the realistic body needs besides levels: its shape (fitted to a scan,
 * or predicted from the profile) and the moment that shape was observed, so
 * muscles and fat are drawn as changes since then.
 */
export interface RealisticBody {
  sex: Sex;
  statureM: number;
  /** Fitted shape coefficients (from a scan). */
  coeffs?: number[];
  /** Otherwise: a profile to predict the shape from. */
  profile?: ProfileShape;
  /** Bulge factors on the anchor date. */
  anchorBulges: Record<MuscleId, number>;
  /** Body fat now minus on the anchor date, percentage points. */
  fatDelta: number;
  /** Scan the shape came from, if any. */
  scanId?: string;
}

/** Skin tones for the realistic body, light to dark (sRGB). */
export const SKIN_TONES = ['#f2d3bd', '#e3b897', '#c99674', '#a8714f', '#7d4f36', '#583626'] as const;
export const DEFAULT_SKIN_TONE = 2;
export const CLOTH_COLOR = '#2b303b';

/** The scan whose fitted body drives the realistic model: the latest one that has a fit. */
export function fittedScan(scans: Scan[]): Scan | null {
  return scans
    .filter((s) => s.body?.model === 'mh-pca-1')
    .reduce<Scan | null>((a, b) => (!a || b.date >= a.date ? b : a), null);
}
