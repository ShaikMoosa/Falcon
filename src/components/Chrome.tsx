import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { dayTasks, useStore } from "../store";
import { addDays, isoToDisplay } from "../lib/time";
import logo from "../assets/logo.svg";

export function Header() {
  const date = useStore((s) => s.date);
  const { setDate, openAdd } = useStore.getState();
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="brand">
        <img src={logo} width={25} height={23} alt="" />
        Falcon
      </div>
      <div className="toolbar">
        <button className="btn btn-secondary btn-icon" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <button className="btn btn-secondary btn-date" aria-label="Pick a date" onClick={() => picker.current?.showPicker()}>
          {isoToDisplay(date)}
          <CalendarDays size={16} strokeWidth={1.6} />
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="hidden-picker"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </button>
        <button className="btn btn-secondary btn-icon" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight size={16} strokeWidth={2} />
        </button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={openAdd}>
          Add Task
        </button>
      </div>
    </>
  );
}

export function ProgressBar() {
  const date = useStore((s) => s.date);
  const tasks = useStore((s) => s.tasks);
  const day = dayTasks(tasks, date);
  const pct = day.length ? Math.round((day.filter((t) => t.completed).length / day.length) * 100) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Tasks completed today"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      {day.length > 0 && (
        <div className={`progress-fill${pct === 0 ? " zero" : ""}`} style={{ width: `${pct}%` }}>
          <span className="progress-pill">{pct}%</span>
        </div>
      )}
    </div>
  );
}

export function ScopeDialog() {
  const prompt = useStore((s) => s.scopePrompt);
  if (!prompt) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && prompt.resolve(null)}>
      <div className="dialog" role="dialog" aria-modal aria-label={prompt.title} onKeyDown={(e) => e.key === "Escape" && prompt.resolve(null)}>
        <h3>{prompt.title}</h3>
        <button className="btn btn-secondary btn-lg" autoFocus onClick={() => prompt.resolve("one")}>
          This task only
        </button>
        <button className="btn btn-secondary btn-lg" onClick={() => prompt.resolve("future")}>
          This and future tasks
        </button>
        <button className="btn btn-lg" onClick={() => prompt.resolve(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ToastHost() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`toast${toast.tone === "error" ? " error" : ""}`} role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.actions.map((a) => (
        <button key={a.label} onClick={a.run}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
