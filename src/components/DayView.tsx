import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MoonStar, Sun } from "lucide-react";
import { dayTasks, useStore } from "../store";
import type { Task, Window } from "../lib/types";
import { windowsForDate } from "../lib/recurrence";
import {
  SNAP_MIN,
  dropSlot,
  findConflict,
  resizeLimits,
  slotInDay,
  timelineLabels,
  type Placed,
  type Slot,
  type TimelineLabel,
} from "../lib/schedule";
import { minToClock } from "../lib/time";
import { TaskCard } from "./TaskCard";
import emptyArt from "../assets/empty-state.png";

const GAP = 12;
/** Pointer travel for one 15-minute step while stretching a card. */
const PX_PER_STEP = 10;
const DRAG_THRESHOLD = 4;

interface Drag {
  kind: "drag";
  id: string;
  pointerOffset: number;
  height: number;
  others: Task[];
  heights: number[];
  originalIndex: number;
  cardTop: number;
  index: number;
  slot: Slot;
  ok: boolean;
  conflict: Window | null;
}

interface Resize {
  kind: "resize";
  id: string;
  edge: "start" | "end";
  startY: number;
  orig: Slot;
  limits: { min: number; max: number };
  value: number;
  blocked: boolean;
}

type Interaction = Drag | Resize;

interface Pending {
  id: string;
  x: number;
  y: number;
  offset: number;
  height: number;
}

const blockedText = (w: Window | null) =>
  w ? `Overlaps ${minToClock(w.startMin)} – ${minToClock(w.endMin)} task` : "Outside the day";

