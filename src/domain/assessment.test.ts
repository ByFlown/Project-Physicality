import { describe, expect, it } from 'vitest';
import { buildScan } from '../scan/buildScan';
import { analyzeFront, analyzeSide, sideLevelsFromFront } from '../scan/geometry';
import { frontPerson, sidePerson } from '../scan/testPeople';
import { computeBaseline, onboardingScan, scanLevels, startBodyFat } from './assessment';
import { levelFromXp } from './leveling';
import type { Profile, Scan } from './schema';

function scan(): Scan {
  const { mask, landmarks } = frontPerson();
  const front = analyzeFront(mask, landmarks, mask.width, mask.height, 'male');
  const s = sidePerson(true);
  const side = analyzeSide(s, null, s.width, s.height, sideLevelsFromFront(front));
  return buildScan({ id: 'a', date: '2026-01-01', heightCm: 180, sex: 'male', front, side, photosKept: false });
}

const profile: Profile = {
  name: 'T',
  sex: 'male',
  birthYear: 1995,
  heightCm: 180,
  startDate: '2026-01-01',
  startWeightKg: 80,
  experience: 'intermediate',
  selfRatings: {},
  startMeasurements: {},
};

function withCirc(base: Scan, circ: Partial<Scan['circumferences']>, shouldersW?: number): Scan {
  return {
    ...base,
    circumferences: { ...base.circumferences, ...circ },
    sections: {
      ...base.sections,
      shoulders: { ...base.sections.shoulders, w: shouldersW ?? base.sections.shoulders.w },
    },
  };
}

describe('scan levels', () => {
  const base = scan();

  it('rises with circumference and clamps to [1, 35]', () => {
    const small = scanLevels(withCirc(base, { upperArm: 27 }), 'male', 180, 15);
    const mid = scanLevels(withCirc(base, { upperArm: 35 }), 'male', 180, 15);
    const huge = scanLevels(withCirc(base, { upperArm: 80 }), 'male', 180, 15);
    expect(small.biceps).toBe(1);
    expect(mid.biceps).toBeCloseTo(12.5, 0);
    expect(huge.biceps).toBe(35);
    expect(mid.triceps).toBe(mid.biceps);
  });

  it('discounts body fat and scales for women and height', () => {
    const lean = scanLevels(withCirc(base, { upperArm: 35 }), 'male', 180, 15).biceps!;
    const fat = scanLevels(withCirc(base, { upperArm: 35 }), 'male', 180, 30).biceps!;
    const female = scanLevels(withCirc(base, { upperArm: 35 }), 'female', 180, 15).biceps!;
    const tall = scanLevels(withCirc(base, { upperArm: 35 }), 'male', 200, 15).biceps!;
    expect(fat).toBeLessThan(lean);
    expect(female).toBeGreaterThan(lean);
    expect(tall).toBeLessThan(lean);
  });

  it('blends only the muscles a circumference covers', () => {
    const s = withCirc(base, { upperArm: 41 });
    const withScan = computeBaseline(profile, s);
    const without = computeBaseline(profile);
    expect(withScan.scanLevels.biceps).toBeGreaterThan(20);
    expect(levelFromXp(withScan.muscleXp.biceps).level).toBeGreaterThan(levelFromXp(without.muscleXp.biceps).level);
    // Abs and lower back have no circumference → unaffected by the scan (body fat source aside).
    expect(withScan.scanLevels.abs).toBeUndefined();
  });

  it('uses scan body fat only when there is no better source', () => {
    const s = { ...base, bodyFatPct: 17 };
    expect(startBodyFat(profile, s)).toEqual({ value: 17, source: 'scan' });
    expect(startBodyFat({ ...profile, startBodyFatPct: 12 }, s).source).toBe('reported');
    expect(startBodyFat({ ...profile, startMeasurements: { neck: 38, waist: 85 } }, s).source).toBe('navy');
  });

  it('anchors on the earliest scan', () => {
    const a = { ...base, id: 'x', date: '2026-03-01' };
    const b = { ...base, id: 'y', date: '2026-01-15' };
    expect(onboardingScan([a, b])!.id).toBe('y');
    expect(onboardingScan([])).toBeNull();
  });
});
