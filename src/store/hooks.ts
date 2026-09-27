import { useEffect, useMemo, useState } from 'react';
import { bodyStats } from '../domain/bodystats';
import { today as todayFn, type LocalDate } from '../domain/dates';
import { simulate } from '../domain/engine';
import { buildExerciseIndex, type Exercise } from '../domain/exercises';
import { useAppStore } from './store';

/** Today's local date; re-renders when the day rolls over or the tab regains focus. */
export function useToday(): LocalDate {
  const [value, setValue] = useState(todayFn);
  useEffect(() => {
    const refresh = () => setValue(todayFn());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return value;
}

export function useData() {
  return useAppStore((s) => s.data);
}

export function useSettings() {
  return useAppStore((s) => s.data.settings);
}

export function useProfile() {
  return useAppStore((s) => s.data.profile);
}

export function useSimulation() {
  const data = useData();
  const today = useToday();
  return useMemo(() => simulate(data, today), [data, today]);
}

export function useBodyStats() {
  const data = useData();
  return useMemo(() => bodyStats(data), [data]);
}

export function useExerciseIndex(): Map<string, Exercise> {
  const custom = useAppStore((s) => s.data.customExercises);
  return useMemo(() => buildExerciseIndex(custom as Exercise[]), [custom]);
}
