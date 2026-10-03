import { describe, expect, it } from 'vitest';
import { isLevel, portraitTilt } from './level';

describe('phone tilt', () => {
  it('reads an upright portrait phone as level', () => {
    expect(portraitTilt(90, 0)).toEqual({ pitch: 0, roll: 0 });
    expect(isLevel(portraitTilt(91.5, -1))).toBe(true);
  });
  it('detects forward/back and sideways tilt', () => {
    expect(portraitTilt(80, 0)!.pitch).toBe(-10);
    expect(isLevel(portraitTilt(80, 0))).toBe(false);
    expect(isLevel(portraitTilt(90, 5))).toBe(false);
  });
  it('ignores landscape and missing sensors', () => {
    expect(portraitTilt(90, 0, 90)).toBeNull();
    expect(portraitTilt(null, null)).toBeNull();
    expect(isLevel(null)).toBe(false);
  });
});
