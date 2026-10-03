import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS, type MuscleId } from '../../domain/muscles';
import { buildAvatar, clothingMask } from './avatar';
import { AVERAGE_SHAPE, coeffsFromSemantic, expandHalf, shapeHalf, triangles } from './model';
import { buildMuscleMap } from './muscleMap';
import { bodyDensity, meshVolume, profileSemantic } from './profileShape';
import { loadModelFromDisk } from './testing';

const male = loadModelFromDisk('male');
const female = loadModelFromDisk('female');
const all = (v: number) => Object.fromEntries(MUSCLE_IDS.map((id) => [id, v])) as Record<MuscleId, number>;

describe('realistic avatar', () => {
  const map = buildMuscleMap(male);

  it('maps every muscle onto the mesh', () => {
    const geo = buildAvatar({
      model: male,
      map,
      coeffs: [],
      statureM: 1.8,
      bulges: all(1),
      anchorBulges: all(1),
      detail: 'precise',
    });
    const owners = new Set(Array.from(geo.owner).filter((o) => o >= 0));
    expect(owners.size).toBe(MUSCLE_IDS.length);
  });

  it('is unchanged at anchor levels and grows with levels', () => {
    const base = expandHalf(male, shapeHalf(male, []), 1.8);
    const same = buildAvatar({
      model: male,
      map,
      coeffs: [],
      statureM: 1.8,
      bulges: all(1),
      anchorBulges: all(1),
      detail: 'precise',
      armAbduction: 0,
    });
    const grown = buildAvatar({
      model: male,
      map,
      coeffs: [],
      statureM: 1.8,
      bulges: all(1.6),
      anchorBulges: all(1),
      detail: 'precise',
      armAbduction: 0,
    });
    // The chest's front moves forward with a higher chest level; the head stays put.
    const chestFront = (p: Float32Array) => {
      let z = -Infinity;
      for (let v = 0; v < male.vertexCount; v++) {
        const y = p[v * 3 + 1];
        if (y > 1.28 && y < 1.33 && Math.abs(p[v * 3]) < 0.12) z = Math.max(z, p[v * 3 + 2]);
      }
      return z;
    };
    expect(chestFront(grown.positions)).toBeGreaterThan(chestFront(same.positions) + 0.008);
    let headShift = 0;
    for (let v = 0; v < male.vertexCount; v++) {
      if (base[v * 3 + 1] > 1.65)
        headShift = Math.max(headShift, Math.abs(grown.positions[v * 3 + 2] - same.positions[v * 3 + 2]));
    }
    expect(headShift).toBeLessThan(0.002);
  });

  it('covers the hips (and the chest for women) with clothing, never the hands', () => {
    for (const m of [male, female]) {
      const c = clothingMask(m);
      const covered = Array.from(c).filter((x) => x > 0.5).length;
      expect(covered).toBeGreaterThan(300);
    }
    expect(Array.from(clothingMask(female)).filter((x) => x > 0.5).length).toBeGreaterThan(
      Array.from(clothingMask(male)).filter((x) => x > 0.5).length,
    );
  });
});

describe('profile shape', () => {
  it('gives a plausible mass for the average body', () => {
    const half = shapeHalf(male, coeffsFromSemantic(male, AVERAGE_SHAPE));
    const kg = meshVolume(expandHalf(male, half, 1.78), triangles(male)) * bodyDensity(18);
    expect(kg).toBeGreaterThan(60);
    expect(kg).toBeLessThan(90);
  });

  it('solves the weight slider from body weight', () => {
    const light = profileSemantic(male, { sex: 'male', heightCm: 180, weightKg: 65, bodyFatPct: 12, ageYears: 30 });
    const heavy = profileSemantic(male, { sex: 'male', heightCm: 180, weightKg: 100, bodyFatPct: 28, ageYears: 30 });
    expect(heavy.weight).toBeGreaterThan(light.weight + 0.2);
  });
});
