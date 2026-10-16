"use client";

import { Minus, MoveHorizontal, Plus, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePreference } from "./split-view";
import { fitZoom, onZoom, setZoomPercent, zoomState, type ZoomState } from "./superdoc-api";

/** Narrow side-by-side columns fit pages at 30–40%, so the range starts below that. */
export const ZOOM_MIN = 20;
export const ZOOM_MAX = 200;
const clamp = (n: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n)));
/** Word's +/- buttons move to the next multiple of 10. */
export const stepZoom = (v: number, dir: 1 | -1) => clamp(dir > 0 ? Math.floor(v / 10) * 10 + 10 : Math.ceil(v / 10) * 10 - 10);

/** Give the other pane the same zoom (only when it differs, so two linked panes never echo each other). */
function mirror(partner: (() => unknown) | undefined, value: number) {
  const other = partner?.();
  const theirs = zoomState(other);
  if (theirs && theirs.value !== value) setZoomPercent(other, value);
}

/**
 * Word-style zoom for one pane. Folded, it is a small, faint magnifier in the pane's bottom-right corner, so it
 * never covers the page; hovering (or tapping, or tabbing to) it opens − slider + and the percentage, plus
 * "fit page width". Ctrl + mouse wheel over the pane zooms too. Each pane remembers its zoom ("fit" or a percentage).
 *
 * `partner` (side by side with the scroll lock on): the other pane, which then always has the same zoom. Any zoom
 * Karina sets on either side is copied across; automatic re-fits are led by the review side.
 */
export function ZoomBar({ which, superdoc, ready, pane, partner }: { which: "review" | "original"; superdoc: () => unknown; ready: number; pane: RefObject<HTMLElement | null>; partner?: () => unknown }) {
  const [pref, setPref] = usePreference<number | "fit">(`zoom-${which}`, "fit");
  const [z, setZ] = useState<ZoomState | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerRef = useRef(partner);
  const prefRef = useRef(pref);
  useEffect(() => {
    partnerRef.current = partner;
    prefRef.current = pref;
  });

  // follow the editor's zoom, and put back the zoom this pane had last time
  useEffect(() => {
    const sd = superdoc();
    if (!sd) return;
    const off = onZoom(sd, (next) => {
      setZ(next);
      // a zoom set on this pane (here, or copied from the other side) is remembered for this pane
      if (next.mode === "manual" && prefRef.current !== next.value) setPref(next.value);
      // linked: chosen zooms go across both ways; the review side also carries its automatic fits
      if (next.mode === "manual" || which === "review") mirror(partnerRef.current, next.value);
    });
    const current = zoomState(sd);
    if (typeof pref === "number" && current?.value !== pref) setZoomPercent(sd, pref);
    else if (pref === "fit" && current?.mode === "manual") fitZoom(sd);
    const t = requestAnimationFrame(() => setZ(zoomState(sd)));
    return () => {
      off();
      cancelAnimationFrame(t);
    };
  }, [superdoc, ready, pref, setPref, which]);

  // turning the lock on: the original takes the review's zoom
  useEffect(() => {
    if (!partner || which !== "review") return;
    const t = requestAnimationFrame(() => {
      const mine = zoomState(superdoc());
      if (mine) mirror(partner, mine.value);
    });
    return () => cancelAnimationFrame(t);
  }, [partner, which, superdoc, ready]);

  // Ctrl + wheel over the pane, as in Word
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault(); // not the browser's page zoom
      const sd = superdoc();
      const v = stepZoom(zoomState(sd)?.value ?? 100, e.deltaY < 0 ? 1 : -1);
      setZoomPercent(sd, v);
      setPref(v);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [pane, superdoc, setPref, ready]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  /** Tapped or clicked: open and put the focus on the slider (a tap elsewhere folds it again). */
  const openByTap = () => {
    show();
    requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>('input[type="range"]')?.focus());
  };
  /** The mouse left (always folds), or the focus left the bar (folds unless the mouse is still over it). */
  const hideSoon = (mouseLeft: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!mouseLeft && box.current?.matches(":hover")) return;
      if (box.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      setOpen(false);
    }, 600);
  };

  const set = (n: number) => {
    const v = clamp(n);
    setZoomPercent(superdoc(), v);
    setPref(v);
  };
  const fit = () => {
    const sd = superdoc();
    fitZoom(sd);
    setPref("fit");
    // linked: the other side takes this side's fitted size, so both show the same zoom
    if (partner) requestAnimationFrame(() => mirror(partner, zoomState(sd)?.value ?? 100));
  };

  if (!z) return null;
  const value = z.value;
  const fitting = z.mode === "fit-width";
  return (
    <div
      ref={box}
      role="group"
      aria-label={`Zoom, ${which === "original" ? "original" : "review"}`}
      data-zoom={which}
      data-open={open || undefined}
      onMouseEnter={show}
      onMouseLeave={() => hideSoon(true)}
      onFocus={show}
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node | null) && hideSoon(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
      className={cn(
        "no-print absolute right-4 bottom-3 z-20 flex items-center rounded-full border text-foreground transition-[background-color,box-shadow,opacity] duration-150",
        open ? "gap-0.5 bg-card/95 py-0.5 pr-2 pl-1 opacity-100 shadow-[0_2px_8px_rgb(var(--shadow-color)/0.12)] backdrop-blur" : "border-transparent bg-card/60 p-0.5 opacity-50 hover:opacity-100",
      )}
    >
      {open ? (
        <>
          <Button size="icon-xs" variant="ghost" aria-label="Fit page width" title="Fit page width" aria-pressed={fitting} onClick={fit} className={cn("rounded-full", fitting && "bg-secondary text-secondary-foreground")}>
            <MoveHorizontal />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Zoom out" className="rounded-full" disabled={value <= ZOOM_MIN} onClick={() => set(stepZoom(value, -1))}>
            <Minus />
          </Button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={5}
            value={value}
            onChange={(e) => set(Number(e.target.value))}
            aria-label="Zoom"
            aria-valuetext={`${value}%`}
            className="h-1 w-20 cursor-pointer accent-primary sm:w-28"
          />
          <Button size="icon-xs" variant="ghost" aria-label="Zoom in" className="rounded-full" disabled={value >= ZOOM_MAX} onClick={() => set(stepZoom(value, 1))}>
            <Plus />
          </Button>
          <button
            type="button"
            onClick={() => set(100)}
            title="Back to 100%"
            aria-label={`Zoom ${value}%, back to 100%`}
            className="w-10 rounded text-right text-xs tabular-nums hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {value}%
          </button>
        </>
      ) : (
        <button
          type="button"
          aria-label={`Zoom ${value}%`}
          aria-expanded={false}
          onClick={openByTap}
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ZoomIn className="size-4" />
        </button>
      )}
    </div>
  );
}
