import type { Window } from "./types";
import { DAY_MIN, minToTimelineLabel } from "./time";

export const SNAP_MIN = 15;
export const MIN_TASK_MIN = 15;

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** The first window that overlaps [start, end), or null. Back-to-back is not an overlap. */
export function findConflict(windows: Window[], start: number, end: number): Window | null {
  return windows.find((w) => overlaps(start, end, w.startMin, w.endMin)) ?? null;
}

/**
 * Earliest free start at or after `from` (stepping by 15 minutes) that fits `duration`
 * without overlapping anything. Returns null when the rest of the day is full.
 */
export function nextFreeStart(windows: Window[], from: number, duration: number): number | null {
  for (let s = from; s + duration <= DAY_MIN; s += SNAP_MIN) {
    if (!findConflict(windows, s, s + duration)) return s;
  }
  return null;
}

/** Next full hour after `nowMin`, used as the default start for today. */
export function nextFullHour(nowMin: number): number {
  return Math.min(DAY_MIN - 60, (Math.floor(nowMin / 60) + 1) * 60);
}

export interface Placed {
  key: string;
  startMin: number;
  endMin: number;
  /** Pixel offsets of the card's top and bottom edges inside the list. */
  top: number;
  bottom: number;
  /** Which edge labels to draw in the preview colour while dragging or resizing. */
  preview?: { start?: boolean; end?: boolean; tone: "ok" | "blocked" };
}

export interface TimelineLabel {
  key: string;
  y: number;
  text: string;
  tone: "normal" | "ok" | "blocked";
}

/**
 * Timeline labels are the start and end times of the cards beside them (MS-05):
 * the start label sits on a card's top edge and the end label on its bottom edge.
 * When a card starts exactly when the one above ends, both share one label.
 */
export function timelineLabels(items: Placed[]): TimelineLabel[] {
  const labels: TimelineLabel[] = [];
  items.forEach((item, i) => {
    const prev = items[i - 1];
    const toneOf = (edge: "start" | "end") =>
      item.preview && item.preview[edge] ? item.preview.tone : ("normal" as const);
    if (!prev || prev.endMin !== item.startMin) {
      labels.push({ key: `${item.key}:start`, y: item.top, text: minToTimelineLabel(item.startMin), tone: toneOf("start") });
    } else if (toneOf("start") !== "normal") {
      // Shared label: the previewed edge wins the colour.
      labels[labels.length - 1].tone = toneOf("start");
    }
    labels.push({ key: `${item.key}:end`, y: item.bottom, text: minToTimelineLabel(item.endMin), tone: toneOf("end") });
  });
  return spreadLabels(labels);
}

/** Minimum distance between two label centres so 10px text never overlaps. */
export const LABEL_SPACING = 16;

/** Pushes neighbouring labels apart (e.g. a short gap between two cards) while keeping their order. */
function spreadLabels(labels: TimelineLabel[]): TimelineLabel[] {
  const out = labels.map((l) => ({ ...l }));
  for (let i = 1; i < out.length; i++) {
    const short = LABEL_SPACING - (out[i].y - out[i - 1].y);
    if (short > 0) {
      out[i - 1].y -= short / 2;
      out[i].y += short / 2;
    }
  }
  return out;
}

export interface Slot {
  startMin: number;
  endMin: number;
}

/**
 * Where a dragged task lands when dropped at `index` among the other cards (MS-09):
 * after a card it starts when that card ends; at the top it ends when the first card starts.
 * Dropping back into its own slot keeps its time.
 */
export function dropSlot(
  others: Slot[],
  index: number,
  original: Slot & { index: number },
): Slot {
  const duration = original.endMin - original.startMin;
  if (index === original.index) return { startMin: original.startMin, endMin: original.endMin };
  if (index > 0) {
    const start = others[index - 1].endMin;
    return { startMin: start, endMin: start + duration };
  }
  if (others.length > 0) {
    const end = others[0].startMin;
    return { startMin: end - duration, endMin: end };
  }
  return { startMin: original.startMin, endMin: original.endMin };
}

export function slotInDay(slot: Slot): boolean {
  return slot.startMin >= 0 && slot.endMin <= DAY_MIN && slot.endMin > slot.startMin;
}

/**
 * Limits for stretching one edge of a task (MS-10). Returns the furthest minute
 * the edge may reach in each direction without overlapping or leaving the day.
 */
export function resizeLimits(
  windows: Window[],
  task: Slot,
  edge: "start" | "end",
): { min: number; max: number } {
  if (edge === "end") {
    const next = windows.filter((w) => w.startMin >= task.endMin).map((w) => w.startMin);
    return { min: task.startMin + MIN_TASK_MIN, max: Math.min(DAY_MIN, ...next) };
  }
  const prev = windows.filter((w) => w.endMin <= task.startMin).map((w) => w.endMin);
  return { min: Math.max(0, ...prev), max: task.endMin - MIN_TASK_MIN };
}

export const snap = (min: number) => Math.round(min / SNAP_MIN) * SNAP_MIN;
