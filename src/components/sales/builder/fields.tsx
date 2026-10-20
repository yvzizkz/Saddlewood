"use client";

import { useState, type ReactNode } from "react";

// Inputs sized for a thumb and for the iOS keyboard: 16px text (smaller makes
// Safari zoom), the decimal pad for numbers, and a number that keeps what was
// typed ("12.") until it is a number again.

export const CELL =
  "w-full rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-2 text-base text-[var(--color-charcoal)] placeholder:text-[#9a938a] focus:outline-none focus:border-[var(--color-teal)] tabular-nums";

export function NumberField({
  value,
  onChange,
  step,
  min = 0,
  max,
  prefix,
  suffix,
  label,
  className = "",
  placeholder,
  autoFocus,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const shown = value === null || value === undefined || (value === 0 && placeholder) ? "" : String(value);
  // While focused the field shows what was typed; otherwise the stored number.
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  return (
    <div className={`relative ${className}`}>
      {prefix ? <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-charcoal-light)]">{prefix}</span> : null}
      <input
        aria-label={label}
        inputMode="decimal"
        enterKeyHint="done"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={focused ? text : shown}
        step={step}
        onFocus={(e) => {
          setText(shown);
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.,-]/g, "");
          setText(raw);
          const n = Number(raw.replace(/,/g, ""));
          if (raw === "" || raw === "-") onChange(0);
          else if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min, n)));
        }}
        className={`${CELL} ${prefix ? "pl-6" : ""} ${suffix ? "pr-9" : ""}`}
      />
      {suffix ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-charcoal-light)]">{suffix}</span> : null}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left"
    >
      <span>
        <span className="block text-sm text-[var(--color-charcoal)]">{label}</span>
        {hint ? <span className="block text-xs text-[var(--color-charcoal-light)]">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--color-teal)]" : "bg-[var(--color-stone-mid)]"}`}
      >
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

export function Pill({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors ${
        on ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-white" : "border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]"
      }`}
    >
      {children}
    </button>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[var(--color-stone)] bg-white ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-stone)] px-4 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] font-mono text-[var(--color-gold-accessible)]">{title}</p>
          {action}
        </div>
      ) : null}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
