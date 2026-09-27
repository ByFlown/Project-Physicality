import { MUSCLES, type MuscleId } from './muscles';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'other';

/** Muscle → stimulus contribution. 1 = primary mover, 0.5 = secondary, 0.25 = stabiliser. */
export type MuscleContribution = Partial<Record<MuscleId, number>>;

export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment;
  muscles: MuscleContribution;
  /**
   * Fraction of body weight that is moved in addition to any external load.
   * 0 for purely loaded exercises (e.g. barbell bench), ~0.64 for push-ups, 1 for pull-ups.
   */
  bodyweightFactor: number;
  custom?: boolean;
}

const ex = (
  id: string,
  name: string,
  equipment: Equipment,
  muscles: MuscleContribution,
  bodyweightFactor = 0,
): Exercise => ({ id, name, equipment, muscles, bodyweightFactor });

export const EXERCISES: Exercise[] = [
  // Chest
  ex('bench-press', 'Barbell Bench Press', 'barbell', { chest: 1, triceps: 0.5, frontDelts: 0.5 }),
  ex('incline-bench-press', 'Incline Barbell Bench Press', 'barbell', { chest: 1, frontDelts: 0.75, triceps: 0.5 }),
  ex('db-bench-press', 'Dumbbell Bench Press', 'dumbbell', { chest: 1, triceps: 0.5, frontDelts: 0.5 }),
  ex('incline-db-press', 'Incline Dumbbell Press', 'dumbbell', { chest: 1, frontDelts: 0.75, triceps: 0.5 }),
  ex('decline-bench-press', 'Decline Bench Press', 'barbell', { chest: 1, triceps: 0.5, frontDelts: 0.25 }),
  ex('machine-chest-press', 'Machine Chest Press', 'machine', { chest: 1, triceps: 0.5, frontDelts: 0.5 }),
  ex('cable-fly', 'Cable Fly', 'cable', { chest: 1, frontDelts: 0.25 }),
  ex('pec-deck', 'Pec Deck', 'machine', { chest: 1, frontDelts: 0.25 }),
  ex('db-fly', 'Dumbbell Fly', 'dumbbell', { chest: 1, frontDelts: 0.25 }),
  ex('push-up', 'Push-up', 'bodyweight', { chest: 1, triceps: 0.5, frontDelts: 0.5, abs: 0.25 }, 0.64),
  ex('dip', 'Dip', 'bodyweight', { chest: 0.75, triceps: 1, frontDelts: 0.5 }, 1),

  // Shoulders
  ex('overhead-press', 'Overhead Press', 'barbell', { frontDelts: 1, sideDelts: 0.5, triceps: 0.5, traps: 0.25, abs: 0.25 }),
  ex('db-shoulder-press', 'Dumbbell Shoulder Press', 'dumbbell', { frontDelts: 1, sideDelts: 0.5, triceps: 0.5 }),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'machine', { frontDelts: 1, sideDelts: 0.5, triceps: 0.5 }),
  ex('arnold-press', 'Arnold Press', 'dumbbell', { frontDelts: 1, sideDelts: 0.5, triceps: 0.5 }),
  ex('lateral-raise', 'Dumbbell Lateral Raise', 'dumbbell', { sideDelts: 1, traps: 0.25 }),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'cable', { sideDelts: 1, traps: 0.25 }),
  ex('front-raise', 'Front Raise', 'dumbbell', { frontDelts: 1, sideDelts: 0.25 }),
  ex('upright-row', 'Upright Row', 'barbell', { sideDelts: 1, traps: 0.75, biceps: 0.25 }),
  ex('face-pull', 'Face Pull', 'cable', { rearDelts: 1, upperBack: 0.5, traps: 0.25 }),
  ex('reverse-fly', 'Reverse Fly', 'dumbbell', { rearDelts: 1, upperBack: 0.5 }),
  ex('reverse-pec-deck', 'Reverse Pec Deck', 'machine', { rearDelts: 1, upperBack: 0.5 }),
  ex('shrug', 'Barbell Shrug', 'barbell', { traps: 1, forearms: 0.25 }),
  ex('db-shrug', 'Dumbbell Shrug', 'dumbbell', { traps: 1, forearms: 0.25 }),

  // Back
  ex('deadlift', 'Deadlift', 'barbell', { glutes: 1, hamstrings: 0.75, lowerBack: 1, traps: 0.5, forearms: 0.5, quads: 0.5, lats: 0.25, upperBack: 0.25 }),
  ex('pull-up', 'Pull-up', 'bodyweight', { lats: 1, biceps: 0.5, upperBack: 0.5, rearDelts: 0.25, forearms: 0.25 }, 1),
  ex('chin-up', 'Chin-up', 'bodyweight', { lats: 1, biceps: 0.75, upperBack: 0.5, forearms: 0.25 }, 1),
  ex('lat-pulldown', 'Lat Pulldown', 'cable', { lats: 1, biceps: 0.5, upperBack: 0.5, rearDelts: 0.25 }),
  ex('barbell-row', 'Barbell Row', 'barbell', { upperBack: 1, lats: 0.75, rearDelts: 0.5, biceps: 0.5, lowerBack: 0.5, forearms: 0.25 }),
  ex('db-row', 'One-arm Dumbbell Row', 'dumbbell', { lats: 1, upperBack: 0.75, rearDelts: 0.5, biceps: 0.5 }),
  ex('cable-row', 'Seated Cable Row', 'cable', { upperBack: 1, lats: 0.75, rearDelts: 0.5, biceps: 0.5 }),
  ex('t-bar-row', 'T-Bar Row', 'barbell', { upperBack: 1, lats: 0.75, rearDelts: 0.5, biceps: 0.5, lowerBack: 0.25 }),
  ex('chest-supported-row', 'Chest-supported Row', 'machine', { upperBack: 1, lats: 0.75, rearDelts: 0.5, biceps: 0.5 }),
  ex('straight-arm-pulldown', 'Straight-arm Pulldown', 'cable', { lats: 1, triceps: 0.25 }),
  ex('pullover', 'Dumbbell Pullover', 'dumbbell', { lats: 1, chest: 0.5, triceps: 0.25 }),
  ex('back-extension', 'Back Extension', 'bodyweight', { lowerBack: 1, glutes: 0.5, hamstrings: 0.5 }, 0.5),
  ex('good-morning', 'Good Morning', 'barbell', { hamstrings: 1, lowerBack: 1, glutes: 0.5 }),

  // Arms
  ex('barbell-curl', 'Barbell Curl', 'barbell', { biceps: 1, forearms: 0.5 }),
  ex('db-curl', 'Dumbbell Curl', 'dumbbell', { biceps: 1, forearms: 0.5 }),
  ex('hammer-curl', 'Hammer Curl', 'dumbbell', { biceps: 0.75, forearms: 1 }),
  ex('preacher-curl', 'Preacher Curl', 'machine', { biceps: 1, forearms: 0.25 }),
  ex('cable-curl', 'Cable Curl', 'cable', { biceps: 1, forearms: 0.5 }),
  ex('incline-db-curl', 'Incline Dumbbell Curl', 'dumbbell', { biceps: 1, forearms: 0.25 }),
  ex('close-grip-bench', 'Close-grip Bench Press', 'barbell', { triceps: 1, chest: 0.75, frontDelts: 0.5 }),
  ex('skull-crusher', 'Skull Crusher', 'barbell', { triceps: 1 }),
  ex('triceps-pushdown', 'Triceps Pushdown', 'cable', { triceps: 1 }),
  ex('overhead-triceps-ext', 'Overhead Triceps Extension', 'cable', { triceps: 1 }),
  ex('wrist-curl', 'Wrist Curl', 'dumbbell', { forearms: 1 }),
  ex('reverse-curl', 'Reverse Curl', 'barbell', { forearms: 1, biceps: 0.5 }),
  ex('farmers-carry', "Farmer's Carry", 'dumbbell', { forearms: 1, traps: 1, abs: 0.25, obliques: 0.5 }),

  // Legs
  ex('back-squat', 'Back Squat', 'barbell', { quads: 1, glutes: 1, adductors: 0.5, lowerBack: 0.25, hamstrings: 0.25 }),
  ex('front-squat', 'Front Squat', 'barbell', { quads: 1, glutes: 0.75, adductors: 0.5, upperBack: 0.25, abs: 0.25 }),
  ex('goblet-squat', 'Goblet Squat', 'dumbbell', { quads: 1, glutes: 0.75, adductors: 0.5 }),
  ex('hack-squat', 'Hack Squat', 'machine', { quads: 1, glutes: 0.5, adductors: 0.25 }),
  ex('leg-press', 'Leg Press', 'machine', { quads: 1, glutes: 0.5, adductors: 0.5 }),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'dumbbell', { quads: 1, glutes: 1, adductors: 0.5 }, 0.8),
  ex('lunge', 'Walking Lunge', 'dumbbell', { quads: 1, glutes: 1, adductors: 0.5, hamstrings: 0.25 }, 0.8),
  ex('leg-extension', 'Leg Extension', 'machine', { quads: 1 }),
  ex('romanian-deadlift', 'Romanian Deadlift', 'barbell', { hamstrings: 1, glutes: 1, lowerBack: 0.5, forearms: 0.25, adductors: 0.25 }),
  ex('lying-leg-curl', 'Lying Leg Curl', 'machine', { hamstrings: 1, calves: 0.25 }),
  ex('seated-leg-curl', 'Seated Leg Curl', 'machine', { hamstrings: 1 }),
  ex('nordic-curl', 'Nordic Hamstring Curl', 'bodyweight', { hamstrings: 1, glutes: 0.25 }, 0.7),
  ex('hip-thrust', 'Barbell Hip Thrust', 'barbell', { glutes: 1, hamstrings: 0.5, quads: 0.25 }),
  ex('glute-bridge', 'Glute Bridge', 'bodyweight', { glutes: 1, hamstrings: 0.5 }, 0.3),
  ex('cable-kickback', 'Cable Glute Kickback', 'cable', { glutes: 1, hamstrings: 0.25 }),
  ex('hip-adduction', 'Hip Adduction Machine', 'machine', { adductors: 1 }),
  ex('hip-abduction', 'Hip Abduction Machine', 'machine', { glutes: 1 }),
  ex('standing-calf-raise', 'Standing Calf Raise', 'machine', { calves: 1 }),
  ex('seated-calf-raise', 'Seated Calf Raise', 'machine', { calves: 1 }),

  // Core
  ex('crunch', 'Crunch', 'bodyweight', { abs: 1 }, 0.3),
  ex('cable-crunch', 'Cable Crunch', 'cable', { abs: 1, obliques: 0.25 }),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'bodyweight', { abs: 1, obliques: 0.5, forearms: 0.25 }, 0.35),
  ex('ab-wheel', 'Ab Wheel Rollout', 'other', { abs: 1, obliques: 0.5, lats: 0.25 }, 0.5),
  ex('plank', 'Plank (reps = 10s holds)', 'bodyweight', { abs: 1, obliques: 0.5 }, 0),
  ex('russian-twist', 'Russian Twist', 'bodyweight', { obliques: 1, abs: 0.5 }, 0.3),
  ex('side-plank', 'Side Plank (reps = 10s holds)', 'bodyweight', { obliques: 1, abs: 0.25 }, 0),
  ex('pallof-press', 'Pallof Press', 'cable', { obliques: 1, abs: 0.5 }),
  ex('woodchopper', 'Cable Woodchopper', 'cable', { obliques: 1, abs: 0.5 }),
];

const BUILTIN_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function buildExerciseIndex(custom: Exercise[] = []): Map<string, Exercise> {
  if (custom.length === 0) return BUILTIN_BY_ID;
  const map = new Map(BUILTIN_BY_ID);
  for (const c of custom) map.set(c.id, { ...c, custom: true });
  return map;
}

/** The muscle that receives the largest share of stimulus from an exercise. */
export function primaryMuscle(exercise: Exercise): MuscleId | undefined {
  let best: MuscleId | undefined;
  let bestValue = -1;
  for (const [id, value] of Object.entries(exercise.muscles) as [MuscleId, number][]) {
    if (value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return best;
}

/** Comma-separated names of the primary and secondary muscles. */
export function musclesSummary(exercise: Exercise): string {
  return (Object.entries(exercise.muscles) as [MuscleId, number][])
    .filter(([, v]) => v >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => MUSCLES[id].name)
    .join(', ');
}
