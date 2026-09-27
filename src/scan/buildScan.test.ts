import { describe, expect, it } from 'vitest';
import { scanSchema } from '../domain/schema';
import { buildScan, circumference, ellipsePerimeter } from './buildScan';
import { analyzeFront, analyzeSide, sideLevelsFromFront } from './geometry';
import { frontPerson, sidePerson } from './testPeople';

function syntheticScan() {
  const { mask, landmarks } = frontPerson();
  const front = analyzeFront(mask, landmarks, mask.width, mask.height, 'male');
  const sideMask = sidePerson(true);
  const side = analyzeSide(sideMask, null, sideMask.width, sideMask.height, sideLevelsFromFront(front));
  return { front, side };
}

describe('circumference maths', () => {
  it('matches known ellipse perimeters', () => {
    expect(ellipsePerimeter(20, 20)).toBeCloseTo(Math.PI * 20, 6);
    // a = 10, b = 5 → ≈ 48.4422
    expect(ellipsePerimeter(20, 10)).toBeCloseTo(48.4422, 3);
  });

  it('blends ellipse and rectangle', () => {
    expect(circumference({ w: 30, d: 20 }, 1)).toBeCloseTo(ellipsePerimeter(30, 20));
    expect(circumference({ w: 30, d: 20 }, 0)).toBeCloseTo(100);
  });
});

describe('buildScan', () => {
  it('turns synthetic front and side photos into a valid scan', () => {
    const { front, side } = syntheticScan();
    const scan = buildScan({
      id: 's1',
      date: '2026-09-27',
      heightCm: 180,
      sex: 'male',
      front,
      side,
      photosKept: false,
    });
    expect(scanSchema.safeParse(scan).success).toBe(true);
    expect(scan.method).toBe('auto');
    expect(scan.quality).toBeGreaterThan(0.9);
    expect(scan.sections.chest.w).toBeCloseTo(36, 0);
    expect(scan.sections.chest.d).toBeCloseTo(24, 0);
    // 0.72 · ellipse(36, 24) + 0.28 · 2(36 + 24) ≈ 101.4
    expect(Math.abs(scan.circumferences.chest! - 101.4)).toBeLessThan(2);
    expect(Math.abs(scan.circumferences.upperArm! - 27.8)).toBeLessThan(1.5);
    expect(scan.warnings.filter((w) => w.includes('implausible'))).toEqual([]);
    expect(scan.torso.length).toBe(31);
    const chestRow = scan.torso.reduce((best, r) => (Math.abs(r.y - 129.6) < Math.abs(best.y - 129.6) ? r : best));
    expect(chestRow.half).toBeCloseTo(18, 0);
    expect(chestRow.front).toBeGreaterThan(chestRow.back);
    expect(scan.joints.shoulderY).toBeGreaterThan(scan.joints.armpitY);
    expect(scan.joints.armpitY).toBeGreaterThan(scan.joints.hipY);
    expect(scan.joints.hipY).toBeGreaterThan(scan.joints.kneeY);
    expect(scan.bodyFatPct).toBeGreaterThan(3);
  });

  it('marks hand-corrected scans as adjusted', () => {
    const { front, side } = syntheticScan();
    const chest = front.markup.chords.chest!;
    front.markup.chords.chest = [{ ...chest[0], x: chest[0].x - 5 }, chest[1]];
    const scan = buildScan({ id: 's2', date: '2026-09-27', heightCm: 180, sex: 'male', front, side, photosKept: true });
    expect(scan.method).toBe('adjusted');
    expect(scan.sections.chest.w).toBeGreaterThan(36);
  });

  it('produces a valid (low-confidence) scan from fully manual defaults', () => {
    const front = analyzeFront(null, null, 600, 1000, 'female');
    const side = analyzeSide(null, null, 600, 1000, sideLevelsFromFront(front));
    const scan = buildScan({
      id: 's3',
      date: '2026-09-27',
      heightCm: 165,
      sex: 'female',
      front,
      side,
      photosKept: false,
    });
    expect(scanSchema.safeParse(scan).success).toBe(true);
    expect(scan.method).toBe('manual');
    expect(scan.quality).toBeLessThan(0.5);
    expect(scan.circumferences.waist).toBeGreaterThan(50);
  });
});
