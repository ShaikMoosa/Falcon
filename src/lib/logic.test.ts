import { describe, expect, it } from "vitest";
import {
  displayToISO,
  formatDuration,
  hmsToSec,
  isoToDisplay,
  minToTimelineLabel,
  secToHMS,
} from "./time";
import { dropSlot, findConflict, nextFreeStart, resizeLimits, timelineLabels } from "./schedule";
import { occurrenceDates, occursOn, windowsForDate } from "./recurrence";
import type { Series, Task } from "./types";

const task = (id: string, startMin: number, endMin: number, extra: Partial<Task> = {}): Task => ({
  id,
  date: "2026-11-04",
  title: id,
  startMin,
  endMin,
  estimateSec: null,
  timeSpentSec: 0,
  timerStartedAt: null,
  completed: false,
  expanded: false,
  seriesId: null,
  createdAt: 0,
  subtasks: [],
  ...extra,
});

describe("time formats", () => {
  it("round-trips the dd-mm-yyyy date format and rejects impossible dates", () => {
    expect(isoToDisplay("2026-11-04")).toBe("04-11-2026");
    expect(displayToISO("04-11-2026")).toBe("2026-11-04");
    expect(displayToISO("31-02-2026")).toBeNull();
    expect(displayToISO("4-11-2026")).toBeNull();
  });

  it("parses and prints hh:mm:ss", () => {
    expect(hmsToSec("01:00:00")).toBe(3600);
    expect(hmsToSec("17:00")).toBe(17 * 3600);
    expect(hmsToSec("10:61:00")).toBeNull();
    expect(secToHMS(1800)).toBe("00:30:00");
  });

  it("prints card durations like the design", () => {
    expect(formatDuration(1800)).toBe("30mins");
    expect(formatDuration(3600)).toBe("1hr");
    expect(formatDuration(4500)).toBe("1hr 15mins");
    expect(formatDuration(0)).toBe("0mins");
  });

  it("prints timeline labels like the design", () => {
    expect(minToTimelineLabel(60)).toBe("01 Am");
    expect(minToTimelineLabel(12 * 60)).toBe("12 Pm");
    expect(minToTimelineLabel(16 * 60 + 30)).toBe("04:30 Pm");
    expect(minToTimelineLabel(24 * 60)).toBe("12 Am");
  });
});

describe("overlaps", () => {
  const windows = [
    { id: "a", title: "a", startMin: 60, endMin: 300 },
    { id: "b", title: "b", startMin: 300, endMin: 720 },
  ];
  it("allows back-to-back tasks but blocks overlaps", () => {
    expect(findConflict(windows, 720, 960)).toBeNull();
    expect(findConflict(windows, 700, 800)?.id).toBe("b");
  });
  it("finds the next free slot", () => {
    expect(nextFreeStart(windows, 60, 60)).toBe(720);
    expect(nextFreeStart(windows, 0, 60)).toBe(0);
    expect(nextFreeStart([{ id: "x", title: "x", startMin: 0, endMin: 1440 }], 0, 15)).toBeNull();
  });
});

describe("timeline labels (MS-05)", () => {
  it("shares a label between back-to-back cards and shows both times across a gap", () => {
    const labels = timelineLabels([
      { key: "a", startMin: 60, endMin: 300, top: 0, bottom: 95 },
      { key: "b", startMin: 300, endMin: 720, top: 107, bottom: 282 },
      { key: "c", startMin: 780, endMin: 960, top: 294, bottom: 389 },
    ]);
    expect(labels.map((l) => l.text)).toEqual(["01 Am", "05 Am", "12 Pm", "01 Pm", "04 Pm"]);
    expect(labels[1].y).toBe(95);
    // "12 Pm" (y 282) and "01 Pm" (y 294) are only 12px apart, so they are pushed to 16px.
    expect(labels[3].y - labels[2].y).toBe(16);
  });
});

describe("drag drop slot (MS-09)", () => {
  const others = [
    { startMin: 300, endMin: 720 },
    { startMin: 720, endMin: 960 },
  ];
  const original = { startMin: 60, endMin: 300, index: 0 };
  it("starts when the card above ends and keeps the duration", () => {
    expect(dropSlot(others, 1, original)).toEqual({ startMin: 720, endMin: 960 });
  });
  it("keeps its time when dropped back in place", () => {
    expect(dropSlot(others, 0, original)).toEqual({ startMin: 60, endMin: 300 });
  });
});

describe("resize limits (MS-10)", () => {
  const windows = [
    { id: "a", title: "a", startMin: 0, endMin: 60 },
    { id: "c", title: "c", startMin: 420, endMin: 720 },
  ];
  it("stops the bottom edge at the next task and the top edge at the previous one", () => {
    expect(resizeLimits(windows, { startMin: 60, endMin: 300 }, "end")).toEqual({ min: 75, max: 420 });
    expect(resizeLimits(windows, { startMin: 60, endMin: 300 }, "start")).toEqual({ min: 60, max: 285 });
  });
});

describe("repeats", () => {
  const series: Series = {
    id: "s",
    freq: "weekdays",
    startDate: "2026-11-02", // Monday
    tillDate: "2026-11-08",
    title: "Stand-up",
    startMin: 540,
    endMin: 555,
    estimateSec: null,
    subtaskTitles: [],
  };
  it("falls on weekdays only, up to the Till date", () => {
    expect(occurrenceDates(series)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(occursOn(series, "2026-11-07")).toBe(false);
  });
  it("counts not-yet-created occurrences when checking overlaps", () => {
    const windows = windowsForDate([task("t", 0, 60)], [series], [], "2026-11-04");
    expect(windows.map((w) => w.id)).toEqual(["t", "series:s"]);
    const skipped = windowsForDate([], [series], [{ seriesId: "s", date: "2026-11-04" }], "2026-11-04");
    expect(skipped).toEqual([]);
  });
});
