import { buildDemoScan } from '../scan/demoScan';
import { addDays, type LocalDate } from './dates';
import { DATA_VERSION, DEFAULT_SETTINGS, type AppData, type CheckIn, type Measurement, type Workout } from './schema';

/** Small deterministic PRNG so demo data is stable across reloads and tests. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Plan = { title: string; lifts: [exerciseId: string, startKg: number, reps: number, sets: number][] };

const PLANS: Plan[] = [
  {
    title: 'Push',
    lifts: [
      ['bench-press', 70, 8, 4],
      ['overhead-press', 42.5, 8, 3],
      ['incline-db-press', 24, 10, 3],
      ['lateral-raise', 10, 15, 4],
      ['triceps-pushdown', 25, 12, 3],
    ],
  },
  {
    title: 'Pull',
    lifts: [
      ['pull-up', 0, 8, 4],
      ['barbell-row', 65, 8, 3],
      ['face-pull', 20, 15, 3],
      ['barbell-curl', 32.5, 10, 3],
      ['hammer-curl', 14, 12, 2],
    ],
  },
  {
    title: 'Legs',
    lifts: [
      ['back-squat', 90, 6, 4],
      ['romanian-deadlift', 80, 8, 3],
      ['leg-extension', 45, 12, 3],
      ['lying-leg-curl', 35, 12, 3],
      ['standing-calf-raise', 60, 12, 3],
      ['hanging-leg-raise', 0, 12, 3],
    ],
  },
];

/** Build a realistic 12-week history ending on `endDate` for the "try the demo" flow. */
export function buildDemoData(endDate: LocalDate, weeks = 12): AppData {
  const rand = mulberry32(42);
  const start = addDays(endDate, -weeks * 7);
  const workouts: Workout[] = [];
  const checkIns: CheckIn[] = [];
  const measurements: Measurement[] = [];
  let weight = 78;
  let id = 0;
  const next = () => `demo-${++id}`;

  for (let day = 0; day < weeks * 7; day++) {
    const date = addDays(start, day);
    const week = Math.floor(day / 7);
    const dow = day % 7;
    // A one-week holiday in week 7 shows decay and muscle memory.
    const holiday = week === 7;
    const planIndex = [0, 1, 2, -1, 0, 1, 2][dow];

    if (!holiday && planIndex >= 0 && !(dow >= 4 && rand() < 0.25)) {
      const plan = PLANS[planIndex];
      const progress = 1 + week * 0.012;
      workouts.push({
        id: next(),
        date,
        title: plan.title,
        durationMin: 55 + Math.round(rand() * 25),
        exercises: plan.lifts
          // Calves get skipped in the second half to demonstrate decay.
          .filter(([ex]) => !(ex === 'standing-calf-raise' && week >= 6))
          .map(([exerciseId, kg, reps, sets]) => ({
            id: next(),
            exerciseId,
            sets: Array.from({ length: sets }, (_, i) => ({
              id: next(),
              reps: Math.max(1, reps - (i === sets - 1 ? 1 : 0) + (rand() < 0.2 ? 1 : 0)),
              weightKg: kg === 0 ? 0 : Math.round((kg * progress) / 1.25) * 1.25,
              rir: i === sets - 1 ? 1 : 2,
            })),
          })),
      });
    }

    weight += (rand() - 0.42) * 0.25;
    if (rand() < 0.8) {
      checkIns.push({
        date,
        weightKg: Math.round(weight * 10) / 10,
        sleepHours: Math.round((6.2 + rand() * 2.3) * 2) / 2,
        proteinG: Math.round(120 + rand() * 60),
        energy: 2 + Math.floor(rand() * 4),
      });
    }

    if (dow === 6 && week % 2 === 1) {
      measurements.push({
        id: next(),
        date,
        values: {
          neck: 38.5,
          waist: Math.round((84 - week * 0.15) * 10) / 10,
          chest: Math.round((101 + week * 0.2) * 10) / 10,
          upperArm: Math.round((35.5 + week * 0.08) * 10) / 10,
          thigh: Math.round((57 + week * 0.1) * 10) / 10,
          calf: 37.5,
        },
      });
    }
  }

  return {
    version: DATA_VERSION,
    profile: {
      name: 'Alex',
      sex: 'male',
      birthYear: 1996,
      heightCm: 180,
      startDate: start,
      startWeightKg: 78,
      experience: 'beginner',
      selfRatings: { calves: -1, chest: 1 },
      startMeasurements: { neck: 38.5, waist: 84, chest: 100, upperArm: 35, thigh: 56.5, calf: 37.5 },
    },
    workouts,
    checkIns,
    measurements,
    customExercises: [],
    scans: [buildDemoScan(start)],
    settings: { ...DEFAULT_SETTINGS },
  };
}
