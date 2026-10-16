"use client";

import { useEffect, type RefObject } from "react";

/** SuperDoc's scrolling element inside a pane. */
const scroller = (root: HTMLElement | null) => root?.querySelector<HTMLElement>(".superdoc__sub-document") ?? null;

/**
 * Scroll two editor panes together. The reviewed version is longer than the original (notes, header lines),
 * so positions are matched proportionally: halfway down one side is halfway down the other.
 * `tick` re-attaches after either editor (re)loads.
 */
export function useLinkedScroll(on: boolean, leader: RefObject<HTMLElement | null>, follower: RefObject<HTMLElement | null>, tick: unknown) {
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let detach = () => {};
    let tries = 0;

    const attach = () => {
      const a = scroller(leader.current);
      const b = scroller(follower.current);
      if (!a || !b) {
        if (tries++ < 60) timer = setTimeout(attach, 250); // editors may still be opening
        return;
      }
      let driver: HTMLElement | null = null;
      let release: ReturnType<typeof setTimeout> | undefined;
      const follow = (src: HTMLElement, dst: HTMLElement) => () => {
        if (driver && driver !== src) return; // ignore the scroll we caused on the other side
        driver = src;
        const max = src.scrollHeight - src.clientHeight;
        dst.scrollTop = (max > 0 ? src.scrollTop / max : 0) * (dst.scrollHeight - dst.clientHeight);
        clearTimeout(release);
        release = setTimeout(() => (driver = null), 120);
      };
      const fromA = follow(a, b);
      const fromB = follow(b, a);
      a.addEventListener("scroll", fromA, { passive: true });
      b.addEventListener("scroll", fromB, { passive: true });
      fromA(); // line the other side up with the leader right away
      detach = () => {
        a.removeEventListener("scroll", fromA);
        b.removeEventListener("scroll", fromB);
        clearTimeout(release);
      };
    };
    attach();
    return () => {
      clearTimeout(timer);
      detach();
    };
  }, [on, leader, follower, tick]);
}
