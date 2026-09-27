import { computeBaseline, onboardingScan, type Baseline } from './assessment';
import { dayIndex, fromDayIndex, type LocalDate } from './dates';
import { buildExerciseIndex, type Exercise } from './exercises';
import { levelFromXp, tierForLevel, xpToNext, type LevelInfo, type Tier } from './leveling';
import { MUSCLE_IDS, MUSCLES, TOTAL_MUSCLE_WEIGHT, type MuscleId } from './muscles';
import type { AppData, CheckIn, Workout } from './schema';
import { effectiveLoad, effectiveSetsByMuscle, estimated1RM, sessionValue, weeklyScale } from './stimulus';

/**
 * Deterministic progression engine. The whole state is derived by replaying
 * the raw logs day by day from the start date, so editing or deleting a past
 * workout always yields a consistent result.
 */

export const ENGINE = {
  /** XP for one fully effective set on a primary muscle. */
  xpPerSet: 10,
  /** XP bonus (× contribution) for beating an exercise's estimated 1RM. */
  prBonus: 15,
  /** Minimum relative e1RM improvement that counts as a PR. */
  prThreshold: 0.005,
  /** Effective sets in the trailing 7 days needed to maintain a muscle. */
  maintenanceSets: 3,
  /** Effective sets in the trailing 7 days that count as a growth dose. */
  growthSets: 6,
  /** Days after the last maintained day before XP starts to decay. */
  graceDays: 7,
  /** Daily decay as a fraction of the current level cost, ramping from min to max. */
  decayMin: 0.015,
  decayMax: 0.05,
  decayRampDays: 14,
  /** Daily fade of banked "muscle memory" XP. */
  memoryFade: 0.003,
} as const;

export type MuscleStatus = 'growing' | 'maintaining' | 'idle' | 'decaying';

export interface MuscleState {
  id: MuscleId;
  xp: number;
  info: LevelInfo;
  tier: Tier;
  status: MuscleStatus;
  /** Effective sets in the trailing 7 days (including today). */
  weeklySets: number;
  /** XP gained (net of decay) over the trailing 7 days. */
  weeklyXpDelta: number;
  /** XP lost to detraining that can be regained at double speed. */
  memoryXp: number;
  /** Days from today until decay would begin if nothing more is trained; 0 when already decaying. */
  daysUntilDecay: number;
  /** How many days decay has been running (0 when not decaying). */
  decayDays: number;
  lastTrainedDate?: LocalDate;
  totalEffectiveSets: number;
}

export type GameEvent =
  | { kind: 'levelUp' | 'levelDown'; date: LocalDate; muscle: MuscleId | 'overall'; level: number }
  | { kind: 'pr'; date: LocalDate; exerciseId: string; e1rm: number; previous: number };

export interface PersonalRecord {
  exerciseId: string;
  e1rm: number;
  date: LocalDate;
}

export interface RecoveryFactors {
  multiplier: number;
  sleepHours?: number;
  proteinPerKg?: number;
}

export interface Simulation {
  startDate: LocalDate;
  endDate: LocalDate;
  baseline: Baseline;
  muscles: Record<MuscleId, MuscleState>;
  overall: LevelInfo & { tier: Tier; weeklyXpDelta: number };
  timeline: {
    dates: LocalDate[];
    overallXp: number[];
    muscleXp: Record<MuscleId, number[]>;
  };
  events: GameEvent[];
  records: Record<string, PersonalRecord>;
  recovery: RecoveryFactors;
  stats: {
    workouts: number;
    hardSets: number;
    currentStreak: number;
    bestStreak: number;
    activeDaysLast28: number;
  };
}

export function overallXpOf(xp: Record<MuscleId, number>): number {
  let sum = 0;
  for (const id of MUSCLE_IDS) sum += xp[id] * MUSCLES[id].weight;
  return sum / TOTAL_MUSCLE_WEIGHT;
}

