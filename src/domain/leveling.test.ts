import { describe, expect, it } from 'vitest';
import { fractionalLevel, levelFromXp, PLATEAU_LEVEL, tierForLevel, totalXpForLevel, xpToNext } from './leveling';

describe('level curve', () => {
  it('grows exponentially below the plateau', () => {
    expect([1, 2, 3, 4].map(xpToNext)).toEqual([100, 150, 225, 338]);
    for (let l = 2; l < PLATEAU_LEVEL; l++) {
      expect(xpToNext(l) / xpToNext(l - 1)).toBeCloseTo(1.5, 1);
    }
  });

  it('costs the same XP for every level from the plateau on', () => {
    const plateau = xpToNext(PLATEAU_LEVEL);
    expect(plateau).toBe(506);
    for (const l of [5, 6, 10, 25, 99]) expect(xpToNext(l)).toBe(plateau);
  });

  it('round-trips between total XP and level', () => {
    for (let l = 1; l <= 40; l++) {
      const xp = totalXpForLevel(l);
      expect(levelFromXp(xp).level).toBe(l);
      expect(levelFromXp(xp - 0.001).level).toBe(Math.max(1, l - 1));
      expect(levelFromXp(xp).xpIntoLevel).toBeCloseTo(0);
    }
  });

  it('reports progress inside a level', () => {
    const info = levelFromXp(totalXpForLevel(7) + 253);
    expect(info.level).toBe(7);
    expect(info.progress).toBeCloseTo(0.5, 2);
    expect(fractionalLevel(info.totalXp)).toBeCloseTo(7.5, 2);
  });

  it('never drops below level 1', () => {
    expect(levelFromXp(-50).level).toBe(1);
    expect(levelFromXp(0).progress).toBe(0);
  });

  it('maps levels to tiers', () => {
    expect(tierForLevel(1).name).toBe('Untrained');
    expect(tierForLevel(5).name).toBe('Trained');
    expect(tierForLevel(100).name).toBe('Legend');
  });
});
