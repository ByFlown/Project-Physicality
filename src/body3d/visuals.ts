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

/** Per-muscle bulge factors on a given date (used to anchor the model to a scan). */
export function bulgesOnDate(sim: Simulation, date: string): Record<MuscleId, number> {
  const exact = sim.timeline.dates.indexOf(date);
  const found = exact >= 0 ? exact : date < sim.startDate ? 0 : sim.timeline.dates.length - 1;
  const out = {} as Record<MuscleId, number>;
  for (const id of MUSCLE_IDS) out[id] = muscleBulge(fractionalLevel(sim.timeline.muscleXp[id][found]));
  return out;
}