/** Latest known body weight on or before `date`. */
function makeBodyWeightLookup(startWeight: number, checkIns: CheckIn[]) {
  const weighIns = checkIns
    .filter((c) => c.weightKg !== undefined)
    .map((c) => [dayIndex(c.date), c.weightKg as number] as const)
    .sort((a, b) => a[0] - b[0]);
  return (day: number): number => {
    let w = startWeight;
    for (const [d, kg] of weighIns) {
      if (d > day) break;
      w = kg;
    }
    return w;
  };
}

/**
 * Recovery multiplier from the trailing 3 days of check-ins. Adequate sleep and
 * protein (≥1.6 g/kg, Morton et al. 2018) boost gains; clear deficits reduce them.
 * Missing data is neutral — not logging is never punished.
 */
export function recoveryFactors(recent: CheckIn[], bodyWeightKg: number): RecoveryFactors {
  const sleeps = recent.map((c) => c.sleepHours).filter((v): v is number => v !== undefined);
  const proteins = recent.map((c) => c.proteinG).filter((v): v is number => v !== undefined);
  let multiplier = 1;
  let sleepHours: number | undefined;
  let proteinPerKg: number | undefined;
  if (sleeps.length) {
    sleepHours = sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
    if (sleepHours >= 7) multiplier += 0.05;
    else if (sleepHours < 6) multiplier -= 0.05;
  }
  if (proteins.length) {
    proteinPerKg = proteins.reduce((a, b) => a + b, 0) / proteins.length / bodyWeightKg;
    if (proteinPerKg >= 1.6) multiplier += 0.1;
    else if (proteinPerKg >= 1.2) multiplier += 0.05;
    else if (proteinPerKg < 0.8) multiplier -= 0.1;
  }
  return { multiplier, sleepHours, proteinPerKg };
}

export function decayRate(decayDay: number): number {
  const t = Math.min(1, Math.max(0, (decayDay - 1) / ENGINE.decayRampDays));
  return ENGINE.decayMin + (ENGINE.decayMax - ENGINE.decayMin) * t;
}

