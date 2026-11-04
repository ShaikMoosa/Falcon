import { forwardRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Check, ChevronDown, ChevronUp, CirclePause, CirclePlay, EllipsisVertical } from "lucide-react";
import type { Task } from "../lib/types";
import { formatDuration, liveSeconds } from "../lib/time";
import { useStore } from "../store";

function Ring({ done, total }: { done: number; total: number }) {
  const r = 6.5;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="#d9d9d9" strokeWidth="1.5" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="#0044da"
        strokeWidth="1.5"
        strokeDasharray={`${c * frac} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

export interface CardInteraction {
  className?: string;
  style?: CSSProperties;
  /** Which resize handle is being dragged. */
  activeEdge?: "start" | "end";
  onBodyPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onHandlePointerDown?: (e: PointerEvent<HTMLDivElement>, edge: "start" | "end") => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

export const TaskCard = forwardRef<HTMLDivElement, { task: Task } & CardInteraction>(function TaskCard(
  { task, className = "", style, activeEdge, onBodyPointerDown, onHandlePointerDown, onKeyDown },
  ref,
) {
  const now = useStore((s) => s.now);
  const menuOpen = useStore((s) => s.menuFor === task.id);
  const { toggleComplete, toggleExpanded, toggleSubtask, toggleTimer, setMenu, openEdit, deleteTask } = useStore.getState();

  const subDone = task.subtasks.filter((s) => s.completed).length;
  const running = task.timerStartedAt !== null;
  const spent = liveSeconds(task.timeSpentSec, task.timerStartedAt, now);
  const over = task.estimateSec !== null && task.estimateSec > 0 && spent > task.estimateSec;
  const hasSubs = task.subtasks.length > 0;

  return (
    <div
      ref={ref}
      className={`card${task.completed ? " done" : ""} ${className}`}
      style={style}
      tabIndex={0}
      aria-label={`${task.title}${task.completed ? ", completed" : ""}`}
      onPointerDown={onBodyPointerDown}
      onKeyDown={onKeyDown}
    >
      {!task.completed && onHandlePointerDown && (
        <>
          <div
            className={`handle top${activeEdge === "start" ? " active" : ""}`}
            aria-hidden
            onPointerDown={(e) => onHandlePointerDown(e, "start")}
          />
          <div
            className={`handle bottom${activeEdge === "end" ? " active" : ""}`}
            aria-hidden
            onPointerDown={(e) => onHandlePointerDown(e, "end")}
          />
        </>
      )}

      <div className="row">
        <button
          className={`check${task.completed ? " on" : ""}`}
          role="checkbox"
          aria-checked={task.completed}
          aria-label={task.completed ? "Mark as not done" : "Mark as done"}
          onClick={() => toggleComplete(task.id)}
        >
          <Check size={12} strokeWidth={3} />
        </button>
        <span className="title">{task.title}</span>
        {hasSubs && (
          <>
            <button className="chev" aria-label={task.expanded ? "Hide subtasks" : "Show subtasks"} aria-expanded={task.expanded} onClick={() => toggleExpanded(task.id)}>
              {task.expanded ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
            </button>
            <span className="sub-progress">
              <Ring done={subDone} total={task.subtasks.length} />
              {subDone}/{task.subtasks.length} Subtasks
            </span>
          </>
        )}
        <button className="icon-btn" aria-label="Task menu" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenu(menuOpen ? null : task.id)}>
          <EllipsisVertical size={16} strokeWidth={1.6} />
        </button>
        <button
          className="icon-btn play"
          disabled={task.completed}
          aria-label={running ? "Pause timer" : "Start timer"}
          aria-pressed={running}
          onClick={() => toggleTimer(task.id)}
        >
          {running ? <CirclePause size={16} strokeWidth={1.6} /> : <CirclePlay size={16} strokeWidth={1.6} />}
        </button>
      </div>

      {hasSubs && task.expanded && (
        <>
          <div className="sub-label">Subtask</div>
          {task.subtasks.map((s) => (
            <div key={s.id} className={`subtask${s.completed ? " done" : ""}`}>
              <button
                className={`check${s.completed ? " on" : ""}`}
                role="checkbox"
                aria-checked={s.completed}
                aria-label={`${s.title}: ${s.completed ? "mark as not done" : "mark as done"}`}
                onClick={() => toggleSubtask(task.id, s.id)}
              >
                <Check size={12} strokeWidth={3} />
              </button>
              <span className="sub-title">{s.title}</span>
            </div>
          ))}
        </>
      )}

      <div className="meta">
        <span className="est">{task.estimateSec !== null ? `Est:${formatDuration(task.estimateSec)}` : ""}</span>
        <span className={`spent${running ? " running" : ""}${over ? " over" : ""}`} title="Time spent">
          {formatDuration(spent)}
        </span>
      </div>

      {menuOpen && (
        <div className="menu" role="menu" onPointerDown={(e) => e.stopPropagation()}>
          <button role="menuitem" onClick={() => openEdit(task.id)}>
            Edit
          </button>
          <button role="menuitem" className="danger" onClick={() => deleteTask(task.id)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
});
