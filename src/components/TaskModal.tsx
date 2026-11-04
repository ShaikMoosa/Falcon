import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useStore, type TaskForm } from "../store";
import type { Freq, Subtask } from "../lib/types";
import { DateField, TimeField } from "./Fields";
import { displayToISO, hmsToMin, hmsToSec, isoToDisplay, minToHMS, secToHMS } from "../lib/time";

const FREQS: { value: Freq; label: string }[] = [
  { value: "daily", label: "Every Day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Every Week" },
  { value: "monthly", label: "Every Month" },
];

type Errors = Partial<Record<"title" | "date" | "estimate" | "start" | "end" | "till" | "spent", string>>;

export function TaskModal() {
  const modal = useStore((s) => s.modal)!;
  const tasks = useStore((s) => s.tasks);
  const series = useStore((s) => s.series);
  const viewDate = useStore((s) => s.date);
  const { closeModal, createTask, updateTask, conflictFor, seriesConflict, defaultWindow, askScope } = useStore.getState();

  const editing = modal.mode === "edit" ? tasks.find((t) => t.id === modal.taskId) : undefined;
  const editingSeries = editing?.seriesId ? series.find((s) => s.id === editing.seriesId) : undefined;

  const initial = useMemo(() => {
    if (editing) {
      return {
        title: editing.title,
        date: isoToDisplay(editing.date),
        estimate: editing.estimateSec === null ? "" : secToHMS(editing.estimateSec),
        start: minToHMS(editing.startMin),
        end: minToHMS(editing.endMin),
        subtasks: editing.subtasks,
        repeat: !!editingSeries,
        freq: editingSeries?.freq ?? ("daily" as Freq),
        till: editingSeries?.tillDate ? isoToDisplay(editingSeries.tillDate) : "",
        spent: secToHMS(editing.timeSpentSec),
      };
    }
    const w = defaultWindow(viewDate);
    return {
      title: "",
      date: isoToDisplay(viewDate),
      estimate: "",
      start: minToHMS(w.startMin),
      end: minToHMS(w.endMin),
      subtasks: [] as Subtask[],
      repeat: false,
      freq: "daily" as Freq,
      till: "",
      spent: "",
    };
    // The form is seeded once when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [estimate, setEstimate] = useState(initial.estimate);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [subtasks, setSubtasks] = useState<Subtask[]>(initial.subtasks);
  const [draftSub, setDraftSub] = useState("");
  const [repeat, setRepeat] = useState(initial.repeat);
  const [freq, setFreq] = useState<Freq>(initial.freq);
  const [till, setTill] = useState(initial.till);
  const [spent, setSpent] = useState(initial.spent);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /** Overlap found on a later day of a repeat; set when Create/Update is pressed. */
  const [seriesClash, setSeriesClash] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => titleRef.current?.focus(), []);

  const dirty =
    title !== initial.title ||
    date !== initial.date ||
    estimate !== initial.estimate ||
    start !== initial.start ||
    end !== initial.end ||
    repeat !== initial.repeat ||
    till !== initial.till ||
    spent !== initial.spent ||
    draftSub.trim() !== "" ||
    JSON.stringify(subtasks) !== JSON.stringify(initial.subtasks);

  const requestClose = () => (dirty ? setConfirmDiscard(true) : closeModal());

  const isoDate = displayToISO(date);
  const errors: Errors = {};
  if (!title.trim()) errors.title = "Title is required";
  else if (title.trim().length > 120) errors.title = "Keep the title under 120 characters";
  if (!isoDate) errors.date = "Enter a valid date (dd-mm-yyyy)";
  if (estimate && hmsToSec(estimate) === null) errors.estimate = "Enter a duration as hh:mm:ss";
  const startMin = hmsToMin(start);
  const endMin = hmsToMin(end);
  if (startMin === null || startMin >= 24 * 60) errors.start = "Enter a time as hh:mm:ss";
  if (endMin === null) errors.end = "Enter a time as hh:mm:ss";
  else if (startMin !== null && endMin <= startMin) errors.end = "End time must be after start time";
  if (!errors.start && !errors.end && isoDate && startMin !== null && endMin !== null) {
    const overlap = conflictFor(isoDate, startMin, endMin, { taskId: editing?.id });
    if (overlap) errors.end = overlap;
  }
  const isoTill = till ? displayToISO(till) : null;
  if (repeat && till) {
    if (!isoTill) errors.till = "Enter a valid date (dd-mm-yyyy)";
    else if (isoDate && isoTill < isoDate) errors.till = "Till date must be on or after the task date";
  }
  if (editing && (spent === "" || hmsToSec(spent) === null)) errors.spent = "Enter a duration as hh:mm:ss";

  const show = (k: keyof Errors) => (submitted || touched[k]) && errors[k];
  const touch = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));
  const canSubmit = !!title.trim() && !!isoDate;

  const addSubtask = () => {
    const t = draftSub.trim();
    if (!t) return;
    setSubtasks((s) => [...s, { id: crypto.randomUUID(), title: t, completed: false }]);
    setDraftSub("");
  };

  const submit = async () => {
    setSubmitted(true);
    const pending = draftSub.trim() ? [...subtasks, { id: crypto.randomUUID(), title: draftSub.trim(), completed: false }] : subtasks;
    if (Object.keys(errors).length > 0) {
      const first = document.querySelector<HTMLInputElement>(".modal .input.invalid input, .modal [data-error] input");
      first?.focus();
      return;
    }
    const form: TaskForm = {
      title: title.trim(),
      date: isoDate!,
      estimateSec: estimate ? hmsToSec(estimate) : null,
      startMin: startMin!,
      endMin: endMin!,
      subtasks: pending.filter((s) => s.title.trim()),
      repeat,
      freq,
      tillDate: repeat ? isoTill : null,
      timeSpentSec: editing ? hmsToSec(spent)! : undefined,
    };
    if (!editing) {
      const clash = repeat ? seriesConflict(form, {}) : null;
      setSeriesClash(clash);
      if (!clash) createTask(form);
      return;
    }
    let scope: "one" | "future" = "one";
    if (editingSeries) {
      const picked = await askScope("Edit repeating task");
      if (!picked) return;
      scope = picked;
    }
    const clash =
      repeat && (scope === "future" || !editingSeries)
        ? seriesConflict(form, { taskId: editing.id, seriesId: editingSeries?.id })
        : null;
    setSeriesClash(clash);
    if (!clash) updateTask(editing.id, form, scope);
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal
        aria-labelledby="modal-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            requestClose();
          }
          if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <div className="modal-head">
          <h2 id="modal-title">{editing ? "Edit Task" : "Add Task"}</h2>
          <button className="close" aria-label="Close" onClick={requestClose}>
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div className="fields">
          <div className="field">
            <label htmlFor="f-title">Title</label>
            <div className={`input${show("title") ? " invalid" : ""}`}>
              <input
                id="f-title"
                ref={titleRef}
                value={title}
                maxLength={140}
                placeholder="Enter your task"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={touch("title")}
              />
            </div>
            {show("title") && <div className="error">{errors.title}</div>}
          </div>

          <div className="pair">
            <div className="field">
              <span className="label">Date</span>
              <DateField ariaLabel="Date" value={date} onChange={setDate} onBlur={touch("date")} invalid={!!show("date")} />
              {show("date") && <div className="error">{errors.date}</div>}
            </div>
            <div className="field">
              <span className="label">Estimated Time</span>
              <TimeField ariaLabel="Estimated time" value={estimate} onChange={setEstimate} onBlur={touch("estimate")} invalid={!!show("estimate")} />
              {show("estimate") && <div className="error">{errors.estimate}</div>}
            </div>
          </div>

          <div>
            <div className="pair">
              <div className="field">
                <span className="label">Start Time</span>
                <TimeField ariaLabel="Start time" value={start} onChange={setStart} onBlur={touch("start")} invalid={!!show("start")} />
              </div>
              <div className="field">
                <span className="label">End Time</span>
                <TimeField ariaLabel="End time" value={end} onChange={setEnd} onBlur={touch("end")} invalid={!!(show("end") || seriesClash)} />
              </div>
            </div>
            {show("start") && <div className="error">{errors.start}</div>}
            {show("end") && <div className="error">{errors.end}</div>}
            {!errors.end && seriesClash && <div className="error">{seriesClash}</div>}
          </div>

          <div className="field">
            <span className="label">Subtask</span>
            <div className="subtasks">
              {subtasks.map((s, i) => (
                <div className="input" key={s.id}>
                  <input
                    aria-label={`Subtask ${i + 1}`}
                    value={s.title}
                    onChange={(e) => setSubtasks((all) => all.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
                  />
                  <button type="button" className="icon" aria-label={`Remove subtask ${i + 1}`} onClick={() => setSubtasks((all) => all.filter((x) => x.id !== s.id))}>
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
              <div className="input">
                <input
                  aria-label="New subtask"
                  placeholder="Enter subtasks"
                  value={draftSub}
                  onChange={(e) => setDraftSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.ctrlKey) {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                />
              </div>
              <button type="button" className="add-sub" onClick={addSubtask}>
                +Add subtask
              </button>
            </div>
          </div>

          <div className="field">
            <button type="button" className="repeat" role="checkbox" aria-checked={repeat} onClick={() => setRepeat((r) => !r)}>
              <span className={`box${repeat ? " on" : ""}`}>{repeat && <Check size={14} strokeWidth={3} />}</span>
              Repeat
            </button>
            {repeat && (
              <div className="pair" style={{ marginTop: 16 }}>
                <div className="input">
                  <select aria-label="Repeat frequency" value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
                    {FREQS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} strokeWidth={1.6} style={{ pointerEvents: "none" }} />
                </div>
                <div>
                  <DateField ariaLabel="Repeat until" prefix="Till :" value={till} onChange={setTill} onBlur={touch("till")} invalid={!!show("till")} />
                </div>
              </div>
            )}
            {show("till") && <div className="error">{errors.till}</div>}
          </div>

          {editing && (
            <div className="field">
              <span className="label">Time Spent</span>
              <TimeField ariaLabel="Time spent" step={5} value={spent} onChange={setSpent} onBlur={touch("spent")} invalid={!!show("spent")} />
              {show("spent") && <div className="error">{errors.spent}</div>}
            </div>
          )}
        </div>

        {confirmDiscard ? (
          <div className="discard">
            <span>Discard this task?</span>
            <button className="btn btn-secondary" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </button>
            <button className="btn btn-primary" onClick={closeModal}>
              Discard
            </button>
          </div>
        ) : (
          <div className="actions">
            <button className="btn btn-secondary btn-lg" onClick={requestClose}>
              Cancel
            </button>
            <button className="btn btn-primary btn-lg" disabled={!canSubmit} onClick={() => void submit()}>
              {editing ? "Update" : "Create"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
