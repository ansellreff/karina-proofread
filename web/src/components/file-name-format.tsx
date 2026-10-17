"use client";

import { ArrowLeft, ArrowRight, GripVertical, Plus, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { Segmented } from "@/components/rules/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildFileName,
  cleanText,
  DATE_FORMATS,
  DEFAULT_FILE_NAME,
  formatDate,
  MAX_PARTS,
  MAX_TEXT,
  type FileNameFormat,
  type NamePart,
  type NameValues,
  type PartKind,
  type Separator,
} from "@/lib/naming";
import { cn } from "@/lib/utils";

/** A made-up student, so the preview never shows a real name. */
const EXAMPLE: NameValues = { studentName: "Anna Wijaya", docType: "Study Plan", fileName: "StudyPlan_(ANNA) NYUST.docx" };

const LABEL: Record<PartKind, string> = {
  text: "Your text",
  firstName: "First name",
  fullName: "Full name",
  docType: "Document type",
  date: "Date",
  original: "Original file name",
};
const ADD_ORDER: PartKind[] = ["text", "firstName", "fullName", "docType", "date", "original"];

const SEPARATOR_OPTIONS: { value: Separator; label: string }[] = [
  { value: "_", label: "Underscore _" },
  { value: "-", label: "Dash -" },
  { value: " ", label: "Space" },
  { value: "", label: "Nothing" },
];

function newPart(kind: PartKind): NamePart {
  if (kind === "text") return { kind, text: "TEXT" };
  if (kind === "date") return { kind, format: "YYYYMMDD" };
  return { kind } as NamePart;
}

const chipLabel = (p: NamePart) => (p.kind === "text" ? p.text || "(empty)" : LABEL[p.kind]);
const isTextPart = (p: NamePart): p is Extract<NamePart, { kind: "text" }> => p.kind === "text";

/**
 * Settings → Export file name. The name is a row of blocks (your own text, or a value filled in per document),
 * joined by one separator. Blocks are added, removed and moved (drag, or the arrow buttons); a preview shows the result.
 */
