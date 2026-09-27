import { JOINTS, torsoRings } from '../body3d/anatomy';
import { shapeFactors } from '../body3d/shape';
import type { LocalDate } from '../domain/dates';
import { scanSchema, type Scan } from '../domain/schema';
import { circumference, SECTION_SHAPE } from './buildScan';

/**
 * A synthetic scan for demo mode, derived from the reference 1.8 m body so the
 * precise model path is exercised without real photos.
 */
export function buildDemoScan(date: LocalDate): Scan {
  const f = shapeFactors({ sex: 'male', heightCm: 180, weightKg: 78, bodyFatPct: 15 });
  const rings = torsoRings({ ...f, girth: 1, waistFat: 1, shoulderWidth: 1, hipWidth: 1 });
  const at = (y: number) => {
    const i = rings.findIndex((r) => r.y >= y);
    const a = rings[Math.max(0, i - 1)];
    const b = rings[i];
    const t = (y - a.y) / (b.y - a.y || 1);
    const lerp = (p: number, q: number) => p + (q - p) * t;
    return { w: lerp(a.w, b.w), d: lerp(a.d, b.d), z: lerp(a.z ?? 0, b.z ?? 0) };
  };
  const torso: Scan['torso'] = [];
  for (let i = 0; i <= 30; i++) {
    const y = 0.84 + ((1.37 - 0.84) * i) / 30;
    const r = at(y);
    torso.push({
      y: Math.round(y * 1000) / 10,
      half: Math.round(r.w * 1000) / 10,
      front: Math.round((r.z + r.d) * 1000) / 10,
      back: Math.round((r.d - r.z) * 1000) / 10,
    });
  }
  const sections: Scan['sections'] = {
    neck: { w: 12, d: 12.2 },
    shoulders: { w: 46, d: 23.5 },
    chest: { w: 34.4, d: 22.4 },
    waist: { w: 28, d: 19.5 },
    hips: { w: 33, d: 21 },
    upperArm: { w: 9.4, d: 9.1 },
    forearm: { w: 7.8, d: 6.6 },
    thigh: { w: 15.8, d: 16.6 },
    calf: { w: 10.4, d: 11.2 },
  };
  const circumferences = Object.fromEntries(
    (Object.keys(sections) as (keyof Scan['sections'])[]).map((k) => [
      k,
      Math.round(circumference(sections[k], SECTION_SHAPE[k]) * 10) / 10,
    ]),
  );
  return scanSchema.parse({
    id: 'demo-scan',
    date,
    heightCm: 180,
    method: 'manual',
    quality: 1,
    warnings: ['Demo scan — synthetic body, not a real photo.'],
    joints: {
      shoulderY: JOINTS.shoulder[1] * 100,
      shoulderHalf: JOINTS.shoulder[0] * 100,
      armpitY: 137,
      hipY: JOINTS.hip[1] * 100,
      hipHalf: JOINTS.hip[0] * 100,
      crotchY: 82,
      kneeY: (JOINTS.hip[1] - JOINTS.thighLength) * 100,
      ankleY: (JOINTS.hip[1] - JOINTS.thighLength - JOINTS.shinLength) * 100,
      neckY: 155,
      upperArmLength: JOINTS.upperArmLength * 100,
      forearmLength: JOINTS.forearmLength * 100,
      armAngle: JOINTS.armAngle,
    },
    torso,
    sections,
    circumferences,
    bodyFatPct: 15,
    photosKept: false,
  });
}