export function DayView() {
  const date = useStore((s) => s.date);
  const tasks = useStore((s) => s.tasks);
  const day = dayTasks(tasks, date);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const pending = useRef<Pending | null>(null);
  const [inter, setInter] = useState<Interaction | null>(null);
  const interRef = useRef<Interaction | null>(null);
  interRef.current = inter;

  const [layout, setLayout] = useState<{ listTop: number; items: Placed[]; labels: TimelineLabel[] }>({
    listTop: 0,
    items: [],
    labels: [],
  });
  const [, bump] = useState(0);

  /** Booked windows on this day, ignoring one task (the one being moved). */
  const othersWindows = useCallback(
    (taskId: string) => {
      const s = useStore.getState();
      return windowsForDate(s.tasks, s.series, s.exceptions, date, { taskId });
    },
    [date],
  );

  // ---------- pointer handling ----------

  const onMove = useCallback(
    (e: globalThis.PointerEvent) => {
      const p = pending.current;
      let it = interRef.current;
      if (p && !it) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
        const all = dayTasks(useStore.getState().tasks, date);
        const self = all.find((t) => t.id === p.id);
        if (!self) return;
        const others = all.filter((t) => t.id !== p.id);
        it = {
          kind: "drag",
          id: p.id,
          pointerOffset: p.offset,
          height: p.height,
          others,
          heights: others.map((t) => cardRefs.current.get(t.id)?.offsetHeight ?? 95),
          originalIndex: all.indexOf(self),
          cardTop: 0,
          index: all.indexOf(self),
          slot: { startMin: self.startMin, endMin: self.endMin },
          ok: true,
          conflict: null,
        };
        useStore.getState().setMenu(null);
      }
      if (!it) return;

      if (it.kind === "drag") {
        const listRect = listRef.current!.getBoundingClientRect();
        const cardTop = e.clientY - listRect.top - it.pointerOffset;
        // Slot positions with the dragged card taken out and the rest closed up.
        let acc = 0;
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i <= it.others.length; i++) {
          const dist = Math.abs(cardTop - acc);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
          if (i < it.others.length) acc += it.heights[i] + GAP;
        }
        const self = useStore.getState().tasks.find((t) => t.id === it!.id)!;
        const slot = dropSlot(it.others, best, { startMin: self.startMin, endMin: self.endMin, index: it.originalIndex });
        const conflict = slotInDay(slot) ? findConflict(othersWindows(it.id), slot.startMin, slot.endMin) : null;
        const ok = slotInDay(slot) && !conflict;
        interRef.current = { ...it, cardTop, index: best, slot, ok, conflict };
        setInter(interRef.current);

        const sr = scrollRef.current!.getBoundingClientRect();
        if (e.clientY < sr.top + 40) scrollRef.current!.scrollBy(0, -12);
        else if (e.clientY > sr.bottom - 40) scrollRef.current!.scrollBy(0, 12);
      } else {
        const steps = Math.round((e.clientY - it.startY) / PX_PER_STEP);
        const base = it.edge === "end" ? it.orig.endMin : it.orig.startMin;
        const raw = base + steps * SNAP_MIN;
        const value = Math.min(it.limits.max, Math.max(it.limits.min, raw));
        const blocked = it.edge === "end" ? raw > it.limits.max : raw < it.limits.min;
        interRef.current = { ...it, value, blocked };
        setInter(interRef.current);
      }
    },
    [date, othersWindows],
  );

  const stopListening = useRef<() => void>(() => {});

  const onUp = useCallback(() => {
    stopListening.current();
    pending.current = null;
    const it = interRef.current;
    setInter(null);
    if (!it) return;
    const { setWindow } = useStore.getState();
    if (it.kind === "drag") {
      if (it.ok) setWindow(it.id, it.slot.startMin, it.slot.endMin, "Moved to");
    } else {
      const start = it.edge === "start" ? it.value : it.orig.startMin;
      const end = it.edge === "end" ? it.value : it.orig.endMin;
      setWindow(it.id, start, end, "Time changed to");
    }
  }, []);

  const listen = useCallback(() => {
    const cancel = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        stopListening.current();
        pending.current = null;
        setInter(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", cancel);
    stopListening.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", cancel);
    };
  }, [onMove, onUp]);

  useEffect(() => () => stopListening.current(), []);

  const onBodyPointerDown = (task: Task) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || task.completed) return;
    if ((e.target as HTMLElement).closest("button, .menu, .handle")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pending.current = { id: task.id, x: e.clientX, y: e.clientY, offset: e.clientY - rect.top, height: rect.height };
    listen();
  };

  const onHandlePointerDown = (task: Task) => (e: PointerEvent<HTMLDivElement>, edge: "start" | "end") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const orig = { startMin: task.startMin, endMin: task.endMin };
    const next: Resize = {
      kind: "resize",
      id: task.id,
      edge,
      startY: e.clientY,
      orig,
      limits: resizeLimits(othersWindows(task.id), orig, edge),
      value: edge === "end" ? task.endMin : task.startMin,
      blocked: false,
    };
    // Set the ref now so a move arriving before the next render is not lost.
    interRef.current = next;
    setInter(next);
    useStore.getState().setMenu(null);
    listen();
  };

  // ---------- keyboard (X-04) ----------

  const onCardKey = (task: Task) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const s = useStore.getState();
    if (e.key === " ") {
      e.preventDefault();
      s.toggleComplete(task.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      s.openEdit(task.id);
    } else if (e.key === "Delete") {
      e.preventDefault();
      s.deleteTask(task.id);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.altKey && !task.completed) {
      e.preventDefault();
      const all = dayTasks(s.tasks, date);
      const idx = all.findIndex((t) => t.id === task.id);
      const others = all.filter((t) => t.id !== task.id);
      const target = Math.min(others.length, Math.max(0, idx + (e.key === "ArrowUp" ? -1 : 1)));
      if (target === idx) return;
      const slot = dropSlot(others, target, { startMin: task.startMin, endMin: task.endMin, index: idx });
      const conflict = slotInDay(slot) ? findConflict(othersWindows(task.id), slot.startMin, slot.endMin) : null;
      if (slotInDay(slot) && !conflict) s.setWindow(task.id, slot.startMin, slot.endMin, "Moved to");
      else s.showToast(`Can't move: ${blockedText(conflict).toLowerCase()}`, [], "error");
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.shiftKey && !task.completed) {
      e.preventDefault();
      const limits = resizeLimits(othersWindows(task.id), task, "end");
      const end = task.endMin + (e.key === "ArrowUp" ? -SNAP_MIN : SNAP_MIN);
      if (end >= limits.min && end <= limits.max) s.setWindow(task.id, task.startMin, end, "Time changed to");
      else s.showToast("Can't stretch: that would overlap another task or leave the day", [], "error");
    }
  };

  // ---------- what to render ----------

  type Item =
    | { kind: "card"; task: Task; startMin: number; endMin: number; preview?: Placed["preview"] }
    | { kind: "slot"; key: string; height: number; startMin: number; endMin: number; ok: boolean };

  let items: Item[];
  let lifted: Task | undefined;
  if (inter?.kind === "drag") {
    lifted = day.find((t) => t.id === inter.id);
    items = inter.others.map((t) => ({ kind: "card", task: t, startMin: t.startMin, endMin: t.endMin }) as Item);
    items.splice(inter.index, 0, {
      kind: "slot",
      key: `slot:${inter.id}`,
      height: inter.height,
      startMin: inter.slot.startMin,
      endMin: inter.slot.endMin,
      ok: inter.ok,
    });
  } else {
    items = day.map((t) => {
      if (inter?.kind === "resize" && inter.id === t.id) {
        const startMin = inter.edge === "start" ? inter.value : t.startMin;
        const endMin = inter.edge === "end" ? inter.value : t.endMin;
        return {
          kind: "card",
          task: t,
          startMin,
          endMin,
          preview: { start: inter.edge === "start", end: inter.edge === "end", tone: inter.blocked ? "blocked" : "ok" },
        };
      }
      return { kind: "card", task: t, startMin: t.startMin, endMin: t.endMin };
    });
  }

  const resizeStyle = (t: Task) => {
    if (inter?.kind !== "resize" || inter.id !== t.id) return undefined;
    const base = cardRefs.current.get(t.id)?.dataset.base ? Number(cardRefs.current.get(t.id)!.dataset.base) : undefined;
    if (base === undefined) return undefined;
    const steps =
      inter.edge === "end" ? (inter.value - inter.orig.endMin) / SNAP_MIN : (inter.orig.startMin - inter.value) / SNAP_MIN;
    const grow = steps * PX_PER_STEP;
    const height = Math.max(56, base + grow);
    return inter.edge === "end" ? { height } : { height, marginTop: base - height };
  };

  // Remember each card's natural height so stretching starts from it.
  useLayoutEffect(() => {
    if (inter?.kind === "resize") return;
    for (const el of cardRefs.current.values()) el.dataset.base = String(el.offsetHeight);
  });

  // Measure where each card sits so timeline labels line up with card edges (MS-05).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const placed: Placed[] = [];
    for (const it of items) {
      const key = it.kind === "card" ? it.task.id : it.key;
      const el = it.kind === "card" ? cardRefs.current.get(key) : (list.querySelector(`[data-slot="${key}"]`) as HTMLDivElement | null);
      if (!el) continue;
      placed.push({
        key,
        startMin: it.startMin,
        endMin: it.endMin,
        top: el.offsetTop,
        bottom: el.offsetTop + el.offsetHeight,
        preview:
          it.kind === "slot" ? { start: true, end: true, tone: it.ok ? "ok" : "blocked" } : it.preview,
      });
    }
    const next = { listTop: list.offsetTop, items: placed, labels: timelineLabels(placed) };
    if (JSON.stringify(next) !== JSON.stringify(layout)) setLayout(next);
  });

  useEffect(() => {
    const onResize = () => bump((n) => n + 1);
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (listRef.current) ro.observe(listRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, []);

  const first = layout.items[0];
  const last = layout.items[layout.items.length - 1];
  const empty = day.length === 0;
  const barTop = empty || !first ? 0 : layout.listTop + first.top - 32;
  const barStyle =
    empty || !first ? { top: 0, bottom: 39 } : { top: barTop, height: last.bottom - first.top + 59 };

  let tooltip: { y: number; text: string; ok: boolean; offsetX: number } | null = null;
  if (inter?.kind === "drag") {
    tooltip = {
      y: inter.cardTop - 12,
      text: inter.ok ? `${minToClock(inter.slot.startMin)} – ${minToClock(inter.slot.endMin)}` : blockedText(inter.conflict),
      ok: inter.ok,
      offsetX: 14,
    };
  } else if (inter?.kind === "resize") {
    const item = layout.items.find((p) => p.key === inter.id);
    if (item) {
      const start = inter.edge === "start" ? inter.value : inter.orig.startMin;
      const end = inter.edge === "end" ? inter.value : inter.orig.endMin;
      const w = findConflict(othersWindows(inter.id), inter.edge === "end" ? end : start - 1, inter.edge === "end" ? end + 1 : start);
      tooltip = {
        y: (inter.edge === "end" ? item.bottom : item.top) - 12,
        text: inter.blocked ? blockedText(w) : `${minToClock(start)} – ${minToClock(end)}`,
        ok: !inter.blocked,
        offsetX: 60,
      };
    }
  }

  return (
    <div className="scroll" ref={scrollRef}>
      <div className="day">
        <div className="timeline" aria-hidden>
          <div className="timeline-bar" style={barStyle}>
            <span className="timeline-cap top">
              <Sun size={16} strokeWidth={1.5} />
            </span>
            <span className="timeline-cap bottom">
              <MoonStar size={16} strokeWidth={1.5} />
            </span>
          </div>
          {layout.labels.map((l) => (
            <span key={l.key} className={`tl-label ${l.tone === "normal" ? "" : l.tone}`} style={{ top: layout.listTop + l.y }}>
              {l.text}
            </span>
          ))}
        </div>

        {empty ? (
          <div className="empty">
            <img src={emptyArt} alt="" />
            <h2>No tasks yet</h2>
            <p>Create your first task to get started and keep your work organized.</p>
            <button className="btn btn-primary" onClick={() => useStore.getState().openAdd()}>
              Add Task
            </button>
          </div>
        ) : (
          <div className="list" ref={listRef} role="list" aria-label="Tasks for the day">
            {items.map((it) =>
              it.kind === "slot" ? (
                <div
                  key={it.key}
                  data-slot={it.key}
                  className={`slot${it.ok ? "" : " blocked"}`}
                  style={{ height: it.height }}
                />
              ) : (
                <TaskCard
                  key={it.task.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(it.task.id, el);
                    else cardRefs.current.delete(it.task.id);
                  }}
                  task={it.task}
                  className={
                    inter?.kind === "resize" && inter.id === it.task.id ? `resizing${inter.blocked ? " blocked" : ""}` : ""
                  }
                  activeEdge={inter?.kind === "resize" && inter.id === it.task.id ? inter.edge : undefined}
                  style={resizeStyle(it.task)}
                  onBodyPointerDown={onBodyPointerDown(it.task)}
                  onHandlePointerDown={onHandlePointerDown(it.task)}
                  onKeyDown={onCardKey(it.task)}
                />
              ),
            )}
            {lifted && inter?.kind === "drag" && (
              <TaskCard
                task={lifted}
                className={`lifted${inter.ok ? "" : " blocked"}`}
                style={{ top: inter.cardTop, height: inter.height }}
              />
            )}
            {tooltip && (
              <div
                className={`tooltip${tooltip.ok ? "" : " blocked"}`}
                style={{ top: tooltip.y, left: `calc(50% + ${tooltip.offsetX}px)`, transform: "translateX(-50%)" }}
              >
                {tooltip.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