function groupBy<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function simulate(data: AppData, endDate: LocalDate): Simulation | null {
  const profile = data.profile;
  if (!profile) return null;

  const exercises = buildExerciseIndex(data.customExercises.map((c) => ({ ...c }) as Exercise));
  const baseline = computeBaseline(profile, onboardingScan(data.scans));

  const earliestWorkout = data.workouts.reduce<number>(
    (min, w) => Math.min(min, dayIndex(w.date)),
    Number.POSITIVE_INFINITY,
  );
  const start = Math.min(dayIndex(profile.startDate), earliestWorkout);
  const end = Math.max(dayIndex(endDate), start);

  const workoutsByDay = groupBy<Workout>(data.workouts, (w) => dayIndex(w.date));
  const checkInsByDay = new Map<number, CheckIn>(data.checkIns.map((c) => [dayIndex(c.date), c]));
  const bodyWeightOn = makeBodyWeightLookup(profile.startWeightKg, data.checkIns);

  const xp = { ...baseline.muscleXp };
  const memory = Object.fromEntries(MUSCLE_IDS.map((id) => [id, 0])) as Record<MuscleId, number>;
  const lastMaintained = Object.fromEntries(MUSCLE_IDS.map((id) => [id, start])) as Record<MuscleId, number>;
  const lastTrained: Partial<Record<MuscleId, number>> = {};
  const totalSets = Object.fromEntries(MUSCLE_IDS.map((id) => [id, 0])) as Record<MuscleId, number>;
  /** Ring buffer of the last 7 days of effective sets per muscle. */
  const window = Object.fromEntries(MUSCLE_IDS.map((id) => [id, new Array<number>(7).fill(0)])) as Record<
    MuscleId,
    number[]
  >;
  const weekSum = (id: MuscleId) => window[id].reduce((a, b) => a + b, 0);

  const levels = Object.fromEntries(MUSCLE_IDS.map((id) => [id, levelFromXp(xp[id]).level])) as Record<
    MuscleId,
    number
  >;
  let overallLevel = levelFromXp(overallXpOf(xp)).level;

  const records: Record<string, PersonalRecord> = {};
  const events: GameEvent[] = [];
  const timeline = {
    dates: [] as LocalDate[],
    overallXp: [] as number[],
    muscleXp: Object.fromEntries(MUSCLE_IDS.map((id) => [id, [] as number[]])) as Record<MuscleId, number[]>,
  };

  let workoutCount = 0;
  let hardSets = 0;
  let recovery: RecoveryFactors = { multiplier: 1 };

  for (let day = start; day <= end; day++) {
    const date = fromDayIndex(day);
    const slot = (day - start) % 7;
    for (const id of MUSCLE_IDS) window[id][slot] = 0;

    const bodyWeight = bodyWeightOn(day);
    const recent = [day - 2, day - 1, day].map((d) => checkInsByDay.get(d)).filter((c): c is CheckIn => !!c);
    recovery = recoveryFactors(recent, bodyWeight);

    for (const workout of workoutsByDay.get(day) ?? []) {
      const entries = workout.exercises
        .map((e) => ({ exercise: exercises.get(e.exerciseId), sets: e.sets }))
        .filter((e): e is { exercise: Exercise; sets: typeof e.sets } => !!e.exercise);
      if (entries.length === 0) continue;
      workoutCount++;

      const effective = effectiveSetsByMuscle(entries);
      for (const [id, sets] of Object.entries(effective) as [MuscleId, number][]) {
        if (sets <= 0) continue;
        const prior = weekSum(id);
        let gain = sessionValue(sets) * weeklyScale(prior, sets) * ENGINE.xpPerSet * recovery.multiplier;
        const bonus = Math.min(memory[id], gain);
        memory[id] -= bonus;
        gain += bonus;
        xp[id] += gain;
        window[id][slot] += sets;
        totalSets[id] += sets;
        lastTrained[id] = day;
      }

      for (const { exercise, sets } of entries) {
        hardSets += sets.filter((s) => !s.warmup && s.reps > 0).length;
        const best = sets
          .filter((s) => !s.warmup)
          .reduce((max, s) => Math.max(max, estimated1RM(effectiveLoad(exercise, s, bodyWeight), s.reps)), 0);
        if (best <= 0) continue;
        const prev = records[exercise.id];
        if (prev && best > prev.e1rm * (1 + ENGINE.prThreshold)) {
          events.push({ kind: 'pr', date, exerciseId: exercise.id, e1rm: best, previous: prev.e1rm });
          for (const [id, contribution] of Object.entries(exercise.muscles) as [MuscleId, number][]) {
            if (contribution >= 0.5) xp[id] += ENGINE.prBonus * contribution * recovery.multiplier;
          }
        }
        if (!prev || best > prev.e1rm) records[exercise.id] = { exerciseId: exercise.id, e1rm: best, date };
      }
    }

    for (const id of MUSCLE_IDS) {
      if (weekSum(id) >= ENGINE.maintenanceSets) lastMaintained[id] = day;
      const idle = day - lastMaintained[id];
      if (idle > ENGINE.graceDays) {
        const current = levelFromXp(xp[id]).level;
        const loss = Math.min(xp[id], decayRate(idle - ENGINE.graceDays) * xpToNext(current));
        xp[id] -= loss;
        memory[id] += loss;
      }
      memory[id] *= 1 - ENGINE.memoryFade;

      const level = levelFromXp(xp[id]).level;
      if (level !== levels[id]) {
        events.push({ kind: level > levels[id] ? 'levelUp' : 'levelDown', date, muscle: id, level });
        levels[id] = level;
      }
      timeline.muscleXp[id].push(xp[id]);
    }

    const overallXp = overallXpOf(xp);
    const ol = levelFromXp(overallXp).level;
    if (ol !== overallLevel) {
      events.push({ kind: ol > overallLevel ? 'levelUp' : 'levelDown', date, muscle: 'overall', level: ol });
      overallLevel = ol;
    }
    timeline.dates.push(date);
    timeline.overallXp.push(overallXp);
  }

  const lastIdx = timeline.dates.length - 1;
  const weekAgoIdx = Math.max(0, lastIdx - 7);
  const muscles = {} as Record<MuscleId, MuscleState>;
  for (const id of MUSCLE_IDS) {
    const info = levelFromXp(xp[id]);
    const weeklySets = weekSum(id);
    const idle = end - lastMaintained[id];
    const decaying = idle > ENGINE.graceDays;

    // Project the last day the trailing window stays above maintenance with no further training.
    const setsOn = (d: number) => (d < start ? 0 : window[id][(d - start) % 7]);
    let projectedMaintained = lastMaintained[id];
    for (let k = 1; k <= 6; k++) {
      let sum = 0;
      for (let d = end + k - 6; d <= end; d++) sum += setsOn(d);
      if (sum >= ENGINE.maintenanceSets) projectedMaintained = end + k;
    }

    const baseXpWeekAgo = lastIdx >= 7 ? timeline.muscleXp[id][weekAgoIdx] : baseline.muscleXp[id];
    muscles[id] = {
      id,
      xp: xp[id],
      info,
      tier: tierForLevel(info.level),
      status: decaying
        ? 'decaying'
        : weeklySets >= ENGINE.growthSets
          ? 'growing'
          : weeklySets >= ENGINE.maintenanceSets
            ? 'maintaining'
            : 'idle',
      weeklySets,
      weeklyXpDelta: xp[id] - baseXpWeekAgo,
      memoryXp: memory[id],
      daysUntilDecay: decaying ? 0 : projectedMaintained + ENGINE.graceDays + 1 - end,
      decayDays: decaying ? idle - ENGINE.graceDays : 0,
      lastTrainedDate: lastTrained[id] !== undefined ? fromDayIndex(lastTrained[id]) : undefined,
      totalEffectiveSets: totalSets[id],
    };
  }

  const overallXp = overallXpOf(xp);
  const overallInfo = levelFromXp(overallXp);
  const overallWeekAgo = lastIdx >= 7 ? timeline.overallXp[weekAgoIdx] : overallXpOf(baseline.muscleXp);

  return {
    startDate: fromDayIndex(start),
    endDate: fromDayIndex(end),
    baseline,
    muscles,
    overall: { ...overallInfo, tier: tierForLevel(overallInfo.level), weeklyXpDelta: overallXp - overallWeekAgo },
    timeline,
    events,
    records,
    recovery,
    stats: { workouts: workoutCount, hardSets, ...streaks(data, start, end) },
  };
}

