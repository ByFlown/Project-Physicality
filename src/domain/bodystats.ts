import { startBodyFat, type BodyFatSource } from './assessment';
import { ffmi, navyBodyFat } from './bodycomp';
import { compareDates, type LocalDate } from './dates';
import type { AppData, MeasurementValues } from './schema';

export interface CompositionPoint {
  date: LocalDate;
  weightKg: number;
  bodyFatPct: number;
  bodyFatSource: BodyFatSource;
  leanKg: number;
  ffmi: number;
}

export interface BodyStats {
  weightSeries: { date: LocalDate; kg: number }[];
  composition: CompositionPoint[];
  current: CompositionPoint;
  /** Latest value for every measurement site, merged across entries. */
  latestMeasurements: MeasurementValues;
}

/** Weight series (start weight + check-ins), body composition at each measurement. */
export function bodyStats(data: AppData): BodyStats | null {
  const profile = data.profile;
  if (!profile) return null;

  const weightSeries = [
    { date: profile.startDate, kg: profile.startWeightKg },
    ...data.checkIns.filter((c) => c.weightKg !== undefined).map((c) => ({ date: c.date, kg: c.weightKg as number })),
  ].sort((a, b) => compareDates(a.date, b.date));
  // A check-in on the start date overrides the onboarding weight.
  const dedup = weightSeries.filter((p, i) => i === weightSeries.length - 1 || weightSeries[i + 1].date !== p.date);

  const weightOn = (date: LocalDate) => {
    let kg = profile.startWeightKg;
    for (const p of dedup) {
      if (p.date > date) break;
      kg = p.kg;
    }
    return kg;
  };

  const makePoint = (date: LocalDate, bf: number, source: BodyFatSource): CompositionPoint => {
    const weightKg = weightOn(date);
    return {
      date,
      weightKg,
      bodyFatPct: bf,
      bodyFatSource: source,
      leanKg: weightKg * (1 - bf / 100),
      ffmi: ffmi(weightKg, profile.heightCm, bf),
    };
  };

  const start = startBodyFat(profile);
  const composition: CompositionPoint[] = [makePoint(profile.startDate, start.value, start.source)];

  const measurements = [...data.measurements].sort((a, b) => compareDates(a.date, b.date));
  const latestMeasurements: MeasurementValues = { ...profile.startMeasurements };
  for (const m of measurements) {
    Object.assign(latestMeasurements, m.values);
    const merged = { ...latestMeasurements };
    let bf: number | undefined = m.bodyFatPct;
    let source: BodyFatSource = 'reported';
    if (bf === undefined) {
      bf = navyBodyFat(profile.sex, profile.heightCm, merged);
      source = 'navy';
    }
    if (bf !== undefined) composition.push(makePoint(m.date, bf, source));
  }
  composition.sort((a, b) => compareDates(a.date, b.date));

  const lastComp = composition[composition.length - 1];
  const lastWeight = dedup[dedup.length - 1];
  // Re-evaluate the latest body fat against the most recent weight.
  const current = makePoint(
    lastWeight.date > lastComp.date ? lastWeight.date : lastComp.date,
    lastComp.bodyFatPct,
    lastComp.bodyFatSource,
  );

  return { weightSeries: dedup, composition, current, latestMeasurements };
}
