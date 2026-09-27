import { describe, expect, it } from 'vitest';
import {
  analyzeFront,
  analyzeSide,
  chordLength,
  correctProfile,
  defaultMarkup,
  personBounds,
  runAt,
  sideLevelsFromFront,
  WARNINGS,
} from './geometry';
import { cmToPx, frontPerson, PX_PER_CM, sidePerson } from './testPeople';

const cm = (px: number) => px / PX_PER_CM;

describe('mask helpers', () => {
  it('finds the person bounds and runs', () => {
    const { mask } = frontPerson();
    const b = personBounds(mask)!;
    expect(b.top).toBe(50);
    expect(b.bottom).toBe(1049);
    const run = runAt(mask, 330, 400)!;
    expect(cm(run[1] - run[0])).toBeCloseTo(36, 0);
  });
});

describe('front analysis', () => {
  it('measures torso and limb widths from mask + landmarks', () => {
    const { mask, landmarks } = frontPerson();
    const a = analyzeFront(mask, landmarks, mask.width, mask.height, 'male');
    const w = (id: 'chest' | 'waist' | 'hips' | 'upperArm' | 'forearm' | 'thigh' | 'shoulders') =>
      cm(chordLength(a.markup.chords[id]!));
    expect(a.markup.top).toBe(50);
    expect(a.markup.floor).toBe(1050);
    expect(w('chest')).toBeCloseTo(36, 0);
    expect(Math.abs(w('waist') - 30)).toBeLessThan(1);
    expect(Math.abs(w('hips') - 34)).toBeLessThan(0.8);
    expect(Math.abs(w('upperArm') - 9)).toBeLessThan(0.5);
    expect(Math.abs(w('forearm') - 7.5)).toBeLessThan(0.5);
    expect(Math.abs(w('thigh') - 16)).toBeLessThan(0.6);
    expect(w('shoulders')).toBeGreaterThan(45);
    expect(a.warnings).not.toContain(WARNINGS.armsTouching);
    expect(a.warnings).not.toContain(WARNINGS.noPose);
    expect(Math.abs(a.crotchY - 581)).toBeLessThan(3);
    expect(Math.abs(a.armpitY - 300)).toBeLessThan(6);
    expect(a.profile!.length).toBeGreaterThan(30);
  });

  it('warns when the arms touch the torso', () => {
    const { mask, landmarks } = frontPerson({ armsTouching: true });
    const a = analyzeFront(mask, landmarks, mask.width, mask.height, 'male');
    expect(a.warnings).toContain(WARNINGS.armsTouching);
  });

  it('warns about loose clothing', () => {
    const { mask, landmarks } = frontPerson({ clothes: true });
    const a = analyzeFront(mask, landmarks, mask.width, mask.height, 'male');
    expect(a.warnings).toContain(WARNINGS.clothes);
  });

  it('works without landmarks, and falls back to defaults without a mask', () => {
    const { mask } = frontPerson();
    const noPose = analyzeFront(mask, null, mask.width, mask.height, 'male');
    expect(noPose.warnings).toContain(WARNINGS.noPose);
    expect(cm(chordLength(noPose.markup.chords.chest!))).toBeGreaterThan(20);

    const none = analyzeFront(null, null, 600, 1000, 'male');
    expect(none.hasMask).toBe(false);
    expect(none.warnings).toContain(WARNINGS.noPerson);
    expect(Object.keys(none.markup.chords)).toHaveLength(9);
  });
});

describe('side analysis', () => {
  it('measures depths at front-view heights and detects facing', () => {
    const { mask, landmarks } = frontPerson();
    const front = analyzeFront(mask, landmarks, mask.width, mask.height, 'male');
    const levels = sideLevelsFromFront(front);
    const right = sidePerson(true);
    const s = analyzeSide(right, null, right.width, right.height, levels);
    expect(s.markup.facingRight).toBe(true);
    expect(cm(chordLength(s.markup.chords.chest!))).toBeCloseTo(24, 0);
    expect(Math.abs(cm(chordLength(s.markup.chords.hips!)) - 25)).toBeLessThan(1);
    expect(cm(chordLength(s.markup.chords.calf!))).toBeCloseTo(11, 0);

    const left = sidePerson(false);
    expect(analyzeSide(left, null, left.width, left.height, levels).markup.facingRight).toBe(false);
  });
});

describe('profile correction', () => {
  it('rescales the silhouette to match edited chords', () => {
    const detected = defaultMarkup('front', 600, 1000);
    const edited = structuredClone(detected);
    const [a, b] = edited.chords.waist!;
    const c = (a.x + b.x) / 2;
    edited.chords.waist = [
      { x: c - (c - a.x) * 1.1, y: a.y },
      { x: c + (b.x - c) * 1.1, y: b.y },
    ];
    const y = a.y;
    const out = correctProfile([{ y, left: 200, right: 400 }], detected, edited, ['chest', 'waist', 'hips']);
    expect(out[0].right - out[0].left).toBeCloseTo(220, 5);
    expect(cmToPx(1)).toBeCloseTo(PX_PER_CM);
  });
});