export function FileNameSection({ value, onChange }: { value: FileNameFormat; onChange: (f: FileNameFormat) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const parts = value.parts;
  const today = new Date();
  const sel = selected !== null && selected < parts.length ? selected : null;

  const setParts = (next: NamePart[]) => onChange({ ...value, parts: next });
  const update = (i: number, p: NamePart) => setParts(parts.map((x, j) => (j === i ? p : x)));
  const remove = (i: number) => {
    if (parts.length <= 1) return;
    setParts(parts.filter((_, j) => j !== i));
    setSelected(null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= parts.length || from === to) return;
    const next = [...parts];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    setParts(next);
    setSelected(to);
  };
  const add = (kind: PartKind) => {
    if (parts.length >= MAX_PARTS) return;
    setParts([...parts, newPart(kind)]);
    setSelected(parts.length);
    if (kind === "text") requestAnimationFrame(() => textInput.current?.select());
  };
  const used = (kind: PartKind) => kind !== "text" && parts.some((p) => p.kind === kind);

  // the preview, piece by piece, so the selected block can be shown in it
  const pieces = parts.map((p, i) => ({ i, text: buildFileName({ parts: [p], separator: "" }, EXAMPLE, "docx", today).replace(/\.docx$/, "") }));
  const shown = pieces.filter((x) => (parts[x.i].kind === "text" ? cleanText((parts[x.i] as { text: string }).text).trim() : true));
  const full = buildFileName(value, EXAMPLE, "docx", today);

  return (
    <section className="space-y-5 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Export file name</h2>
        <p className="text-sm text-muted-foreground">How downloaded files are named: Word, clean Word and PDF.</p>
      </div>

      <div className="rounded-md border bg-background px-3 py-2.5">
        <p className="text-xs text-muted-foreground">Preview, for an example student</p>
        <p className="mt-0.5 text-sm font-medium break-all" aria-live="polite" aria-label={`Preview: ${full}`}>
          {shown.map((x, k) => (
            <span key={x.i}>
              {k > 0 && <span className="text-muted-foreground">{value.separator === " " ? " " : value.separator}</span>}
              <span className={cn("rounded-sm", sel === x.i && "underline decoration-primary decoration-2 underline-offset-4")}>{x.text}</span>
            </span>
          ))}
          <span className="text-muted-foreground">.docx</span>
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Blocks, in order</p>
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Blocks in the file name">
          {parts.map((p, i) => (
            <li
              key={i}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => dragFrom !== null && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              className={cn(
                "group flex items-center rounded-full border bg-background text-sm transition-colors",
                sel === i ? "border-primary ring-2 ring-primary/25" : "hover:border-foreground/30",
                dragFrom === i && "opacity-50",
              )}
            >
              <GripVertical className="ml-1.5 size-3.5 cursor-grab text-muted-foreground" aria-hidden />
              <button
                type="button"
                onClick={() => setSelected(sel === i ? null : i)}
                aria-pressed={sel === i}
                aria-label={`Block ${i + 1}: ${chipLabel(p)}${p.kind === "text" ? " (your text)" : ""}. Click for options`}
                className={cn("py-1 pr-1 pl-1 focus-visible:underline focus-visible:outline-none", isTextPart(p) ? "font-medium" : "text-primary")}
              >
                {chipLabel(p)}
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={parts.length <= 1}
                aria-label={`Remove ${chipLabel(p)}`}
                title={parts.length <= 1 ? "A name needs at least one block" : "Remove"}
                className="mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">Drag a block to move it, or click it for its options.</p>
      </div>

      {sel !== null && (
        <BlockOptions
          part={parts[sel]}
          index={sel}
          count={parts.length}
          textInput={textInput}
          today={today}
          onChange={(p) => update(sel, p)}
          onMove={(to) => move(sel, to)}
          onRemove={() => remove(sel)}
        />
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Add a block</p>
        <div className="flex flex-wrap gap-1.5">
          {ADD_ORDER.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant="outline"
              onClick={() => add(kind)}
              disabled={parts.length >= MAX_PARTS || used(kind)}
              title={used(kind) ? "Already in the name" : parts.length >= MAX_PARTS ? `At most ${MAX_PARTS} blocks` : undefined}
            >
              <Plus /> {LABEL[kind]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">Between blocks</p>
          <Segmented ariaLabel="Between blocks" value={value.separator} onChange={(v) => onChange({ ...value, separator: v })} options={SEPARATOR_OPTIONS} />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange(DEFAULT_FILE_NAME);
            setSelected(null);
          }}
        >
          <RotateCcw /> Back to DONE_Name_Type_Date
        </Button>
      </div>
    </section>
  );
}

function BlockOptions({
  part,
  index,
  count,
  textInput,
  today,
  onChange,
  onMove,
  onRemove,
}: {
  part: NamePart;
  index: number;
  count: number;
  textInput: React.RefObject<HTMLInputElement | null>;
  today: Date;
  onChange: (p: NamePart) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-dashed p-3" role="group" aria-label={`Options for block ${index + 1}`}>
      <p className="text-sm">
        <span className="font-medium">{part.kind === "text" ? "Your text" : LABEL[part.kind]}</span>
        <span className="text-muted-foreground"> · block {index + 1} of {count}</span>
      </p>

      {part.kind === "text" && (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Words that are the same in every file name</span>
          <Input
            ref={textInput}
            value={part.text}
            maxLength={MAX_TEXT}
            onChange={(e) => onChange({ kind: "text", text: cleanText(e.target.value).slice(0, MAX_TEXT) })}
            className="max-w-xs"
            aria-describedby="text-block-hint"
          />
          <span id="text-block-hint" className="block text-xs text-muted-foreground">
            {"These can't be in a file name and are left out: \\ / : * ? \" < > |"}
          </span>
        </label>
      )}

      {part.kind === "date" && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Date format (the day you download)</p>
          <Segmented
            ariaLabel="Date format"
            value={part.format}
            onChange={(f) => onChange({ kind: "date", format: f })}
            options={DATE_FORMATS.map((f) => ({ value: f, label: formatDate(today, f) }))}
          />
        </div>
      )}

      {(part.kind === "firstName" || part.kind === "fullName" || part.kind === "original") && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Length</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Length"
              value={part.max ? "short" : "all"}
              onChange={(v) => onChange({ ...part, max: v === "short" ? (part.kind === "original" ? 30 : 10) : undefined })}
              options={[
                { value: "all", label: "Whole" },
                { value: "short", label: "Shorten" },
              ]}
            />
            {part.max && (
              <label className="flex items-center gap-1.5 text-sm">
                first
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={part.max}
                  onChange={(e) => onChange({ ...part, max: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
                  className="h-8 w-16 tabular-nums"
                  aria-label="Number of letters to keep"
                />
                letters
              </label>
            )}
          </div>
          {part.kind === "firstName" && <p className="text-xs text-muted-foreground">The student&apos;s first name as shown on the Documents page (you can correct it there).</p>}
          {part.kind === "original" && <p className="text-xs text-muted-foreground">The name of the file the student sent, without .docx.</p>}
        </div>
      )}

      {part.kind === "docType" && <p className="text-xs text-muted-foreground">Study Plan, Autobio, SOP, Resume, Essay… as detected for each document.</p>}

      <div className="flex flex-wrap gap-1.5 border-t pt-3">
        <Button size="sm" variant="outline" onClick={() => onMove(index - 1)} disabled={index === 0}>
          <ArrowLeft /> Move left
        </Button>
        <Button size="sm" variant="outline" onClick={() => onMove(index + 1)} disabled={index === count - 1}>
          Move right <ArrowRight />
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} disabled={count <= 1}>
          <X /> Remove
        </Button>
      </div>
    </div>
  );
}
