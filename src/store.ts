import { create } from "zustand";
import type { Freq, Series, Subtask, Task } from "./lib/types";
import { createRepo } from "./data/repo";
import { addDays, endOfDayMs, liveSeconds, minToClock, todayISO } from "./lib/time";
import { missingOccurrences, occurrenceDates, windowsForDate } from "./lib/recurrence";
import { findConflict, nextFreeStart, nextFullHour } from "./lib/schedule";

const uid = () => crypto.randomUUID();

export interface TaskForm {
  title: string;
  date: string;
  estimateSec: number | null;
  startMin: number;
  endMin: number;
  subtasks: Subtask[];
  repeat: boolean;
  freq: Freq;
  tillDate: string | null;
  /** Edit only. */
  timeSpentSec?: number;
}

export type Scope = "one" | "future";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: "normal" | "error";
  actions: ToastAction[];
}

type Modal = { mode: "add" } | { mode: "edit"; taskId: string } | null;

interface ScopePrompt {
  title: string;
  resolve: (scope: Scope | null) => void;
}

interface State {
  ready: boolean;
  date: string;
  tasks: Task[];
  series: Series[];
  exceptions: { seriesId: string; date: string }[];
  now: number;
  modal: Modal;
  scopePrompt: ScopePrompt | null;
  toast: Toast | null;
  menuFor: string | null;

  init(): Promise<void>;
  setDate(date: string): void;
  tick(): void;
  openAdd(): void;
  openEdit(id: string): void;
  closeModal(): void;
  setMenu(id: string | null): void;
  showToast(message: string, actions?: ToastAction[], tone?: Toast["tone"]): void;
  dismissToast(): void;
  askScope(title: string): Promise<Scope | null>;

  conflictFor(date: string, startMin: number, endMin: number, exclude: { taskId?: string; seriesId?: string }): string | null;
  seriesConflict(form: TaskForm, exclude: { taskId?: string; seriesId?: string }): string | null;
  defaultWindow(date: string): { startMin: number; endMin: number };

  createTask(form: TaskForm): void;
  updateTask(id: string, form: TaskForm, scope: Scope): void;
  deleteTask(id: string): void;
  toggleComplete(id: string): void;
  toggleSubtask(taskId: string, subId: string): void;
  toggleExpanded(id: string): void;
  toggleTimer(id: string): void;
  setWindow(id: string, startMin: number, endMin: number, verb: "Moved to" | "Time changed to"): void;
}

