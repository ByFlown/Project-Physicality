import type { MuscleVisual } from './BodyScene';
import { muscleBulge } from './shape';
import type { Simulation } from '../domain/engine';
import { fractionalLevel } from '../domain/leveling';
import { MUSCLE_IDS, type MuscleId } from '../domain/muscles';
import { levelColor, STATUS_META } from '../lib/colors';

export type ColorMode = 'level' | 'status';

let webglSupport: boolean | undefined;
export function hasWebGL(): boolean {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    webglSupport = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

export function muscleVisuals(sim: Simulation, mode: ColorMode): Record<MuscleId, MuscleVisual & { label: string }> {
  const out = {} as Record<MuscleId, MuscleVisual & { label: string }>;
  for (const id of MUSCLE_IDS) {
    const m = sim.muscles[id];
    const status = STATUS_META[m.status];
    out[id] = {
      color: mode === 'level' ? levelColor(fractionalLevel(m.xp)) : status.color,
      bulge: muscleBulge(fractionalLevel(m.xp)),
      label: `Level ${m.info.level} · ${m.tier.name} · ${status.label}`,
    };
  }
  return out;
}
