import { useRef } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { displayToISO, hmsToSec, isoToDisplay, secToHMS } from "../lib/time";

/** Keeps only digits and re-inserts the separators as the user types. */
function mask(raw: string, groups: number[], sep: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, groups.reduce((a, b) => a + b, 0));
  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  return parts.join(sep);
}

interface DateFieldProps {
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  prefix?: string;
  placeholder?: string;
  ariaLabel: string;
}

/** dd-mm-yyyy text field with a calendar button that opens the system date picker. */
export function DateField({ value, onChange, onBlur, invalid, prefix, placeholder = "dd-mm-yyyy", ariaLabel }: DateFieldProps) {
  const picker = useRef<HTMLInputElement>(null);
  const iso = displayToISO(value);
  return (
    <div className={`input${invalid ? " invalid" : ""}`}>
      {prefix && <span className="prefix">{prefix}</span>}
      <input
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        inputMode="numeric"
        onChange={(e) => onChange(mask(e.target.value, [2, 2, 4], "-"))}
        onBlur={onBlur}
      />
      <button type="button" className="icon" aria-label={`Pick ${ariaLabel.toLowerCase()}`} onClick={() => picker.current?.showPicker()}>
        <CalendarDays size={16} strokeWidth={1.6} />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="hidden-picker"
        value={iso ?? ""}
        onChange={(e) => e.target.value && onChange(isoToDisplay(e.target.value))}
      />
    </div>
  );
}

interface TimeFieldProps {
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  ariaLabel: string;
  /** Arrow keys step by this many minutes. */
  step?: number;
}

/** 24-hour hh:mm:ss field (AT-04, AT-12). Arrow keys nudge the value. */
export function TimeField({ value, onChange, onBlur, invalid, ariaLabel, step = 15 }: TimeFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const nudge = (dir: 1 | -1) => {
    const sec = hmsToSec(value) ?? 0;
    const next = Math.min(24 * 3600, Math.max(0, sec + dir * step * 60));
    onChange(secToHMS(next));
  };
  return (
    <div className={`input${invalid ? " invalid" : ""}`}>
      <input
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        placeholder="00:00:00"
        inputMode="numeric"
        onChange={(e) => onChange(mask(e.target.value, [2, 2, 2], ":"))}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            nudge(e.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <button type="button" className="icon" tabIndex={-1} aria-hidden onClick={() => ref.current?.focus()}>
        <Clock size={16} strokeWidth={1.6} />
      </button>
    </div>
  );
}
