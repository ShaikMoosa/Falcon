import type { Exception, Series, Snapshot, Task } from "../lib/types";

export interface Repo {
  load(): Promise<Snapshot>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  saveSeries(series: Series): Promise<void>;
  deleteSeries(id: string): Promise<void>;
  addException(e: Exception): Promise<void>;
}

type Row = Record<string, unknown>;

/** SQLite under the app data folder (%APPDATA%\com.falcon.todo\falcon.db). */
class SqlRepo implements Repo {
  private db: Promise<import("@tauri-apps/plugin-sql").default>;

  constructor() {
    this.db = import("@tauri-apps/plugin-sql").then((m) => m.default.load("sqlite:falcon.db"));
  }

  async load(): Promise<Snapshot> {
    const db = await this.db;
    const [taskRows, subRows, seriesRows, excRows] = await Promise.all([
      db.select<Row[]>("SELECT * FROM tasks"),
      db.select<Row[]>("SELECT * FROM subtasks ORDER BY position"),
      db.select<Row[]>("SELECT * FROM series"),
      db.select<Row[]>("SELECT * FROM series_exceptions"),
    ]);
    const tasks: Task[] = taskRows.map((r) => ({
      id: String(r.id),
      date: String(r.date),
      title: String(r.title),
      startMin: Number(r.start_min),
      endMin: Number(r.end_min),
      estimateSec: r.estimate_sec === null ? null : Number(r.estimate_sec),
      timeSpentSec: Number(r.time_spent_sec),
      timerStartedAt: r.timer_started_at === null ? null : Number(r.timer_started_at),
      completed: Number(r.completed) === 1,
      expanded: Number(r.expanded) === 1,
      seriesId: r.series_id === null ? null : String(r.series_id),
      createdAt: Number(r.created_at),
      subtasks: subRows
        .filter((s) => s.task_id === r.id)
        .map((s) => ({ id: String(s.id), title: String(s.title), completed: Number(s.completed) === 1 })),
    }));
    const series: Series[] = seriesRows.map((r) => ({
      id: String(r.id),
      freq: r.freq as Series["freq"],
      startDate: String(r.start_date),
      tillDate: r.till_date === null ? null : String(r.till_date),
      title: String(r.title),
      startMin: Number(r.start_min),
      endMin: Number(r.end_min),
      estimateSec: r.estimate_sec === null ? null : Number(r.estimate_sec),
      subtaskTitles: JSON.parse(String(r.subtask_titles)),
    }));
    const exceptions: Exception[] = excRows.map((r) => ({ seriesId: String(r.series_id), date: String(r.date) }));
    return { tasks, series, exceptions };
  }

  async saveTask(t: Task): Promise<void> {
    const db = await this.db;
    await db.execute(
      `INSERT OR REPLACE INTO tasks
        (id, date, title, start_min, end_min, estimate_sec, time_spent_sec, timer_started_at, completed, expanded, series_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [t.id, t.date, t.title, t.startMin, t.endMin, t.estimateSec, t.timeSpentSec, t.timerStartedAt,
        t.completed ? 1 : 0, t.expanded ? 1 : 0, t.seriesId, t.createdAt],
    );
    await db.execute("DELETE FROM subtasks WHERE task_id = $1", [t.id]);
    for (const [i, s] of t.subtasks.entries()) {
      await db.execute(
        "INSERT INTO subtasks (id, task_id, title, completed, position) VALUES ($1, $2, $3, $4, $5)",
        [s.id, t.id, s.title, s.completed ? 1 : 0, i],
      );
    }
  }

  async deleteTask(id: string): Promise<void> {
    const db = await this.db;
    await db.execute("DELETE FROM subtasks WHERE task_id = $1", [id]);
    await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
  }

  async saveSeries(s: Series): Promise<void> {
    const db = await this.db;
    await db.execute(
      `INSERT OR REPLACE INTO series
        (id, freq, start_date, till_date, title, start_min, end_min, estimate_sec, subtask_titles)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [s.id, s.freq, s.startDate, s.tillDate, s.title, s.startMin, s.endMin, s.estimateSec, JSON.stringify(s.subtaskTitles)],
    );
  }

  async deleteSeries(id: string): Promise<void> {
    const db = await this.db;
    await db.execute("DELETE FROM series WHERE id = $1", [id]);
    await db.execute("DELETE FROM series_exceptions WHERE series_id = $1", [id]);
  }

  async addException(e: Exception): Promise<void> {
    const db = await this.db;
    await db.execute("INSERT OR IGNORE INTO series_exceptions (series_id, date) VALUES ($1, $2)", [e.seriesId, e.date]);
  }
}

/** Browser fallback so the UI can run under plain `vite` for previews and tests. */
class LocalRepo implements Repo {
  private key = "falcon:v1";

  private read(): Snapshot {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) return JSON.parse(raw) as Snapshot;
    } catch {
      // Fall through to an empty snapshot.
    }
    return { tasks: [], series: [], exceptions: [] };
  }

  private write(update: (s: Snapshot) => void) {
    const snap = this.read();
    update(snap);
    try {
      localStorage.setItem(this.key, JSON.stringify(snap));
    } catch {
      // Storage unavailable: the session still works in memory.
    }
  }

  async load() {
    return this.read();
  }
  async saveTask(t: Task) {
    this.write((s) => {
      s.tasks = [...s.tasks.filter((x) => x.id !== t.id), t];
    });
  }
  async deleteTask(id: string) {
    this.write((s) => {
      s.tasks = s.tasks.filter((x) => x.id !== id);
    });
  }
  async saveSeries(series: Series) {
    this.write((s) => {
      s.series = [...s.series.filter((x) => x.id !== series.id), series];
    });
  }
  async deleteSeries(id: string) {
    this.write((s) => {
      s.series = s.series.filter((x) => x.id !== id);
      s.exceptions = s.exceptions.filter((e) => e.seriesId !== id);
    });
  }
  async addException(e: Exception) {
    this.write((s) => {
      if (!s.exceptions.some((x) => x.seriesId === e.seriesId && x.date === e.date)) s.exceptions.push(e);
    });
  }
}

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Writes go through one queue so they reach the database in the order they happened.
 * A failed write is reported but doesn't block later ones.
 */
export function createRepo(onError: (err: unknown) => void): Repo {
  const inner: Repo = isTauri ? new SqlRepo() : new LocalRepo();
  let queue: Promise<void> = Promise.resolve();
  const enqueue =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    (...args: A) => {
      queue = queue.then(() => fn(...args)).catch(onError);
      return queue;
    };
  return {
    load: () => inner.load(),
    saveTask: enqueue((t: Task) => inner.saveTask(t)),
    deleteTask: enqueue((id: string) => inner.deleteTask(id)),
    saveSeries: enqueue((s: Series) => inner.saveSeries(s)),
    deleteSeries: enqueue((id: string) => inner.deleteSeries(id)),
    addException: enqueue((e: Exception) => inner.addException(e)),
  };
}
