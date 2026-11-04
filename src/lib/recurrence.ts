import type { Exception, Series, Task, Window } from "./types";
import { addDays, fromISODate } from "./time";

/** How far ahead an open-ended repeat is checked for overlaps. */
export const OPEN_ENDED_HORIZON_DAYS = 365;

export function occursOn(series: Series, date: string): boolean {
  if (date < series.startDate) return false;
  if (series.tillDate && date > series.tillDate) return false;
  const d = fromISODate(date);
  const start = fromISODate(series.startDate);
  switch (series.freq) {
    case "daily":
      return true;
    case "weekdays": {
      const day = d.getDay();
      return day >= 1 && day <= 5;
    }
    case "weekly":
      return d.getDay() === start.getDay();
    case "monthly":
      return d.getDate() === start.getDate();
  }
}

/** Every date the series falls on, up to its Till date or the horizon for open-ended repeats. */
export function occurrenceDates(series: Series, horizonDays = OPEN_ENDED_HORIZON_DAYS): string[] {
  const last = series.tillDate ?? addDays(series.startDate, horizonDays);
  const out: string[] = [];
  for (let d = series.startDate; d <= last; d = addDays(d, 1)) {
    if (occursOn(series, d)) out.push(d);
  }
  return out;
}

export function isException(exceptions: Exception[], seriesId: string, date: string): boolean {
  return exceptions.some((e) => e.seriesId === seriesId && e.date === date);
}

/** Series that should have an occurrence on `date` but don't yet. */
export function missingOccurrences(
  series: Series[],
  tasks: Task[],
  exceptions: Exception[],
  date: string,
): Series[] {
  return series.filter(
    (s) =>
      occursOn(s, date) &&
      !isException(exceptions, s.id, date) &&
      !tasks.some((t) => t.seriesId === s.id && t.date === date),
  );
}

/**
 * Every time window booked on `date`: real tasks plus repeat occurrences that
 * haven't been materialised yet. Used for overlap checks.
 */
export function windowsForDate(
  tasks: Task[],
  series: Series[],
  exceptions: Exception[],
  date: string,
  exclude: { taskId?: string; seriesId?: string } = {},
): Window[] {
  const real: Window[] = tasks
    .filter((t) => t.date === date && t.id !== exclude.taskId)
    .filter((t) => !(exclude.seriesId && t.seriesId === exclude.seriesId))
    .map((t) => ({ id: t.id, title: t.title, startMin: t.startMin, endMin: t.endMin }));
  const virtual: Window[] = missingOccurrences(series, tasks, exceptions, date)
    .filter((s) => s.id !== exclude.seriesId)
    .map((s) => ({ id: `series:${s.id}`, title: s.title, startMin: s.startMin, endMin: s.endMin }));
  return [...real, ...virtual];
}
