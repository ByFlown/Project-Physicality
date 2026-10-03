import { describe, expect, it } from 'vitest';
import { buildDemoScan } from '../../scan/demoScan';
import { fittedScan } from './realistic';
import type { Scan } from '../../domain/schema';

describe('fittedScan', () => {
  it('only uses fits made in the profile sex’s shape space, latest first', () => {
    const base: Scan = buildDemoScan('2026-01-01');
    const fit = (sex: 'male' | 'female') => ({ model: 'mh-pca-1' as const, sex, coeffs: [0.1], rmsCm: 1 });
    const a = { ...base, id: 'a', date: '2026-01-01', body: fit('male') };
    const b = { ...base, id: 'b', date: '2026-02-01', body: fit('female') };
    const c = { ...base, id: 'c', date: '2026-03-01' };
    expect(fittedScan([a, b, c], 'male')?.id).toBe('a');
    expect(fittedScan([a, b, c], 'female')?.id).toBe('b');
    expect(fittedScan([c], 'male')).toBeNull();
  });
});
