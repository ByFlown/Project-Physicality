import { clothingMask, clothingPattern, vertexAdjacency, type Adjacency, type ClothingPattern } from './avatar';
import { loadHumanModel } from './load';
import type { HumanModel } from './model';
import { buildMuscleMap, type MuscleMap } from './muscleMap';

/** A body model with its per-mesh precomputations (muscle map, clothing). */
export interface LoadedHuman {
  model: HumanModel;
  map: MuscleMap;
  clothing: Float32Array;
  pattern: ClothingPattern;
  adjacency: Adjacency;
}

const cache = new Map<string, Promise<LoadedHuman>>();

export function loadHuman(sex: 'male' | 'female'): Promise<LoadedHuman> {
  let p = cache.get(sex);
  if (!p) {
    p = loadHumanModel(sex).then((model) => {
      const pattern = clothingPattern(model);
      return {
        model,
        map: buildMuscleMap(model),
        pattern,
        clothing: clothingMask(model, pattern),
        adjacency: vertexAdjacency(model),
      };
    });
    p.catch(() => cache.delete(sex));
    cache.set(sex, p);
  }
  return p;
}
