export const DAY_MIN = 24 * 60;

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a local Date. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** "2026-11-04" -> "04-11-2026" */
export function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** "04-11-2026" -> "2026-11-04", or null when not a real calendar date. */
export function displayToISO(text: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/** Seconds -> "hh:mm:ss" */
export function secToHMS(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "hh:mm:ss" (or "hh:mm") -> seconds, or null when malformed. Hours may reach 24 for end-of-day. */
export function hmsToSec(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (min > 59 || s > 59 || h > 24) return null;
  const total = h * 3600 + min * 60 + s;
  if (total > DAY_MIN * 60) return null;
  return total;
}

export const minToHMS = (min: number) => secToHMS(min * 60);

/** Clock text for a start/end field -> minutes (seconds are dropped). */
export function hmsToMin(text: string): number | null {
  const sec = hmsToSec(text);
  return sec === null ? null : Math.floor(sec / 60);
}

/** Minutes -> "12:00" (24-hour, used in tooltips and toasts; midnight at day end is "24:00"). */
export function minToClock(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Minutes -> timeline label in the design's style: "01 Am", "12 Pm", "04:30 Pm", "12 Am" for midnight. */
export function minToTimelineLabel(min: number): string {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h24 = Math.floor(m / 60);
  const mins = m % 60;
  const suffix = h24 < 12 ? "Am" : "Pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${pad(h12)}${mins ? `:${pad(mins)}` : ""} ${suffix}`;
}

/** Duration for card text: "30mins", "1hr", "1hr 15mins". */
export function formatDuration(sec: number): string {
  const totalMin = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}mins`;
  return m ? `${h}hr ${m}mins` : `${h}hr`;
}

/** End of a local day (next midnight) as epoch ms. */
export function endOfDayMs(iso: string): number {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Live time spent, including a running timer. */
export function liveSeconds(timeSpentSec: number, timerStartedAt: number | null, nowMs: number): number {
  if (timerStartedAt === null) return timeSpentSec;
  return timeSpentSec + Math.max(0, Math.floor((nowMs - timerStartedAt) / 1000));
}