function streaks(data: AppData, start: number, end: number) {
  const active = new Set<number>();
  for (const w of data.workouts) active.add(dayIndex(w.date));
  for (const c of data.checkIns) active.add(dayIndex(c.date));

  let best = 0;
  let run = 0;
  for (let d = start; d <= end; d++) {
    run = active.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // The current streak survives until the end of today even if today isn't logged yet.
  let current = 0;
  let d = active.has(end) ? end : end - 1;
  while (active.has(d)) {
    current++;
    d--;
  }
  let activeDaysLast28 = 0;
  for (let i = end - 27; i <= end; i++) if (active.has(i)) activeDaysLast28++;
  return { currentStreak: current, bestStreak: best, activeDaysLast28 };
}

/**
 * Days until the muscle drops a level if it is not trained at all from today on.
 * Returns null at level 1 or when the loss would take longer than a year.
 */
export function daysUntilLevelLoss(state: MuscleState): number | null {
  if (state.info.level <= 1) return null;
  const floor = state.info.totalXp - state.info.xpIntoLevel;
  let xp = state.xp;
  for (let k = 1; k <= 365; k++) {
    const decayDay = state.decayDays > 0 ? state.decayDays + k : k - state.daysUntilDecay + 1;
    if (decayDay < 1) continue;
    xp -= decayRate(decayDay) * xpToNext(levelFromXp(xp).level);
    if (xp < floor) return k;
  }
  return null;
}
