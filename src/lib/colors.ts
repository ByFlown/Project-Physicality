import type { MuscleStatus } from '../domain/engine';
import { TIERS, tierForLevel } from '../domain/leveling';

export const TIER_COLORS: Record<string, string> = {
  Untrained: '#7c8594',
  Novice: '#5b9cf5',
  Trained: '#22c1b0',
  Athletic: '#7cc923',
  Advanced: '#f2a31b',
  Elite: '#f0476a',
  Legend: '#a66bf5',
};

export function tierColor(level: number): string {
  return TIER_COLORS[tierForLevel(level).name];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Continuous colour for a fractional level: each tier's colour is anchored at
 * its minimum level and blended toward the next tier in between, so two
 * muscles in the same tier still read as different.
 */
export function levelColor(fractionalLevel: number): string {
  const anchors = TIERS.map((t) => [t.minLevel, hexToRgb(TIER_COLORS[t.name])] as const);
  let rgb = anchors[anchors.length - 1][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [l0, c0] = anchors[i];
    const [l1, c1] = anchors[i + 1];
    if (fractionalLevel < l1) {
      const t = Math.max(0, (fractionalLevel - l0) / (l1 - l0));
      rgb = [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as unknown as typeof rgb;
      break;
    }
  }
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const TIER_LEGEND = TIERS.map((t) => ({ ...t, color: TIER_COLORS[t.name] }));

export const STATUS_META: Record<MuscleStatus, { label: string; color: string; hint: string }> = {
  growing: { label: 'Growing', color: '#22c55e', hint: 'Enough weekly volume to earn XP steadily' },
  maintaining: { label: 'Maintaining', color: '#38bdf8', hint: 'Enough volume to avoid decay, not much more' },
  idle: { label: 'Idle', color: '#9aa3b2', hint: 'Below maintenance volume — grace period running' },
  decaying: { label: 'Decaying', color: '#f97316', hint: 'Losing XP until trained again' },
};
