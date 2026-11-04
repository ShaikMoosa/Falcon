import { useEffect } from "react";
import { useStore } from "./store";
import { Header, ProgressBar, ScopeDialog, ToastHost } from "./components/Chrome";
import { DayView } from "./components/DayView";
import { TaskModal } from "./components/TaskModal";
import { addDays, todayISO } from "./lib/time";
import "./App.css";

export default function App() {
  const ready = useStore((s) => s.ready);
  const modal = useStore((s) => s.modal);
  const running = useStore((s) => s.tasks.some((t) => t.timerStartedAt !== null));

  useEffect(() => {
    void useStore.getState().init();
  }, []);

  // Live timer display; a slow tick otherwise so day rollover and auto-pause still happen.
  useEffect(() => {
    const id = setInterval(() => useStore.getState().tick(), running ? 1000 : 30000);
    return () => clearInterval(id);
  }, [running]);

  // Global shortcuts (X-04) and closing the card menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.modal || s.scopePrompt) return;
      if (e.key === "Escape") s.setMenu(null);
      if (!e.ctrlKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        s.openAdd();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.setDate(addDays(s.date, -1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        s.setDate(addDays(s.date, 1));
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        s.setDate(todayISO());
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".menu") && !target.closest('[aria-label="Task menu"]')) useStore.getState().setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  if (!ready) return null;

  return (
    <div className="app">
      <div className="app-head">
        <Header />
        <ProgressBar />
      </div>
      <DayView />
      {modal && <TaskModal key={modal.mode === "edit" ? modal.taskId : "add"} />}
      <ScopeDialog />
      <ToastHost />
    </div>
  );
}
