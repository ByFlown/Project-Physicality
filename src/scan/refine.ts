import type { HumanModel } from '../body3d/human/model';
import { navyBodyFat } from '../domain/bodycomp';
import { scanSchema, type BodyFit, type Scan } from '../domain/schema';
import type { BuildScanInput } from './buildScan';
import { fitBody, modelCircumferences, scanObservations, storedScanObservations } from './fit';

/** Above this silhouette mismatch the fitted body is kept for display, but chord circumferences are used. */
export const MAX_FIT_RMS_CM = 3.5;

export const FIT_WARNING =
  'The 3D body could not match your photos closely, so circumferences come from the measurement lines instead.';

/**
 * Fit the body model to a chord-based scan and, when the fit is good, take
 * its circumferences (and the Navy body fat) from the fitted body.
 */
export function refineScanWithModel(scan: Scan, input: BuildScanInput, model: HumanModel): Scan {
  const statureM = input.heightCm / 100;
  const fit = fitBody(model, scanObservations(input, scan), { statureM, armAbduction: scan.joints.armAngle });
  const body = {
    model: 'mh-pca-1' as const,
    sex: model.sex,
    coeffs: fit.coeffs.map((c) => Math.round(c * 1e5) / 1e5),
    rmsCm: Math.round(fit.rmsCm * 100) / 100,
  };
  if (!(fit.rmsCm <= MAX_FIT_RMS_CM)) {
    return scanSchema.parse({ ...scan, body, warnings: [...scan.warnings, FIT_WARNING].slice(0, 12) });
  }
  const circumferences = { ...scan.circumferences, ...modelCircumferences(model, body.coeffs, statureM, input.sex) };
  const bf = navyBodyFat(input.sex, input.heightCm, circumferences);
  return scanSchema.parse({
    ...scan,
    body,
    circumferences,
    bodyFatPct: bf !== undefined && bf >= 3 && bf <= 60 ? bf : undefined,
  });
}

/** Fit a body to a stored scan's numbers (no photos). Used for display only; measurements are left alone. */
export function fitStoredScanWithModel(scan: Scan, model: HumanModel): BodyFit {
  const fit = fitBody(model, storedScanObservations(scan), {
    statureM: scan.heightCm / 100,
    armAbduction: scan.joints.armAngle,
  });
  return {
    model: 'mh-pca-1',
    sex: model.sex,
    coeffs: fit.coeffs.map((c) => Math.round(c * 1e5) / 1e5),
    rmsCm: Math.round(fit.rmsCm * 100) / 100,
  };
}
