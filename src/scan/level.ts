/**
 * Phone tilt from DeviceOrientation, for the capture level guide. A tilted
 * phone makes the body's magnification vary with height (keystone), which
 * the scan benchmark measures at ~0.9 cm of extra circumference error.
 */

export interface Tilt {
  /** Forward/back tilt in degrees; 0 = phone perfectly upright. */
  pitch: number;
  /** Sideways tilt in degrees; 0 = phone not rotated in its own plane. */
  roll: number;
}

/** Degrees within which the phone counts as level. */
export const LEVEL_TOLERANCE = 2;
/** Beyond this tilt, warn that the photo will measure less accurately. */
export const TILT_WARNING = 4;

/**
 * Tilt of a portrait phone from DeviceOrientation angles (degrees). Upright
 * portrait reads beta = 90, gamma = 0. Returns null in landscape, where the
 * axes swap and a body photo should not be taken anyway.
 */
export function portraitTilt(beta: number | null, gamma: number | null, screenAngle = 0): Tilt | null {
  if (beta === null || gamma === null) return null;
  const angle = ((screenAngle % 360) + 360) % 360;
  if (angle === 90 || angle === 270) return null;
  if (angle === 180) return { pitch: -(beta + 90), roll: -gamma };
  return { pitch: beta - 90, roll: gamma };
}

export function isLevel(t: Tilt | null): boolean {
  return !!t && Math.abs(t.pitch) <= LEVEL_TOLERANCE && Math.abs(t.roll) <= LEVEL_TOLERANCE;
}

export const tiltWarning = (pitch: number) =>
  `The phone was tilted ${Math.round(Math.abs(pitch))}° when this photo was taken. Keep it upright for the most accurate measurements.`;

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Ask for motion-sensor access where the browser requires it (iOS). Must run inside a user gesture. */
export function requestOrientationAccess(): void {
  const ctor = (globalThis as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
  ctor?.requestPermission?.().catch(() => undefined);
}
