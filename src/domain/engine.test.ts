import { describe, expect, it } from 'vitest';
import { computeBaseline } from './assessment';
import { navyBodyFat, ffmi } from './bodycomp';
import { addDays } from './dates';
import { daysUntilLevelLoss, ENGINE, simulate } from './engine';
import { levelFromXp } from './leveling';
import { emptyAppData, type AppData, type Profile, type Workout } from './schema';

const START = '2026-01-01';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'Test',
    sex: 'male',
    birthYear: 1995,
    heightCm: 180,
    startDate: START,
    startWeightKg: 80,
    startBodyFatPct: 18,
    experience: 'none',
    selfRatings: {},
    startMeasurements: {},
    ...overrides,
  };
}

let seq = 0;
function workout(date: string, exerciseId: string, sets: number, reps = 10, weightKg = 60, rir = 1): Workout {
  seq++;
  return {
    id: `w${seq}`,
    date,
    exercises: [
      {
        id: `e${seq}`,
        exerciseId,
        sets: Array.from({ length: sets }, (_, i) => ({ id: `s${seq}-${i}`, reps, weightKg, rir })),
      },
    ],
  };
}

function data(p: Profile, workouts: Workout[] = []): AppData {
  return { ...emptyAppData(), profile: p, workouts };
}

describe('baseline assessment', () => {
  it('starts a novice with no training at level 1-ish', () => {
    const b = computeBaseline(profile({ experience: 'none', startBodyFatPct: 22 }));
    expect(b.level).toBeLessThan(3);
  });

  it('places experienced lifters with a high FFMI higher', () => {
    const novice = computeBaseline(profile({ experience: 'none' }));
    const advanced = computeBaseline(profile({ experience: 'advanced', startWeightKg: 92, startBodyFatPct: 12 }));
    expect(advanced.level).toBeGreaterThan(novice.level + 5);
  });

  it('applies self-ratings per muscle', () => {
    const b = computeBaseline(profile({ experience: 'intermediate', selfRatings: { calves: -1, chest: 1 } }));
    expect(b.muscleXp.calves).toBeLessThan(b.muscleXp.quads);
    expect(b.muscleXp.chest).toBeGreaterThan(b.muscleXp.quads);
  });

  it('estimates body fat from navy tape measurements when not reported', () => {
    const b = computeBaseline(
      profile({ startBodyFatPct: undefined, startMeasurements: { neck: 38, waist: 85 } }),
    );
    expect(b.bodyFat.source).toBe('navy');
    expect(b.bodyFat.value).toBeCloseTo(navyBodyFat('male', 180, { neck: 38, waist: 85 })!, 5);
  });

  it('computes a plausible FFMI', () => {
    expect(ffmi(80, 180, 15)).toBeCloseTo(20.99, 1);
  });
});

