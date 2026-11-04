export type Freq = "daily" | "weekdays" | "weekly" | "monthly";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  title: string;
  /** Minutes from midnight, 0..1440. */
  startMin: number;
  endMin: number;
  estimateSec: number | null;
  /** Time banked by the timer, excluding a run in progress. */
  timeSpentSec: number;
  /** Epoch ms when the running timer started, or null when paused. */
  timerStartedAt: number | null;
  completed: boolean;
  expanded: boolean;
  seriesId: string | null;
  createdAt: number;
  subtasks: Subtask[];
}

export interface Series {
  id: string;
  freq: Freq;
  startDate: string;
  tillDate: string | null;
  title: string;
  startMin: number;
  endMin: number;
  estimateSec: number | null;
  subtaskTitles: string[];
}

export interface Exception {
  seriesId: string;
  date: string;
}

export interface Snapshot {
  tasks: Task[];
  series: Series[];
  exceptions: Exception[];
}

/** A start–end window on one day, used for overlap checks. */
export interface Window {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
}
