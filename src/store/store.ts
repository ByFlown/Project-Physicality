import { create } from 'zustand';
import {
  emptyAppData,
  type AppData,
  type CheckIn,
  type CustomExercise,
  type Measurement,
  type Profile,
  type Settings,
  type Workout,
} from '../domain/schema';
import { clearData, loadData, requestPersistentStorage, saveData, subscribeToOtherTabs } from './persistence';

export interface AppState {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  /** Storage key of a backup made when stored data could not be read. */
  recoveredFrom?: string;
  data: AppData;

  hydrate: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  saveWorkout: (workout: Workout) => void;
  deleteWorkout: (id: string) => void;
  saveCheckIn: (checkIn: CheckIn) => void;
  deleteCheckIn: (date: string) => void;
  saveMeasurement: (measurement: Measurement) => void;
  deleteMeasurement: (id: string) => void;
  saveCustomExercise: (exercise: CustomExercise) => void;
  deleteCustomExercise: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceData: (data: AppData) => void;
  resetAll: () => Promise<void>;
}

const upsertBy = <T>(list: T[], item: T, key: (t: T) => string): T[] => {
  const k = key(item);
  const idx = list.findIndex((x) => key(x) === k);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
};

/** Checks-in with nothing filled in are removed rather than stored empty. */
const isEmptyCheckIn = (c: CheckIn) =>
  c.weightKg === undefined &&
  c.sleepHours === undefined &&
  c.proteinG === undefined &&
  c.energy === undefined &&
  !c.notes;

export const useAppStore = create<AppState>()((set, get) => {
  const commit = (recipe: (data: AppData) => AppData) => {
    const data = recipe(get().data);
    set({ data });
    void saveData(data);
  };

  return {
    status: 'loading',
    data: emptyAppData(),

    hydrate: async () => {
      try {
        const { data, recoveredFrom } = await loadData();
        set({ data, recoveredFrom, status: 'ready' });
      } catch (err) {
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },

    setProfile: (profile) => {
      commit((d) => ({ ...d, profile }));
      void requestPersistentStorage();
    },
    updateProfile: (patch) =>
      commit((d) => (d.profile ? { ...d, profile: { ...d.profile, ...patch } } : d)),

    saveWorkout: (workout) => commit((d) => ({ ...d, workouts: upsertBy(d.workouts, workout, (w) => w.id) })),
    deleteWorkout: (id) => commit((d) => ({ ...d, workouts: d.workouts.filter((w) => w.id !== id) })),

    saveCheckIn: (checkIn) =>
      commit((d) => ({
        ...d,
        checkIns: isEmptyCheckIn(checkIn)
          ? d.checkIns.filter((c) => c.date !== checkIn.date)
          : upsertBy(d.checkIns, checkIn, (c) => c.date),
      })),
    deleteCheckIn: (date) => commit((d) => ({ ...d, checkIns: d.checkIns.filter((c) => c.date !== date) })),

    saveMeasurement: (m) => commit((d) => ({ ...d, measurements: upsertBy(d.measurements, m, (x) => x.id) })),
    deleteMeasurement: (id) => commit((d) => ({ ...d, measurements: d.measurements.filter((m) => m.id !== id) })),

    saveCustomExercise: (e) =>
      commit((d) => ({ ...d, customExercises: upsertBy(d.customExercises, e, (x) => x.id) })),
    deleteCustomExercise: (id) =>
      commit((d) => ({ ...d, customExercises: d.customExercises.filter((e) => e.id !== id) })),

    updateSettings: (patch) => commit((d) => ({ ...d, settings: { ...d.settings, ...patch } })),

    replaceData: (data) => commit(() => data),

    resetAll: async () => {
      await clearData();
      set({ data: emptyAppData() });
    },
  };
});

let unsubscribeTabs: (() => void) | undefined;

/** Load persisted data and keep this tab in sync with others. Idempotent. */
export function initStore(): Promise<void> {
  unsubscribeTabs ??= subscribeToOtherTabs(() => void useAppStore.getState().hydrate());
  return useAppStore.getState().hydrate();
}
