import { describe, expect, it } from 'vitest';
import { AVERAGE_SHAPE, coeffsFromSemantic, expandHalf, jointsOf, shapeHalf, triangles, addTargets } from './model';
import { posedJoints, simplePose, skin, solvePose } from './pose';
import { measureSites, vertexParts } from './sites';
import { loadModelFromDisk } from './testing';

const male = loadModelFromDisk('male');
const female = loadModelFromDisk('female');

function body(model = male, local: Record<string, number> = {}, semantic = AVERAGE_SHAPE, stature = 1.8) {
  const half = shapeHalf(model, coeffsFromSemantic(model, semantic, local));
  return { half, positions: expandHalf(model, half, stature), joints: jointsOf(model, half, stature) };
}

describe('baked body model', () => {
  it('decodes both sexes with matching topology', () => {
    for (const m of [male, female]) {
      expect(m.vertexCount).toBe(13380);
      expect(m.components).toBe(48);
      expect(m.quads.length).toBe(13378 * 4);
      expect(m.bones.length).toBe(19);
      expect(Object.keys(m.targets)).toContain('upperarm-muscle-incr');
    }
  });

  it('builds a stature-normalised, symmetric body', () => {
    const { positions, joints } = body(male, {}, AVERAGE_SHAPE, 1);
    let lo = Infinity;
    let hi = -Infinity;
    let sumX = 0;
    for (let i = 0; i < male.vertexCount; i++) {
      lo = Math.min(lo, positions[i * 3 + 1]);
      hi = Math.max(hi, positions[i * 3 + 1]);
      sumX += positions[i * 3];
    }
    expect(lo).toBeCloseTo(0, 2);
    expect(hi).toBeCloseTo(1, 2);
    expect(Math.abs(sumX / male.vertexCount)).toBeLessThan(1e-6);
    // Joints are anatomically ordered.
    expect(joints['head'][1]).toBeGreaterThan(joints['neck'][1]);
    expect(joints['neck'][1]).toBeGreaterThan(joints['upperarm.L'][1]);
    expect(joints['upperarm.L'][1]).toBeGreaterThan(joints['upperleg.L'][1]);
    expect(joints['upperleg.L'][1]).toBeGreaterThan(joints['knee.L'][1]);
    expect(joints['knee.L'][1]).toBeGreaterThan(joints['ankle.L'][1]);
    expect(joints['upperarm.L'][0]).toBeGreaterThan(0.1);
    expect(joints['upperarm.R'][0]).toBeCloseTo(-joints['upperarm.L'][0]);
  });

  it('produces realistic tape measurements for an average man', () => {
    const { positions, joints } = body();
    const sites = measureSites({
      positions,
      tris: triangles(male),
      joints,
      parts: vertexParts(male),
      sex: 'male',
    });
    const cm = Object.fromEntries(Object.entries(sites).map(([k, v]) => [k, Math.round(v.circumference * 1000) / 10]));
    // Broad adult-male ranges (cm) at 180 cm.
    expect(cm.neck).toBeGreaterThan(32);
    expect(cm.neck).toBeLessThan(45);
    expect(cm.chest).toBeGreaterThan(85);
    expect(cm.chest).toBeLessThan(115);
    expect(cm.waist).toBeGreaterThan(70);
    expect(cm.waist).toBeLessThan(100);
    expect(cm.hips).toBeGreaterThan(88);
    expect(cm.hips).toBeLessThan(110);
    expect(cm.upperArm).toBeGreaterThan(24);
    expect(cm.upperArm).toBeLessThan(38);
    expect(cm.thigh).toBeGreaterThan(45);
    expect(cm.thigh).toBeLessThan(65);
    expect(cm.calf).toBeGreaterThan(32);
    expect(cm.calf).toBeLessThan(44);
  });

  it('responds to local sliders and sculpt targets in the right direction', () => {
    const ctx = (b: ReturnType<typeof body>) => ({
      positions: b.positions,
      tris: triangles(male),
      joints: b.joints,
      parts: vertexParts(male),
      sex: 'male' as const,
    });
    const base = measureSites(ctx(body()));
    const wide = measureSites(ctx(body(male, { 'waist-circ': 1 })));
    expect(wide.waist!.circumference).toBeGreaterThan(base.waist!.circumference + 0.02);
    const b = body();
    addTargets(male, b.half, { 'upperarm-muscle': 1 });
    const pumped = measureSites(ctx({ ...b, positions: expandHalf(male, b.half, 1.8) }));
    expect(pumped.upperArm!.circumference).toBeGreaterThan(base.upperArm!.circumference);
  });

  it('a heavier, more muscular shape is bigger; female breast slider affects the chest', () => {
    const measure = (m: typeof male, s: typeof AVERAGE_SHAPE, sex: 'male' | 'female') => {
      const b = body(m, {}, s);
      return measureSites({ positions: b.positions, tris: triangles(m), joints: b.joints, parts: vertexParts(m), sex });
    };
    const avg = measure(male, AVERAGE_SHAPE, 'male');
    const heavy = measure(male, { ...AVERAGE_SHAPE, weight: 0.9 }, 'male');
    expect(heavy.waist!.circumference).toBeGreaterThan(avg.waist!.circumference + 0.05);
    const small = measure(female, { ...AVERAGE_SHAPE, breast: 0.2 }, 'female');
    const large = measure(female, { ...AVERAGE_SHAPE, breast: 0.9 }, 'female');
    expect(large.chest!.circumference).toBeGreaterThan(small.chest!.circumference + 0.02);
  });

  it('poses arms with linear blend skinning', () => {
    const { positions, joints } = body();
    const bones = solvePose(male, joints, simplePose(joints, { armAbduction: 0.2, elbowFlex: 0 }));
    const posed = skin(male, positions, bones);
    const pj = posedJoints(male, joints, bones);
    // Upper arm now 0.2 rad from vertical, forearm straight in line.
    const ua = [pj['elbow.L'][0] - pj['upperarm.L'][0], pj['elbow.L'][1] - pj['upperarm.L'][1]];
    expect(Math.atan2(ua[0], -ua[1])).toBeCloseTo(0.2, 2);
    const fa = [
      pj['wrist.L'][0] - pj['elbow.L'][0],
      pj['wrist.L'][1] - pj['elbow.L'][1],
      pj['wrist.L'][2] - pj['elbow.L'][2],
    ];
    expect(Math.atan2(fa[0], -fa[1])).toBeCloseTo(0.2, 1);
    expect(Math.abs(fa[2])).toBeLessThan(0.01);
    // Feet and head do not move.
    let maxShift = 0;
    for (let i = 0; i < male.vertexCount; i++) {
      if (positions[i * 3 + 1] < 0.5) maxShift = Math.max(maxShift, Math.abs(posed[i * 3] - positions[i * 3]));
    }
    expect(maxShift).toBeLessThan(1e-4);
  });
});
