/**
 * Level curve.
 *
 * Levels 1 → PLATEAU_LEVEL cost exponentially more XP each (BASE · RATIO^(L-1)).
 * From PLATEAU_LEVEL on, every level costs the same flat amount — the cost of
 * the level just before the plateau, multiplied once more by RATIO.
 *
 *   L1→2: 100   L2→3: 150   L3→4: 225   L4→5: 338   L5+→next: 506 (flat)
 */
export const LEVEL_BASE_XP = 100;
export const LEVEL_RATIO = 1.5;
export const PLATEAU_LEVEL = 5;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  const l = Math.max(1, Math.floor(level));
  const exponent = Math.min(l, PLATEAU_LEVEL) - 1;
  return Math.round(LEVEL_BASE_XP * LEVEL_RATIO ** exponent);
}

/** Pre-computed cumulative XP required to reach each level up to the plateau. */
const CUMULATIVE: number[] = (() => {
  const arr = [0, 0]; // index = level; level 1 requires 0 XP
  for (let l = 1; l < PLATEAU_LEVEL; l++) arr.push(arr[l] + xpToNext(l));
  return arr;
})();

const PLATEAU_COST = xpToNext(PLATEAU_LEVEL);

/** Total XP required to *reach* `level` from zero. */
export function totalXpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  if (l <= PLATEAU_LEVEL) return CUMULATIVE[l];
  return CUMULATIVE[PLATEAU_LEVEL] + (l - PLATEAU_LEVEL) * PLATEAU_COST;
}

export interface LevelInfo {
  level: number;
  /** XP accumulated inside the current level. */
  xpIntoLevel: number;
  /** XP the current level costs in total. */
  levelCost: number;
  /** 0..1 progress towards the next level. */
  progress: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, totalXp);
  let level: number;
  if (xp >= CUMULATIVE[PLATEAU_LEVEL]) {
    level = PLATEAU_LEVEL + Math.floor((xp - CUMULATIVE[PLATEAU_LEVEL]) / PLATEAU_COST);
  } else {
    level = 1;
    while (level < PLATEAU_LEVEL && xp >= CUMULATIVE[level + 1]) level++;
  }
  const levelCost = xpToNext(level);
  const xpIntoLevel = xp - totalXpForLevel(level);
  return { level, xpIntoLevel, levelCost, progress: Math.min(1, xpIntoLevel / levelCost), totalXp: xp };
}

/** Continuous level (e.g. 7.42) — useful for smooth visuals and averages. */
export function fractionalLevel(totalXp: number): number {
  const info = levelFromXp(totalXp);
  return info.level + info.progress;
}

export interface Tier {
  name: string;
  minLevel: number;
}

export const TIERS: Tier[] = [
  { name: 'Untrained', minLevel: 1 },
  { name: 'Novice', minLevel: 3 },
  { name: 'Trained', minLevel: 5 },
  { name: 'Athletic', minLevel: 10 },
  { name: 'Advanced', minLevel: 16 },
  { name: 'Elite', minLevel: 24 },
  { name: 'Legend', minLevel: 35 },
];

export function tierForLevel(level: number): Tier {
  let tier = TIERS[0];
  for (const t of TIERS) if (level >= t.minLevel) tier = t;
  return tier;
}
