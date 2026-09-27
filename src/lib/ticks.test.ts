import { describe, expect, it } from 'vitest';
import { niceTicks } from './ticks';

describe('niceTicks', () => {
  it('covers the full data range with round steps', () => {
    const t = niceTicks(4.6, 7.3);
    expect(t[0]).toBeLessThanOrEqual(4.6);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(7.3);
    expect(t).toEqual([4, 5, 6, 7, 8]);
  });

  it('pads a flat series', () => {
    const t = niceTicks(80, 80);
    expect(t[0]).toBeLessThan(80);
    expect(t[t.length - 1]).toBeGreaterThan(80);
  });
});
