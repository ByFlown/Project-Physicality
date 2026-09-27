import { describe, expect, it } from 'vitest';
import { buildDemoData } from './demo';
import { simulate } from './engine';
import { appDataSchema } from './schema';

describe('demo data', () => {
  it('is valid and produces a trained physique with some decay', () => {
    const data = buildDemoData('2026-06-01');
    expect(appDataSchema.safeParse(data).success).toBe(true);
    const sim = simulate(data, '2026-06-01')!;
    expect(sim.stats.workouts).toBeGreaterThan(20);
    expect(sim.overall.level).toBeGreaterThanOrEqual(3);
    expect(sim.muscles.calves.status).toBe('decaying');
    expect(sim.events.some((e) => e.kind === 'pr')).toBe(true);
  });
});
