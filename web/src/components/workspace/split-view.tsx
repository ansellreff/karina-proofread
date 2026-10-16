"use client";

import { ArrowLeftRight, GripVertical, Link2, Unlink2 } from "lucide-react";
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

export type PaneId = "original" | "review";
export type Side = "left" | "right";

type DragHandlers = Pick<React.HTMLAttributes<HTMLElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture">;

/** Title bar of one side: drag area (the whole bar), what it shows (picker), swap button. */
export function PaneHeader({ which, value, onPick, onSwap, drag }: {
  which: PaneId;
  value: PaneView;
  onPick: (v: PaneView) => void;
  onSwap: () => void;
  /** Pointer handlers that let the bar be dragged to the other side. */
  drag: DragHandlers;
}) {
  return (
    <div
      {...drag}
      className="@container flex shrink-0 cursor-grab touch-none items-center gap-1.5 border-b bg-card px-1.5 py-1 select-none active:cursor-grabbing"
      data-pane-header={which}
      title="Drag this bar to move the page to the other side"
    >
      <span aria-hidden className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-muted-foreground">
        <GripVertical className="size-4" />
      </span>
      <div role="radiogroup" aria-label={which === "original" ? "Left/right side view" : "Review side view"} className="flex min-w-0 cursor-default items-center rounded-md border bg-background p-0.5">
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
        className="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground @lg:ml-0"
      >
        <ArrowLeftRight className="size-4" />
      </button>
    </div>
  );
}

