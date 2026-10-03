/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHumanModel, type HumanModel } from './model';

const cache = new Map<string, HumanModel>();

/** Load a baked body model from disk (tests and benchmarks only). */
export function loadModelFromDisk(sex: 'male' | 'female'): HumanModel {
  let m = cache.get(sex);
  if (!m) {
    const bytes = readFileSync(join(process.cwd(), 'src/body3d/human/assets', `human-${sex}.bin`));
    m = parseHumanModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    cache.set(sex, m);
  }
  return m;
}
