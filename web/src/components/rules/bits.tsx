"use client";

import { DOC_TYPES } from "@/lib/rules/config";
import type { DocType } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

export function Section({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4 rounded-lg border bg-card p-4 sm:p-5", className)}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 max-w-[70ch] text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[12rem_1fr] sm:items-start sm:gap-5">
      <div>
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function NativeSelect<T extends string>({ value, onChange, options, className, id, ariaLabel }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn("h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Which document types something applies to. `allowAll`: an empty list means every type. */
export function DocTypeChips({ value, onChange, allowAll = true }: { value: DocType[]; onChange: (v: DocType[]) => void; allowAll?: boolean }) {
  const all = allowAll && value.length === 0;
  const toggle = (t: DocType) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const chip = (on: boolean) =>
    cn("h-7 rounded-full border px-2.5 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary");
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowAll && (
        <button type="button" aria-pressed={all} onClick={() => onChange([])} className={chip(all)}>
          All documents
        </button>
      )}
      {DOC_TYPES.map((t) => (
        <button type="button" key={t} aria-pressed={!all && value.includes(t)} onClick={() => toggle(t)} className={chip(!all && value.includes(t))}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** Segmented choice (small radio group). */
export function Segmented<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex flex-wrap rounded-md border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-7 rounded px-2.5 text-xs transition-colors", value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
