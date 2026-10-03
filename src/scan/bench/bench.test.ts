/// <reference types="node" />
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadModelFromDisk } from '../../body3d/human/testing';
import { CHORD_PIPELINE, formatResults, modelPipeline, runBenchmark, SCENARIOS } from './bench';

/**
 * Accuracy regression guard. `npm run scan:bench` runs the full benchmark
 * (BENCH=1, more subjects) and writes the table to BENCH_OUT.
 */
const full = !!process.env.BENCH;
const models = [loadModelFromDisk('male'), loadModelFromDisk('female')];

describe('scan accuracy benchmark', () => {
  it(
    'measures the photo pipeline against tape measurements on known bodies',
    () => {
      const results = Object.values(SCENARIOS)
        .filter((s) => !process.env.SCENARIO || s.name.startsWith(process.env.SCENARIO))
        .flatMap((scenario) =>
          runBenchmark({
            models,
            subjectsPerModel: full ? 30 : 3,
            scenario,
            pipelines: [CHORD_PIPELINE, modelPipeline({ male: models[0], female: models[1] })],
          }),
        );
      const table = formatResults(results);
      if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, table);
      for (const r of results) expect(r.overallMae).toBeLessThan(full ? 100 : 100);
    },
    full ? 1_800_000 : 120_000,
  );
});