const repo = createRepo((err) => {
  console.error(err);
  useStore.getState().showToast("Couldn't save the task. Try again.", [], "error");
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

function stopTimer(t: Task, at: number): Task {
  if (t.timerStartedAt === null) return t;
  return { ...t, timeSpentSec: liveSeconds(t.timeSpentSec, t.timerStartedAt, at), timerStartedAt: null };
}

function fromSeries(s: Series, date: string): Task {
  return {
    id: uid(),
    date,
    title: s.title,
    startMin: s.startMin,
    endMin: s.endMin,
    estimateSec: s.estimateSec,
    timeSpentSec: 0,
    timerStartedAt: null,
    completed: false,
    expanded: false,
    seriesId: s.id,
    createdAt: Date.now(),
    subtasks: s.subtaskTitles.map((title) => ({ id: uid(), title, completed: false })),
  };
}

const windowText = (w: { title: string; startMin: number; endMin: number }) =>
  `This time overlaps ‘${w.title}’ (${minToClock(w.startMin)} – ${minToClock(w.endMin)})`;

export const useStore = create<State>((set, get) => {
  /** Replace one task in state and persist it. */
  const put = (task: Task) => {
    set((s) => ({ tasks: s.tasks.some((t) => t.id === task.id) ? s.tasks.map((t) => (t.id === task.id ? task : t)) : [...s.tasks, task] }));
    void repo.saveTask(task);
  };
  const remove = (id: string) => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    void repo.deleteTask(id);
  };
  const byId = (id: string) => get().tasks.find((t) => t.id === id);

  /** Create any repeat occurrences that fall on `date` (MS-01). */
  const materialise = (date: string) => {
    const { series, tasks, exceptions } = get();
    for (const s of missingOccurrences(series, tasks, exceptions, date)) put(fromSeries(s, date));
  };

  /** A running timer pauses itself at the end of its task's day. */
  const autoPause = () => {
    const now = Date.now();
    for (const t of get().tasks) {
      if (t.timerStartedAt !== null && now >= endOfDayMs(t.date)) put(stopTimer(t, endOfDayMs(t.date)));
    }
  };

  return {
    ready: false,
    date: todayISO(),
    tasks: [],
    series: [],
    exceptions: [],
    now: Date.now(),
    modal: null,
    scopePrompt: null,
    toast: null,
    menuFor: null,

    async init() {
      const snap = await repo.load();
      set({ ...snap, ready: true, date: todayISO(), now: Date.now() });
      autoPause();
      materialise(todayISO());
    },

    setDate(date) {
      set({ date, menuFor: null });
      materialise(date);
    },

    tick() {
      set({ now: Date.now() });
      autoPause();
    },

    openAdd: () => set({ modal: { mode: "add" }, menuFor: null }),
    openEdit: (taskId) => set({ modal: { mode: "edit", taskId }, menuFor: null }),
    closeModal: () => set({ modal: null }),
    setMenu: (id) => set({ menuFor: id }),

    showToast(message, actions = [], tone = "normal") {
      clearTimeout(toastTimer);
      const toast = { id: ++toastSeq, message, actions, tone };
      set({ toast });
      toastTimer = setTimeout(() => {
        if (get().toast?.id === toast.id) set({ toast: null });
      }, 5000);
    },
    dismissToast: () => set({ toast: null }),

    askScope(title) {
      return new Promise((resolve) => {
        set({
          scopePrompt: {
            title,
            resolve: (scope) => {
              set({ scopePrompt: null });
              resolve(scope);
            },
          },
        });
      });
    },

    conflictFor(date, startMin, endMin, exclude) {
      const { tasks, series, exceptions } = get();
      const hit = findConflict(windowsForDate(tasks, series, exceptions, date, exclude), startMin, endMin);
      return hit ? windowText(hit) : null;
    },

    seriesConflict(form, exclude) {
      const probe: Series = {
        id: "probe",
        freq: form.freq,
        startDate: form.date,
        tillDate: form.tillDate,
        title: form.title,
        startMin: form.startMin,
        endMin: form.endMin,
        estimateSec: null,
        subtaskTitles: [],
      };
      for (const d of occurrenceDates(probe)) {
        const msg = get().conflictFor(d, form.startMin, form.endMin, exclude);
        if (msg) return d === form.date ? msg : `${msg} on ${d.split("-").reverse().join("-")}`;
      }
      return null;
    },

    defaultWindow(date) {
      const { tasks, series, exceptions } = get();
      const now = new Date();
      const from = date === todayISO() ? nextFullHour(now.getHours() * 60 + now.getMinutes()) : 9 * 60;
      const windows = windowsForDate(tasks, series, exceptions, date);
      const start = nextFreeStart(windows, from, 60) ?? nextFreeStart(windows, 0, 60) ?? from;
      return { startMin: start, endMin: Math.min(start + 60, 24 * 60) };
    },

    createTask(form) {
      let seriesId: string | null = null;
      if (form.repeat) {
        const s: Series = {
          id: uid(),
          freq: form.freq,
          startDate: form.date,
          tillDate: form.tillDate,
          title: form.title,
          startMin: form.startMin,
          endMin: form.endMin,
          estimateSec: form.estimateSec,
          subtaskTitles: form.subtasks.map((x) => x.title),
        };
        set((st) => ({ series: [...st.series, s] }));
        void repo.saveSeries(s);
        seriesId = s.id;
      }
      put({
        id: uid(),
        date: form.date,
        title: form.title,
        startMin: form.startMin,
        endMin: form.endMin,
        estimateSec: form.estimateSec,
        timeSpentSec: 0,
        timerStartedAt: null,
        completed: false,
        expanded: false,
        seriesId,
        createdAt: Date.now(),
        subtasks: form.subtasks,
      });
      set({ modal: null });
      materialise(get().date);
    },

    updateTask(id, form, scope) {
      const t = byId(id);
      if (!t) return;
      const timeSpentSec = form.timeSpentSec ?? t.timeSpentSec;
      const restarted = t.timerStartedAt !== null ? Date.now() : null;
      let next: Task = {
        ...t,
        title: form.title,
        date: form.date,
        startMin: form.startMin,
        endMin: form.endMin,
        estimateSec: form.estimateSec,
        subtasks: form.subtasks,
        // An edited Time Spent replaces the timer total; a running timer keeps going from here.
        timeSpentSec: form.timeSpentSec !== undefined ? timeSpentSec : liveSeconds(t.timeSpentSec, t.timerStartedAt, Date.now()),
        timerStartedAt: restarted,
      };

      const old = t.seriesId ? get().series.find((s) => s.id === t.seriesId) : undefined;
      const dropFutureOccurrences = (seriesId: string) => {
        for (const o of get().tasks) {
          if (o.seriesId === seriesId && o.date > t.date && !o.completed && o.timeSpentSec === 0 && o.timerStartedAt === null) remove(o.id);
        }
      };
      if (old && scope === "future" && !form.repeat) {
        // Repeat switched off: the series stops after this day and this task stands alone.
        if (t.date <= old.startDate) {
          set((st) => ({ series: st.series.filter((s) => s.id !== old.id) }));
          void repo.deleteSeries(old.id);
        } else {
          const ended = { ...old, tillDate: addDays(t.date, -1) };
          set((st) => ({ series: st.series.map((s) => (s.id === old.id ? ended : s)) }));
          void repo.saveSeries(ended);
        }
        dropFutureOccurrences(old.id);
        next = { ...next, seriesId: null };
      } else if (old && scope === "future") {
        const fields = {
          freq: form.freq,
          title: form.title,
          startMin: form.startMin,
          endMin: form.endMin,
          estimateSec: form.estimateSec,
          subtaskTitles: form.subtasks.map((x) => x.title),
          tillDate: form.tillDate,
        };
        let target: Series;
        if (t.date === old.startDate) {
          target = { ...old, ...fields };
        } else {
          const ended = { ...old, tillDate: addDays(t.date, -1) };
          set((st) => ({ series: st.series.map((s) => (s.id === old.id ? ended : s)) }));
          void repo.saveSeries(ended);
          target = { ...old, ...fields, id: uid(), startDate: t.date };
        }
        set((st) => ({ series: [...st.series.filter((s) => s.id !== target.id), target] }));
        void repo.saveSeries(target);
        // Untouched future occurrences are recreated from the updated repeat.
        dropFutureOccurrences(old.id);
        next = { ...next, seriesId: target.id };
      } else if (!old && form.repeat) {
        const s: Series = {
          id: uid(),
          freq: form.freq,
          startDate: form.date,
          tillDate: form.tillDate,
          title: form.title,
          startMin: form.startMin,
          endMin: form.endMin,
          estimateSec: form.estimateSec,
          subtaskTitles: form.subtasks.map((x) => x.title),
        };
        set((st) => ({ series: [...st.series, s] }));
        void repo.saveSeries(s);
        next = { ...next, seriesId: s.id };
      }
      put(next);
      set({ modal: null });
      materialise(get().date);
    },

    deleteTask(id) {
      const t = byId(id);
      if (!t) return;
      remove(id);
      if (t.seriesId) {
        const e = { seriesId: t.seriesId, date: t.date };
        set((s) => ({ exceptions: [...s.exceptions, e] }));
        void repo.addException(e);
      }
      const undo: ToastAction = {
        label: "Undo",
        run: () => {
          if (t.seriesId) {
            set((s) => ({ exceptions: s.exceptions.filter((e) => !(e.seriesId === t.seriesId && e.date === t.date)) }));
            // The exception row is harmless once the task exists again; materialise skips existing dates.
          }
          put(t);
          get().dismissToast();
        },
      };
      const actions = [undo];
      if (t.seriesId) {
        const sid = t.seriesId;
        actions.push({
          label: "Delete all future",
          run: () => {
            const s = get().series.find((x) => x.id === sid);
            for (const o of get().tasks) if (o.seriesId === sid && o.date >= t.date) remove(o.id);
            if (s) {
              if (t.date <= s.startDate) {
                set((st) => ({ series: st.series.filter((x) => x.id !== sid) }));
                void repo.deleteSeries(sid);
              } else {
                const ended = { ...s, tillDate: addDays(t.date, -1) };
                set((st) => ({ series: st.series.map((x) => (x.id === sid ? ended : x)) }));
                void repo.saveSeries(ended);
              }
            }
            get().showToast("Future tasks deleted");
          },
        });
      }
      set({ menuFor: null });
      get().showToast("Task deleted", actions);
    },

    toggleComplete(id) {
      const t = byId(id);
      if (!t) return;
      if (t.completed) {
        put({ ...t, completed: false });
      } else {
        put({ ...stopTimer(t, Date.now()), completed: true, subtasks: t.subtasks.map((s) => ({ ...s, completed: true })) });
      }
    },

    toggleSubtask(taskId, subId) {
      const t = byId(taskId);
      if (!t) return;
      const subtasks = t.subtasks.map((s) => (s.id === subId ? { ...s, completed: !s.completed } : s));
      const all = subtasks.length > 0 && subtasks.every((s) => s.completed);
      let next: Task = { ...t, subtasks, completed: all };
      if (all) next = stopTimer(next, Date.now());
      put(next);
    },

    toggleExpanded(id) {
      const t = byId(id);
      if (t) put({ ...t, expanded: !t.expanded });
    },

    toggleTimer(id) {
      const t = byId(id);
      if (!t || t.completed) return;
      const now = Date.now();
      if (t.timerStartedAt !== null) {
        put(stopTimer(t, now));
        return;
      }
      // Only one timer runs at a time.
      for (const other of get().tasks) if (other.timerStartedAt !== null) put(stopTimer(other, now));
      put({ ...byId(id)!, timerStartedAt: now });
      set({ now });
    },

    setWindow(id, startMin, endMin, verb) {
      const t = byId(id);
      if (!t || (t.startMin === startMin && t.endMin === endMin)) return;
      const before = { startMin: t.startMin, endMin: t.endMin };
      put({ ...t, startMin, endMin });
      get().showToast(`${verb} ${minToClock(startMin)} – ${minToClock(endMin)}`, [
        {
          label: "Undo",
          run: () => {
            const cur = byId(id);
            if (cur) put({ ...cur, ...before });
            get().dismissToast();
          },
        },
      ]);
    },
  };
});

export const dayTasks = (tasks: Task[], date: string) =>
  tasks.filter((t) => t.date === date).sort((a, b) => a.startMin - b.startMin || a.createdAt - b.createdAt);
