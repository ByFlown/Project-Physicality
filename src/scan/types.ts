export type View = 'front' | 'side';

/** Image-space point in pixels (y grows downward). */
export interface Pt {
  x: number;
  y: number;
}

/** MediaPipe pose landmark, normalised to 0..1 of the image. */
export interface Landmark {
  x: number;
  y: number;
  visibility: number;
}

/**
 * Per-pixel person segmentation. Category ids follow MediaPipe's
 * selfie_multiclass model: 0 background, 1 hair, 2 body skin, 3 face skin,
 * 4 clothes, 5 accessories.
 */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

export const CATEGORY = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, accessories: 5 } as const;

export const FRONT_CHORDS = [
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
export const SIDE_CHORDS = ['neck', 'chest', 'waist', 'hips', 'thigh', 'calf'] as const;
export type FrontChord = (typeof FRONT_CHORDS)[number];
export type SideChord = (typeof SIDE_CHORDS)[number];
export type ChordId = FrontChord | SideChord;

export const CHORD_LABELS: Record<ChordId, string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  upperArm: 'Upper arm',
  forearm: 'Forearm',
  thigh: 'Thigh',
  calf: 'Calf',
};

export type Chord = [Pt, Pt];

/** Everything the user can see and correct for one photo. */
export interface ViewMarkup {
  view: View;
  width: number;
  height: number;
  /** Top of the head and bottom of the feet, image rows. */
  top: number;
  floor: number;
  chords: Partial<Record<ChordId, Chord>>;
  /** For the side view: true when the person faces image-right. */
  facingRight?: boolean;
}

/** Torso silhouette sample in image space (pixels). */
export interface ProfileRow {
  y: number;
  left: number;
  right: number;
}

export interface ViewAnalysis {
  markup: ViewMarkup;
  /** Markup as detected, before any manual edits (used to rescale profiles). */
  detected: ViewMarkup;
  landmarks: Landmark[] | null;
  /** Dense torso silhouette between crotch and armpit, when a mask was available. */
  profile: ProfileRow[] | null;
  /** Rows (image space) where the crotch and armpit were found. */
  crotchY: number;
  armpitY: number;
  warnings: string[];
  hasMask: boolean;
}