describe('simulation', () => {
  it('returns null without a profile', () => {
    expect(simulate(emptyAppData(), START)).toBeNull();
  });

  it('awards XP to trained muscles only, weighted by contribution', () => {
    const sim = simulate(data(profile(), [workout(START, 'bench-press', 4)]), START)!;
    const base = sim.baseline.muscleXp;
    const gain = (id: keyof typeof base) => sim.muscles[id].xp - base[id];
    expect(gain('chest')).toBeCloseTo(4 * ENGINE.xpPerSet, 5);
    expect(gain('triceps')).toBeCloseTo(2 * ENGINE.xpPerSet, 5);
    expect(gain('quads')).toBe(0);
    expect(sim.stats.workouts).toBe(1);
    expect(sim.stats.hardSets).toBe(4);
  });

  it('levels a beginner up with consistent training', () => {
    const workouts: Workout[] = [];
    for (let week = 0; week < 8; week++) {
      workouts.push(workout(addDays(START, week * 7), 'bench-press', 5));
      workouts.push(workout(addDays(START, week * 7 + 3), 'incline-db-press', 5));
    }
    const sim = simulate(data(profile(), workouts), addDays(START, 55))!;
    expect(sim.muscles.chest.info.level).toBeGreaterThanOrEqual(5);
    expect(sim.muscles.chest.status).toBe('growing');
    expect(sim.events.some((e) => e.kind === 'levelUp' && e.muscle === 'chest')).toBe(true);
  });

  it('decays XP after the grace period and banks it as muscle memory', () => {
    const p = profile({ experience: 'advanced' });
    const trained = workout(START, 'bench-press', 6);
    const early = simulate(data(p, [trained]), addDays(START, 10))!;
    expect(early.muscles.chest.status).not.toBe('decaying');
    expect(early.muscles.chest.xp).toBeCloseTo(simulate(data(p, [trained]), START)!.muscles.chest.xp);

    const late = simulate(data(p, [trained]), addDays(START, 60))!;
    expect(late.muscles.chest.status).toBe('decaying');
    expect(late.muscles.chest.xp).toBeLessThan(early.muscles.chest.xp);
    expect(late.muscles.chest.info.level).toBeLessThan(early.muscles.chest.info.level);
    expect(late.muscles.chest.memoryXp).toBeGreaterThan(0);
    expect(late.events.some((e) => e.kind === 'levelDown' && e.muscle === 'chest')).toBe(true);
  });

  it('keeps a muscle stable with maintenance volume', () => {
    const p = profile({ experience: 'intermediate' });
    const workouts = Array.from({ length: 12 }, (_, i) => workout(addDays(START, i * 7), 'lateral-raise', 3));
    const sim = simulate(data(p, workouts), addDays(START, 83))!;
    expect(sim.muscles.sideDelts.status).not.toBe('decaying');
    expect(sim.muscles.sideDelts.xp).toBeGreaterThan(sim.baseline.muscleXp.sideDelts);
  });

  it('regains lost XP faster thanks to muscle memory', () => {
    const p = profile({ experience: 'advanced' });
    const first = workout(START, 'barbell-curl', 6);
    const returnDay = addDays(START, 60);
    const comeback = workout(returnDay, 'barbell-curl', 6);
    const before = simulate(data(p, [first]), addDays(returnDay, -1))!.muscles.biceps.xp;
    const after = simulate(data(p, [first, comeback]), returnDay)!.muscles.biceps.xp;
    const beforeReturnMemory = simulate(data(p, [first]), addDays(returnDay, -1))!.muscles.biceps.memoryXp;
    expect(beforeReturnMemory).toBeGreaterThan(0);
    // Double gains: 6 sets × 10 XP, plus an equal bonus from memory.
    expect(after - before).toBeGreaterThan(6 * ENGINE.xpPerSet * 1.9);
  });

  it('awards a PR bonus when estimated 1RM improves', () => {
    const p = profile();
    const w1 = workout(START, 'back-squat', 3, 5, 100);
    const w2 = workout(addDays(START, 3), 'back-squat', 3, 5, 110);
    const w3 = workout(addDays(START, 6), 'back-squat', 3, 5, 110);
    const sim = simulate(data(p, [w1, w2, w3]), addDays(START, 6))!;
    const prs = sim.events.filter((e) => e.kind === 'pr');
    expect(prs).toHaveLength(1);
    expect(sim.records['back-squat'].e1rm).toBeCloseTo(110 * (1 + 5 / 30));
  });

  it('applies recovery multipliers from check-ins', () => {
    const p = profile();
    const w = workout(START, 'leg-extension', 4);
    const good = simulate({ ...data(p, [w]), checkIns: [{ date: START, sleepHours: 8, proteinG: 150 }] }, START)!;
    const bad = simulate({ ...data(p, [w]), checkIns: [{ date: START, sleepHours: 5, proteinG: 40 }] }, START)!;
    expect(good.recovery.multiplier).toBeCloseTo(1.15);
    expect(bad.recovery.multiplier).toBeCloseTo(0.85);
    expect(good.muscles.quads.xp).toBeGreaterThan(bad.muscles.quads.xp);
  });

  it('is deterministic and order-independent', () => {
    const p = profile();
    const ws = [workout(START, 'bench-press', 3), workout(addDays(START, 2), 'deadlift', 3)];
    const a = simulate(data(p, ws), addDays(START, 5))!;
    const b = simulate(data(p, [...ws].reverse()), addDays(START, 5))!;
    expect(a.overall.totalXp).toBeCloseTo(b.overall.totalXp);
  });

  it('counts the current streak including yesterday', () => {
    const p = profile();
    const today = addDays(START, 4);
    const sim = simulate(
      {
        ...data(p, [workout(addDays(START, 1), 'crunch', 3)]),
        checkIns: [
          { date: addDays(START, 2), weightKg: 80 },
          { date: addDays(START, 3), weightKg: 80 },
        ],
      },
      today,
    )!;
    expect(sim.stats.currentStreak).toBe(3);
    expect(sim.stats.bestStreak).toBe(3);
  });

  it('projects days until decay and level loss', () => {
    const p = profile({ experience: 'intermediate' });
    const sim = simulate(data(p, [workout(START, 'bench-press', 6)]), START)!;
    const chest = sim.muscles.chest;
    // The session keeps the trailing week above maintenance for 6 more days, then the grace period runs.
    expect(chest.daysUntilDecay).toBe(6 + ENGINE.graceDays + 1);
    const loss = daysUntilLevelLoss(chest)!;
    expect(loss).toBeGreaterThan(chest.daysUntilDecay);
    const future = simulate(data(p, [workout(START, 'bench-press', 6)]), addDays(START, loss))!;
    expect(future.muscles.chest.info.level).toBe(chest.info.level - 1);
    const dayBefore = simulate(data(p, [workout(START, 'bench-press', 6)]), addDays(START, loss - 1))!;
    expect(dayBefore.muscles.chest.info.level).toBe(chest.info.level);
    expect(levelFromXp(future.muscles.chest.xp).level).toBe(future.muscles.chest.info.level);
  });
});
