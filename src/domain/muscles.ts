export const MUSCLE_IDS = [
  'chest',
  'frontDelts',
  'sideDelts',
  'rearDelts',
  'biceps',
  'triceps',
  'forearms',
  'traps',
  'lats',
  'upperBack',
  'lowerBack',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
] as const;

export type MuscleId = (typeof MUSCLE_IDS)[number];

export type MuscleRegion = 'chest' | 'shoulders' | 'arms' | 'back' | 'core' | 'legs';

export interface MuscleInfo {
  id: MuscleId;
  name: string;
  region: MuscleRegion;
  /** Relative contribution to the overall physique level (roughly muscle mass). */
  weight: number;
  description: string;
}

export const MUSCLES: Record<MuscleId, MuscleInfo> = {
  chest: { id: 'chest', name: 'Chest', region: 'chest', weight: 1.2, description: 'Pectoralis major & minor — horizontal pushing.' },
  frontDelts: { id: 'frontDelts', name: 'Front Delts', region: 'shoulders', weight: 0.6, description: 'Anterior deltoid — overhead and incline pressing.' },
  sideDelts: { id: 'sideDelts', name: 'Side Delts', region: 'shoulders', weight: 0.7, description: 'Lateral deltoid — shoulder width, lateral raises.' },
  rearDelts: { id: 'rearDelts', name: 'Rear Delts', region: 'shoulders', weight: 0.5, description: 'Posterior deltoid — face pulls, reverse flys, rows.' },
  biceps: { id: 'biceps', name: 'Biceps', region: 'arms', weight: 0.7, description: 'Biceps brachii & brachialis — elbow flexion.' },
  triceps: { id: 'triceps', name: 'Triceps', region: 'arms', weight: 0.8, description: 'Triceps brachii — elbow extension, ~2/3 of arm size.' },
  forearms: { id: 'forearms', name: 'Forearms', region: 'arms', weight: 0.5, description: 'Wrist flexors/extensors & brachioradialis — grip.' },
  traps: { id: 'traps', name: 'Traps', region: 'back', weight: 0.7, description: 'Upper trapezius — shrugs, carries, heavy pulls.' },
  lats: { id: 'lats', name: 'Lats', region: 'back', weight: 1.2, description: 'Latissimus dorsi — vertical pulling, V-taper.' },
  upperBack: { id: 'upperBack', name: 'Upper Back', region: 'back', weight: 0.9, description: 'Rhomboids & mid traps — rows, scapular retraction.' },
  lowerBack: { id: 'lowerBack', name: 'Lower Back', region: 'back', weight: 0.7, description: 'Erector spinae — hinging and bracing.' },
  abs: { id: 'abs', name: 'Abs', region: 'core', weight: 0.6, description: 'Rectus abdominis — trunk flexion and bracing.' },
  obliques: { id: 'obliques', name: 'Obliques', region: 'core', weight: 0.5, description: 'Internal & external obliques — rotation, anti-rotation.' },
  glutes: { id: 'glutes', name: 'Glutes', region: 'legs', weight: 1.3, description: 'Gluteus maximus & medius — hip extension.' },
  quads: { id: 'quads', name: 'Quads', region: 'legs', weight: 1.5, description: 'Quadriceps — knee extension, squatting.' },
  hamstrings: { id: 'hamstrings', name: 'Hamstrings', region: 'legs', weight: 1.0, description: 'Biceps femoris & semis — knee flexion, hip extension.' },
  adductors: { id: 'adductors', name: 'Adductors', region: 'legs', weight: 0.7, description: 'Inner thigh — hip adduction, deep squats.' },
  calves: { id: 'calves', name: 'Calves', region: 'legs', weight: 0.6, description: 'Gastrocnemius & soleus — ankle plantarflexion.' },
};

export const REGION_LABELS: Record<MuscleRegion, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  arms: 'Arms',
  back: 'Back',
  core: 'Core',
  legs: 'Legs',
};

export function isMuscleId(value: string): value is MuscleId {
  return (MUSCLE_IDS as readonly string[]).includes(value);
}

export const TOTAL_MUSCLE_WEIGHT = MUSCLE_IDS.reduce((sum, id) => sum + MUSCLES[id].weight, 0);
