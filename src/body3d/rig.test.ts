import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS, type MuscleId } from '../domain/muscles';
import { buildScan } from '../scan/buildScan';
import { analyzeFront, analyzeSide, sideLevelsFromFront } from '../scan/geometry';
import { frontPerson, sidePerson } from '../scan/testPeople';
import { JOINTS, partsForSegment, torsoRings } from './anatomy';
import type { MuscleLook } from './deform';
import { calibrateRig, deformedExtents, piecewise, placeParts, referenceRig, scannedRig, SEGMENTS } from './rig';
import { shapeFactors } from './shape';

const neutral = shapeFactors({ sex: 'male', heightCm: 180, weightKg: 80, bodyFatPct: 15 });

function looks(bulgeScale: number): Record<MuscleId, MuscleLook> {
  return Object.fromEntries(
    MUSCLE_IDS.map((id) => [id, { color: [0.5, 0.5, 0.5], bulgeScale, highlight: 0 }]),
  ) as Record<MuscleId, MuscleLook>;
}

function syntheticScan() {
  const { mask, landmarks } = frontPerson();
  const front = analyzeFront(mask, landmarks, mask.width, mask.height, 'male');
  const sideMask = sidePerson(true);
  const side = analyzeSide(sideMask, null, sideMask.width, sideMask.height, sideLevelsFromFront(front));
  return buildScan({ id: 'scan-1', date: '2026-09-27', heightCm: 180, sex: 'male', front, side, photosKept: false });
}

describe('reference rig', () => {
  it('reproduces the procedural body at 1.8 m', () => {
    const rig = referenceRig(neutral);
    expect(rig.scale).toBeCloseTo(1);
    expect(rig.shoulder[1]).toBeCloseTo(JOINTS.shoulder[1]);
    expect(rig.rings.torso.map((r) => r.y)).toEqual(torsoRings(neutral).map((r) => r.y));
    expect(placeParts('torso', rig, 'standard')).toHaveLength(partsForSegment('torso').length);
  });

  it('adds precise-only muscle heads', () => {
    const rig = referenceRig(neutral);
    for (const seg of SEGMENTS) {
      expect(placeParts(seg, rig, 'precise').length).toBeGreaterThanOrEqual(placeParts(seg, rig, 'standard').length);
    }
    expect(placeParts('torso', rig, 'precise').length).toBeGreaterThan(placeParts('torso', rig, 'standard').length);
  });
});

describe('piecewise mapping', () => {
  it('interpolates, extrapolates and never folds', () => {
    const f = piecewise(
      [
        [0, 0],
        [1, 2],
        [2, 1], // would fold — gets forced upward
      ],
      1,
    );
    expect(f(0.5)).toBeCloseTo(1);
    expect(f(-1)).toBeCloseTo(-1);
    expect(f(2)).toBeGreaterThan(f(1));
  });
});

describe('scanned rig', () => {
  const scan = syntheticScan();

  it('follows the scan joints and keeps torso rings ordered', () => {
    const rig = scannedRig(scan, neutral);
    expect(rig.shoulder[1]).toBeCloseTo(scan.joints.shoulderY / 100, 3);
    expect(rig.hip[0]).toBeCloseTo(scan.joints.hipHalf / 100, 3);
    const ys = rig.rings.torso.map((r) => r.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    for (let y = 0.7; y < 1.7; y += 0.05) expect(rig.torsoY(y + 0.01)).toBeGreaterThan(rig.torsoY(y));
    const chestRing = rig.rings.torso.reduce((b, r) => (Math.abs(r.y - 1.296) < Math.abs(b.y - 1.296) ? r : b));
    expect(chestRing.w).toBeCloseTo(0.18, 2);
  });

  it('calibration makes muscles + base reproduce the photographed silhouette at scan time', () => {
    const raw = scannedRig(scan, neutral);
    const atScan = looks(1.1);
    const rig = calibrateRig(raw, atScan, 1, 'precise');
    for (const seg of SEGMENTS) {
      raw.rings[seg].forEach((target, i) => {
        if (!target.measured) return;
        const e = deformedExtents(rig.rings[seg][i], seg, rig, atScan, 1, 'precise');
        expect(Math.abs(e.half - target.w)).toBeLessThan(0.002);
        expect(Math.abs(e.front - ((target.z ?? 0) + target.d))).toBeLessThan(0.002);
        expect(Math.abs(e.back - ((target.z ?? 0) - target.d))).toBeLessThan(0.002);
      });
    }
    // Stronger muscles later make the body bigger than the scan; weaker ones smaller.
    const chestIdx = raw.rings.torso.findIndex((r) => r.measured && Math.abs(r.y - 1.3) < 0.02);
    const bigger = deformedExtents(rig.rings.torso[chestIdx], 'torso', rig, looks(1.6), 1, 'precise');
    const smaller = deformedExtents(rig.rings.torso[chestIdx], 'torso', rig, looks(0.5), 1, 'precise');
    expect(bigger.front).toBeGreaterThan(raw.rings.torso[chestIdx].d + (raw.rings.torso[chestIdx].z ?? 0));
    expect(smaller.front).toBeLessThan(raw.rings.torso[chestIdx].d + (raw.rings.torso[chestIdx].z ?? 0));
  });
});
