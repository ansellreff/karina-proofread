"use client";

import { ArrowLeftRight, GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { Mode } from "./doc-editor";

/** What a side of the split view shows: the student's original, or the review in one of the editor modes. */
export type PaneView = "original" | Mode;

export const PANE_VIEWS: { id: PaneView; label: string; hint: string }[] = [
  { id: "original", label: "Original", hint: "The student’s file exactly as uploaded" },
  { id: "suggesting", label: "Suggesting", hint: "Your edits are tracked as Karina's changes" },
  { id: "editing", label: "Editing", hint: "Edit directly, no tracking" },
  { id: "viewing", label: "Viewing", hint: "Read only" },
];

/** A per-browser preference (side, width, panel open). Falls back to the default when storage is unavailable. */
export function usePreference<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`kp:${key}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount (no storage during SSR)
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* private window or blocked storage */
    }
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(`kp:${key}`, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
}

const DRAG_TYPE = "application/x-karina-pane";

/** Title bar of one side: drag handle, what it shows (picker), swap button. */
export function PaneHeader({ which, value, onPick, onSwap, onDragStart, onDragEnd }: {
  which: "original" | "review";
  value: PaneView;
  onPick: (v: PaneView) => void;
  onSwap: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="@container flex shrink-0 items-center gap-1.5 border-b bg-card px-1.5 py-1" data-pane-header={which}>
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, which);
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        title="Drag to the other side"
        aria-label="Drag to the other side"
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </span>
      <div role="radiogroup" aria-label={which === "original" ? "Left/right side view" : "Review side view"} className="flex min-w-0 items-center rounded-md border bg-background p-0.5">
        {PANE_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={value === v.id}
            title={v.id === value ? v.hint : `${v.hint}${(v.id === "original") !== (which === "original") ? " (the sides swap)" : ""}`}
            onClick={() => onPick(v.id)}
            className={cn(
              "h-6 rounded px-1.5 text-[11px] whitespace-nowrap transition-colors @md:px-2 @md:text-xs",
              value === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      <span className="ml-auto hidden truncate text-xs text-muted-foreground @lg:inline">{which === "original" ? "As received" : "Your review"}</span>
      <button
        type="button"
        onClick={onSwap}
        title="Swap sides"
        aria-label="Swap sides"
        className="ml-auto flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground @lg:ml-0"
      >
        <ArrowLeftRight className="size-4" />
      </button>
    </div>
  );
}

/** Drag the bar to resize the two sides (20–80%). Arrow keys nudge, double-click resets to half and half. */
export function SplitDivider({ container, ratio, onRatio, onCommit, order }: {
  container: RefObject<HTMLElement | null>;
  ratio: number;
  onRatio: (r: number) => void;
  onCommit: (r: number) => void;
  order: number;
}) {
  const dragging = useRef(false);
  const clamp = (r: number) => Math.min(0.8, Math.max(0.2, r));
  const at = (clientX: number) => {
    const box = container.current?.getBoundingClientRect();
    return box ? clamp((clientX - box.left) / box.width) : ratio;
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the two sides"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      style={{ order }}
      className="group relative z-10 w-2 shrink-0 cursor-col-resize touch-none bg-border/60 outline-none hover:bg-primary/30 focus-visible:bg-primary/40"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => dragging.current && onRatio(at(e.clientX))}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(at(e.clientX));
      }}
      onDoubleClick={() => onCommit(0.5)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onCommit(clamp(ratio + (e.key === "ArrowLeft" ? -0.05 : 0.05)));
        }
      }}
    >
      <span className="absolute top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40 group-hover:bg-primary" />
    </div>
  );
}

export const PANEL_MIN = 300;
const panelMax = () => Math.max(PANEL_MIN, Math.min(720, Math.round(window.innerWidth * 0.55)));

/** Left edge of the review panel: hold and drag to make the panel wider or narrower. Double-click resets. */
export function PanelResizer({ width, onWidth, onCommit }: { width: number; onWidth: (w: number) => void; onCommit: (w: number) => void }) {
  const dragging = useRef(false);
  const clamp = (w: number) => Math.min(panelMax(), Math.max(PANEL_MIN, Math.round(w)));
  const at = (clientX: number) => clamp(window.innerWidth - clientX);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the review panel"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={720}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize the panel (double-click to reset)"
      className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => dragging.current && onWidth(at(e.clientX))}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(at(e.clientX));
      }}
      onDoubleClick={() => onCommit(380)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onCommit(clamp(width + (e.key === "ArrowLeft" ? 30 : -30)));
        }
      }}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
      <span className="absolute top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100 group-hover:bg-primary" />
    </div>
  );
}

/** While a side is dragged: two drop zones over the documents (so nothing is dropped into the text). */
export function DropOverlay({ dragged, onDrop, onCancel }: { dragged: "original" | "review"; onDrop: (side: "left" | "right") => void; onCancel: () => void }) {
  const [over, setOver] = useState<"left" | "right" | null>(null);
  const zone = (side: "left" | "right") => (
    <div
      key={side}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(side);
      }}
      onDragLeave={() => setOver((o) => (o === side ? null : o))}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(side);
      }}
      className={cn(
        "flex flex-1 items-center justify-center border-2 border-dashed text-sm font-medium transition-colors",
        over === side ? "border-primary bg-primary/15 text-primary" : "border-transparent bg-foreground/5 text-muted-foreground",
      )}
    >
      Put the {dragged === "original" ? "original" : "review"} on the {side}
    </div>
  );
  return (
    <div className="absolute inset-0 z-30 flex gap-2 p-2 backdrop-blur-[1px]" onDragEnd={onCancel}>
      {zone("left")}
      {zone("right")}
    </div>
  );
}
