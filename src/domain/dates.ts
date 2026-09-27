/**
 * Calendar-day helpers. All dates in the domain are local calendar days encoded
 * as `YYYY-MM-DD` strings. Arithmetic is done on UTC day indices so it is immune
 * to DST shifts and time zones.
 */
export type LocalDate = string;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Days since the Unix epoch for a local date string. */
export function dayIndex(date: LocalDate): number {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function fromDayIndex(index: number): LocalDate {
  const dt = new Date(index * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayIndex(dayIndex(date) + days);
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  return dayIndex(to) - dayIndex(from);
}

/** Today's date in the user's local time zone. */
export function today(now: Date = new Date()): LocalDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatDate(
  date: LocalDate,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  const idx = dayIndex(date);
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(idx * DAY_MS));
}
