"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

type Item = { top: number; left: number; width: number; height: number; el: HTMLElement };
type Snapshot = { key: string; items: Map<string, Item>; height: number };

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Changes right after the page opens (a remembered sort read from the browser) aren't animated. */
const SETTLE_MS = 400;

/**
 * Smooth list changes, a soft shuffle: after a render that changed which rows are shown or their order, rows that
 * stayed glide (with a slight sideways sway) from where they were to their new place, new rows rise in one after
 * another, rows that left fade out where they were, and the box eases to its new height.
 *
 * Rows are the elements with `data-flip="<id>"` inside `box`; `overlay` (absolutely placed over `box`) holds the
 * leaving rows for their fade. `still` is a row that must not be moved (the one being dragged).
 */
export function useListMotion(box: RefObject<HTMLElement | null>, overlay: RefObject<HTMLElement | null>, still?: RefObject<string | null>) {
  const last = useRef<Snapshot | null>(null);
  const born = useRef(0);

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    if (!born.current) born.current = performance.now();
    const rows = [...root.querySelectorAll<HTMLElement>("[data-flip]")];
    const key = rows.map((r) => r.dataset.flip).join("|");
    const prev = last.current;
    if (prev && prev.key === key) return; // nothing moved: keep the snapshot of the last change

    // the new layout, measured without the motion still running from the last change
    for (const r of rows) for (const a of r.getAnimations()) if (a.id === "flip") a.cancel();
    const base = root.getBoundingClientRect();
    const items = new Map<string, Item>();
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      items.set(el.dataset.flip!, { top: r.top - base.top, left: r.left - base.left, width: r.width, height: r.height, el });
    }
    const height = base.height;
    last.current = { key, items, height };
    if (!prev || reducedMotion() || performance.now() - born.current < SETTLE_MS) return;

    let entering = 0;
    rows.forEach((el, i) => {
      const id = el.dataset.flip!;
      if (still?.current === id) return;
      const before = prev.items.get(id);
      const now = items.get(id)!;
      if (!before) {
        const a = el.animate(
          [
            { opacity: 0, transform: "translateY(14px) scale(0.985)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 460, delay: Math.min(entering++ * 40, 320), easing: EASE_OUT, fill: "backwards" },
        );
        a.id = "flip";
        return;
      }
      const dy = before.top - now.top;
      if (Math.abs(dy) < 1) return;
      const sway = Math.max(-10, Math.min(10, dy / 6)); // down-movers lean one way, up-movers the other
      const a = el.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: `translate(${sway}px, ${dy * 0.4}px) scale(0.992)`, offset: 0.45 },
          { transform: "none" },
        ],
        { duration: 580, delay: Math.min(i * 14, 180), easing: EASE_OUT },
      );
      a.id = "flip";
    });

    // rows that left fade out where they stood
    const layer = overlay.current;
    if (layer) {
      for (const [id, item] of prev.items) {
        if (items.has(id)) continue;
        const ghost = item.el.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("data-flip");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        Object.assign(ghost.style, { position: "absolute", top: `${item.top}px`, left: `${item.left}px`, width: `${item.width}px`, height: `${item.height}px`, margin: "0", pointerEvents: "none" });
        layer.append(ghost);
        const a = ghost.animate(
          [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "translateX(-16px) scale(0.98)" },
          ],
          { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
        );
        a.onfinish = () => ghost.remove();
      }
    }

    if (Math.abs(prev.height - height) > 1) root.animate([{ height: `${prev.height}px` }, { height: `${height}px` }], { duration: 460, easing: EASE_OUT });
  });
}
