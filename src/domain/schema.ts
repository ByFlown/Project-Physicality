import { z } from 'zod';
import { isLocalDate } from './dates';
import { MUSCLE_IDS } from './muscles';

/**
 * Persisted data model. All physical quantities are stored in metric units
 * (kg, cm); conversion happens only at the UI boundary.
 */

export const localDate = z.string().refine(isLocalDate, 'Expected a YYYY-MM-DD date');
const id = z.string().min(1).max(64);
const muscleId = z.enum(MUSCLE_IDS);

export const MEASURE_SITES = [
  'neck',
  'shoulders',
  'chest',
  'waist',
  'hips',
  'upperArm',
  'forearm',
  'thigh',
  'calf',
] as const;
export type MeasureSite = (typeof MEASURE_SITES)[number];

export const MEASURE_LABELS: Record<MeasureSite, string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  waist: 'Waist (navel)',
  hips: 'Hips',
  upperArm: 'Upper arm (flexed)',
  forearm: 'Forearm',
  thigh: 'Thigh',
  calf: 'Calf',
};

export const sexSchema = z.enum(['male', 'female']);
export type Sex = z.infer<typeof sexSchema>;

export const experienceSchema = z.enum(['none', 'beginner', 'intermediate', 'advanced', 'elite']);
export type Experience = z.infer<typeof experienceSchema>;

export const EXPERIENCE_LABELS: Record<Experience, { label: string; hint: string }> = {
  none: { label: 'Never trained', hint: 'No consistent resistance training yet' },
  beginner: { label: 'Beginner', hint: 'Less than 1 year of consistent training' },
  intermediate: { label: 'Intermediate', hint: '1–3 years of consistent training' },
  advanced: { label: 'Advanced', hint: '3–6 years, structured programming' },
  elite: { label: 'Elite', hint: '6+ years, near natural potential' },
};

/** Self-assessment of a muscle relative to the rest of the body. */
export const selfRatingSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
export type SelfRating = z.infer<typeof selfRatingSchema>;

export const measurementValuesSchema = z.partialRecord(z.enum(MEASURE_SITES), z.number().positive().max(300));
export type MeasurementValues = z.infer<typeof measurementValuesSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  sex: sexSchema,
  birthYear: z.number().int().min(1900).max(2100),
  heightCm: z.number().min(120).max(250),
  startDate: localDate,
  startWeightKg: z.number().min(30).max(300),
  startBodyFatPct: z.number().min(3).max(60).optional(),
  experience: experienceSchema,
  selfRatings: z.partialRecord(muscleId, selfRatingSchema),
  startMeasurements: measurementValuesSchema,
});
export type Profile = z.infer<typeof profileSchema>;

export const setSchema = z.object({
  id,
  reps: z.number().int().min(0).max(200),
  weightKg: z.number().min(0).max(1000),
  /** Reps in reserve (0 = failure). Undefined = not recorded. */
  rir: z.number().int().min(0).max(10).optional(),
  warmup: z.boolean().optional(),
});
export type WorkoutSet = z.infer<typeof setSchema>;

export const exerciseEntrySchema = z.object({
  id,
  exerciseId: id,
  sets: z.array(setSchema).max(50),
});
export type ExerciseEntry = z.infer<typeof exerciseEntrySchema>;

export const workoutSchema = z.object({
  id,
  date: localDate,
  title: z.string().max(60).optional(),
  durationMin: z.number().int().min(0).max(600).optional(),
  notes: z.string().max(1000).optional(),
  exercises: z.array(exerciseEntrySchema).max(40),
});
export type Workout = z.infer<typeof workoutSchema>;

export const checkInSchema = z.object({
  date: localDate,
  weightKg: z.number().min(30).max(300).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  proteinG: z.number().min(0).max(600).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(500).optional(),
});
export type CheckIn = z.infer<typeof checkInSchema>;

export const measurementSchema = z.object({
  id,
  date: localDate,
  values: measurementValuesSchema,
  bodyFatPct: z.number().min(3).max(60).optional(),
});
export type Measurement = z.infer<typeof measurementSchema>;

export const customExerciseSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other']),
  muscles: z.partialRecord(muscleId, z.number().min(0).max(1)),
  bodyweightFactor: z.number().min(0).max(1.5),
});
export type CustomExercise = z.infer<typeof customExerciseSchema>;

export const settingsSchema = z.object({
  units: z.enum(['metric', 'imperial']),
  theme: z.enum(['system', 'dark', 'light']),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DATA_VERSION = 1;

export const appDataSchema = z.object({
  version: z.literal(DATA_VERSION),
  profile: profileSchema.nullable(),
  workouts: z.array(workoutSchema),
  checkIns: z.array(checkInSchema),
  measurements: z.array(measurementSchema),
  customExercises: z.array(customExerciseSchema),
  settings: settingsSchema,
});
export type AppData = z.infer<typeof appDataSchema>;

export const DEFAULT_SETTINGS: Settings = { units: 'metric', theme: 'system' };

export function emptyAppData(): AppData {
  return {
    version: DATA_VERSION,
    profile: null,
    workouts: [],
    checkIns: [],
    measurements: [],
    customExercises: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
