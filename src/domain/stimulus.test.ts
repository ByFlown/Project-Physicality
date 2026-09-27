import { describe, expect, it } from 'vitest';
import { EXERCISES } from './exercises';
import {
  effectiveSetsByMuscle,
  estimated1RM,
  sessionValue,
  setStimulus,
  weeklyScale,
  WEEKLY_MAX_PRODUCTIVE_SETS,
} from './stimulus';

const bench = EXERCISES.find((e) => e.id === 'bench-press')!;
const set = (reps: number, rir?: number, warmup = false) => ({ id: 's', reps, weightKg: 60, rir, warmup });

describe('set stimulus', () => {
  it('counts a hard set in the hypertrophy range as one effective set', () => {
    expect(setStimulus(set(10, 1))).toBe(1);
  });

  it('discounts warm-ups, easy sets and extreme rep ranges', () => {
    expect(setStimulus(set(10, 1, true))).toBe(0);
    expect(setStimulus(set(10, 5))).toBeLessThan(setStimulus(set(10, 2)));
    expect(setStimulus(set(1, 0))).toBeLessThan(setStimulus(set(6, 0)));
    expect(setStimulus(set(50, 0))).toBeLessThan(setStimulus(set(20, 0)));
    expect(setStimulus(set(0, 0))).toBe(0);
  });

  it('distributes stimulus by muscle contribution', () => {
    const out = effectiveSetsByMuscle([{ exercise: bench, sets: [set(8, 1), set(8, 1), set(8, 1)] }]);
    expect(out.chest).toBe(3);
    expect(out.triceps).toBe(1.5);
    expect(out.frontDelts).toBe(1.5);
    expect(out.quads).toBeUndefined();
  });
});

describe('volume diminishing returns', () => {
  it('is linear up to six sets and then saturates', () => {
    expect(sessionValue(4)).toBe(4);
    expect(sessionValue(6)).toBe(6);
    expect(sessionValue(8)).toBeLessThan(8);
    expect(sessionValue(8)).toBeGreaterThan(6);
    expect(sessionValue(40)).toBeLessThan(10.01);
  });

  it('penalises volume past the weekly ceiling', () => {
    expect(weeklyScale(0, 5)).toBe(1);
    expect(weeklyScale(WEEKLY_MAX_PRODUCTIVE_SETS, 5)).toBeCloseTo(0.3);
    expect(weeklyScale(WEEKLY_MAX_PRODUCTIVE_SETS - 2, 4)).toBeCloseTo((2 + 2 * 0.3) / 4);
  });
});

describe('estimated 1RM', () => {
  it('uses the Epley formula', () => {
    expect(estimated1RM(100, 1)).toBe(100);
    expect(estimated1RM(100, 10)).toBeCloseTo(133.33, 1);
    expect(estimated1RM(100, 20)).toBe(0);
  });
});
