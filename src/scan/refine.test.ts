import { describe, expect, it } from 'vitest';
import { loadModelFromDisk } from '../body3d/human/testing';
import { vertexParts } from '../body3d/human/sites';
import { MEASURE_SITES, scanSchema } from '../domain/schema';
import { mulberry32, randomSubject, SCENARIOS } from './bench/bench';
import { photograph } from './bench/synth';
import { buildScan } from './buildScan';
import { analyzeFront, analyzeSide, sideLevelsFromFront } from './geometry';
import { refineScanWithModel } from './refine';

describe('model-refined scan', () => {
  it('stores the fitted body and measures closer to the truth than the chords', () => {
    const model = loadModelFromDisk('female');
    const rand = mulberry32(42);
    let chordErr = 0;
    let modelErr = 0;
    for (let i = 0; i < 2; i++) {
      const s = randomSubject(model, rand);
      const cams = SCENARIOS.ideal.camera(rand, s.statureM);
      const ph = photograph(model, s.rest, s.joints, vertexParts(model), cams);
      const front = analyzeFront(ph.front.mask, ph.front.landmarks, 960, 1280, 'female');
      const side = analyzeSide(ph.side.mask, ph.side.landmarks, 960, 1280, sideLevelsFromFront(front));
      const input = {
        id: 'x',
        date: '2026-01-01',
        heightCm: s.statureM * 100,
        sex: 'female' as const,
        front,
        side,
        photosKept: false,
      };
      const chords = buildScan(input);
      const refined = refineScanWithModel(chords, input, model);
      expect(scanSchema.safeParse(refined).success).toBe(true);
      expect(refined.body?.coeffs).toHaveLength(48);
      expect(refined.body!.rmsCm).toBeLessThan(2.5);
      for (const site of MEASURE_SITES) {
        chordErr += Math.abs(chords.circumferences[site]! - s.truth[site]!);
        modelErr += Math.abs(refined.circumferences[site]! - s.truth[site]!);
      }
    }
    expect(modelErr).toBeLessThan(chordErr * 0.75);
  }, 60_000);
});
