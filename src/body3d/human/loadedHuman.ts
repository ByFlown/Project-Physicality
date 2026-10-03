import { clothingMask, vertexAdjacency, type Adjacency } from './avatar';
import { loadHumanModel } from './load';
import type { HumanModel } from './model';
import { buildMuscleMap, type MuscleMap } from './muscleMap';

/** A body model with its per-mesh precomputations (muscle map, clothing). */
export interface LoadedHuman {
  model: HumanModel;
  map: MuscleMap;
  clothing: Float32Array;
  adjacency: Adjacency;
}

const cache = new Map<string, Promise<LoadedHuman>>();

export function loadHuman(sex: 'male' | 'female'): Promise<LoadedHuman> {
  let p = cache.get(sex);
  if (!p) {
    p = loadHumanModel(sex).then((model) => ({
      model,
      map: buildMuscleMap(model),
      clothing: clothingMask(model),
      adjacency: vertexAdjacency(model),
    }));
    p.catch(() => cache.delete(sex));
    cache.set(sex, p);
  }
  return p;
}
