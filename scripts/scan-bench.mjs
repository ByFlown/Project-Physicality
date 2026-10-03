#!/usr/bin/env node
/**
 * Full scan-accuracy benchmark: synthetic bodies with known tape measurements,
 * photographed under several conditions and run through every scan pipeline.
 * Writes the table to scan-bench.txt (or the path given as the first argument).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'scan-bench.txt');
const r = spawnSync('npx', ['vitest', 'run', 'src/scan/bench'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, BENCH: '1', BENCH_OUT: out },
});
if (r.status === 0) console.log(readFileSync(out, 'utf8'));
process.exit(r.status ?? 1);