/** Drag the bar to resize the two sides (20–80%). Arrow keys nudge, double-click resets to half and half. */
export function SplitDivider({ container, ratio, onRatio, onCommit, order, locked, onToggleLock }: {
  container: RefObject<HTMLElement | null>;
  ratio: number;
  onRatio: (r: number) => void;
  onCommit: (r: number) => void;
  order: number;
  /** Scroll lock, shown as a button on the divider (between the two pages it links). */
  locked?: boolean;
  onToggleLock?: () => void;
}) {
  const dragging = useRef(false);
  const clamp = (r: number) => Math.min(0.8, Math.max(0.2, r));
  const at = (clientX: number) => {
    const box = container.current?.getBoundingClientRect();
    return box ? clamp((clientX - box.left) / box.width) : ratio;
  };
  const separator = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the two sides"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      className="group relative h-full w-full cursor-col-resize touch-none bg-border/60 outline-none hover:bg-primary/30 focus-visible:bg-primary/40"
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
  return (
    <div style={{ order }} className="relative z-10 w-2 shrink-0">
      {separator}
      {onToggleLock && (
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={locked}
          aria-label={locked ? "Scroll and zoom locked: click to scroll and zoom each side on its own" : "Lock scroll and zoom: both sides together"}
          title={locked ? "Scrolling together (L). Click to scroll each side on its own" : "Each side scrolls on its own (L). Click to scroll together"}
          className={cn(
            "absolute top-12 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            locked ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {locked ? <Link2 className="size-3.5" /> : <Unlink2 className="size-3.5" />}
        </button>
      )}
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

// ---------------------------------------------------------------------------------------------------------------
// Dragging a side to the other side. Pointer events (not the browser's HTML drag and drop, which Edge cancels
// when the page changes under the drag): a live miniature of the page follows the cursor, the target half lights
// up, and on release the miniature glides into place.

const GHOST_SCALE = 0.42;
const START_DISTANCE = 6;

export interface PaneDrag {
  which: PaneId;
  /** The half under the cursor. */
  over: Side;
}

/** A frozen copy of the pane (what it shows right now) to drag around. */
function makeGhost(pane: HTMLElement, rect: DOMRect): HTMLDivElement {
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.dataset.dragGhost = "";
  Object.assign(ghost.style, {
    position: "fixed", left: "0", top: "0", width: `${rect.width}px`, height: `${rect.height}px`, zIndex: "80",
    transformOrigin: "0 0", transform: `translate(${rect.left}px, ${rect.top}px) scale(1)`, pointerEvents: "none",
    borderRadius: "12px", overflow: "hidden", background: "var(--card)", boxShadow: "0 24px 60px rgb(var(--shadow-color) / .35), 0 0 0 1px color-mix(in srgb, var(--primary) 45%, transparent)",
    transition: "transform 180ms cubic-bezier(.2,.8,.2,1), opacity 180ms", willChange: "transform",
  });
  const clone = pane.cloneNode(true) as HTMLElement;
  // a picture, not a second copy of the app: no ids, roles, test hooks or editing
  for (const el of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]) {
    el.removeAttribute("id");
    el.removeAttribute("role");
    el.removeAttribute("data-pane");
    el.removeAttribute("data-pane-header");
    el.removeAttribute("data-testid");
    el.removeAttribute("contenteditable");
    el.removeAttribute("tabindex");
  }
  Object.assign(clone.style, { width: "100%", height: "100%", order: "0", position: "relative", inset: "auto" });
  clone.classList.remove("invisible");
  ghost.appendChild(clone);
  // show the part of the document that is on screen, not the first page
  const src = pane.querySelector<HTMLElement>(".superdoc__sub-document");
  const dst = clone.querySelector<HTMLElement>(".superdoc__sub-document");
  requestAnimationFrame(() => {
    if (src && dst) dst.scrollTop = src.scrollTop;
  });
  return ghost;
}

/**
 * Drag a side by its title bar. `onDrop(which, side)` is called when it is released over a half (also the half it
 * came from: then nothing changes). Escape cancels.
 */
export function usePaneDrag({ container, pane, onDrop }: {
  container: RefObject<HTMLElement | null>;
  pane: (which: PaneId) => HTMLElement | null;
  onDrop: (which: PaneId, side: Side) => void;
}) {
  const [drag, setDrag] = useState<PaneDrag | null>(null);
  const state = useRef<{ which: PaneId; startX: number; startY: number; grabX: number; grabY: number; started: boolean; ghost: HTMLDivElement | null; over: Side } | null>(null);

  const halfAt = (x: number): Side => {
    const box = container.current?.getBoundingClientRect();
    return box && x < box.left + box.width / 2 ? "left" : "right";
  };
  const place = (g: HTMLDivElement, x: number, y: number, grabX: number, grabY: number) => {
    g.style.transform = `translate(${x - grabX * GHOST_SCALE}px, ${y - grabY * GHOST_SCALE}px) scale(${GHOST_SCALE}) rotate(-1.2deg)`;
  };

  const finish = useCallback(
    (drop: boolean) => {
      const s = state.current;
      state.current = null;
      if (!s?.started) return;
      const g = s.ghost;
      if (drop) onDrop(s.which, s.over);
      setDrag(null);
      if (!g) return;
      // glide into the chosen half (or back) and fade
      const box = container.current?.getBoundingClientRect();
      const target = drop ? s.over : null;
      if (box && target) {
        const half = box.width / 2;
        const left = target === "left" ? box.left : box.left + half;
        g.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease-in";
        g.style.transform = `translate(${left}px, ${box.top}px) scale(${half / parseFloat(g.style.width)})`;
      }
      g.style.opacity = "0";
      setTimeout(() => g.remove(), 240);
    },
    [container, onDrop],
  );

  // Escape cancels a drag
  useEffect(() => {
    if (!drag) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && finish(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [drag, finish]);

  // never leave a picture behind (unmount mid-drag)
  useEffect(() => () => state.current?.ghost?.remove(), []);

  const handlers = (which: PaneId): DragHandlers => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, [role='radio']")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      state.current = { which, startX: e.clientX, startY: e.clientY, grabX: 0, grabY: 0, started: false, ghost: null, over: halfAt(e.clientX) };
    },
    onPointerMove: (e) => {
      const s = state.current;
      if (!s || s.which !== which) return;
      if (!s.started) {
        if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < START_DISTANCE) return;
        const el = pane(which);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        s.started = true;
        s.grabX = s.startX - rect.left;
        s.grabY = s.startY - rect.top;
        s.ghost = makeGhost(el, rect);
        document.body.appendChild(s.ghost);
        const g = s.ghost;
        requestAnimationFrame(() => place(g, e.clientX, e.clientY, s.grabX, s.grabY)); // lift: shrink towards the cursor
        setTimeout(() => {
          if (g.isConnected) g.style.transition = "opacity 180ms"; // then follow the cursor without lag
        }, 190);
        setDrag({ which, over: s.over });
        return;
      }
      if (s.ghost) place(s.ghost, e.clientX, e.clientY, s.grabX, s.grabY);
      const over = halfAt(e.clientX);
      if (over !== s.over) {
        s.over = over;
        setDrag({ which, over });
      }
    },
    onPointerUp: (e) => {
      if (state.current?.which !== which) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      finish(true);
    },
    onPointerCancel: () => finish(false),
    onLostPointerCapture: () => {
      if (state.current?.which === which) finish(false); // e.g. the window lost focus mid-drag
    },
  });

  return { drag, handlers };
}

/** Where the dragged side will land: the two halves, the target highlighted. Purely visual. */
export function DropZones({ drag }: { drag: PaneDrag }) {
  const name = drag.which === "original" ? "Original" : "Your review";
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex gap-2 p-2" aria-live="polite">
      {(["left", "right"] as Side[]).map((side) => (
        <div
          key={side}
          className={cn(
            "flex flex-1 items-end justify-center rounded-xl border-2 border-dashed pb-10 transition-colors duration-150",
            drag.over === side ? "border-primary bg-primary/12" : "border-transparent bg-foreground/[0.03]",
          )}
        >
          {drag.over === side && <span className="rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground shadow-md">{name} on the {side}</span>}
        </div>
      ))}
    </div>
  );
}
