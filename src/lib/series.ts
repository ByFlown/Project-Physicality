import { dayIndex, type LocalDate } from '../domain/dates';

/** Trailing moving average over calendar days (not samples). */
export function movingAverage(points: { date: LocalDate; value: number }[], days: number) {
  return points.map((p, i) => {
    const end = dayIndex(p.date);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && end - dayIndex(points[j].date) < days; j--) {
      sum += points[j].value;
      n++;
    }
    return { date: p.date, value: sum / n };
  });
}
