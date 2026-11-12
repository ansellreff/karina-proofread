"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LEVELS, type Level } from "@/lib/record/levels";
import { cn } from "@/lib/utils";
import { confetti, cssColor } from "./confetti";
import { Trophy } from "./trophy";

export interface ShelfItem {
  level: Level;
  earned: boolean;
  /** When it was reached (the Nth finished document's date), already formatted. */
  reachedOn?: string;
  /** The finished document that reached it: "a Study Plan for Kilo". */
  earnedWith?: string;
  /** Reached since her last visit. */
  isNew: boolean;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** Restart a CSS animation class on an element (each click plays it again). */
function replay(el: HTMLElement | null, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/**
 * The big trophy under the spotlight. It shows the level Karina picked on the shelf (her current one by default),
 * swaps with an animation when she picks another, tilts towards the pointer, and celebrates when clicked.
 */
export function TrophySpotlight({
  items,
  shown,
  current,
  finished,
  onShow,
}: {
  items: ShelfItem[];
  shown: Level["id"];
  current: Level["id"];
  /** Counted-up number of finished documents (shown on the current trophy's plaque). */
  finished: number;
  onShow: (id: Level["id"]) => void;
}) {
  const tilt = useRef<HTMLDivElement>(null);
  const cup = useRef<HTMLButtonElement>(null);
  // the trophy that is leaving while the new one comes in
  const [leaving, setLeaving] = useState<Level["id"] | null>(null);
  const [prev, setPrev] = useState(shown);
  if (prev !== shown) {
    setPrev(shown);
    setLeaving(prev);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), reduced() ? 0 : 650);
    return () => clearTimeout(t);
  }, [leaving]);

  const index = LEVELS.findIndex((l) => l.id === shown);
  const item = items[index];
  const go = (step: number) => onShow(LEVELS[(index + step + LEVELS.length) % LEVELS.length].id);
  const plaque = (id: Level["id"]) => (id === current ? finished : LEVELS.find((l) => l.id === id)!.at);

  function move(e: React.PointerEvent) {
    if (reduced() || e.pointerType !== "mouse" || !tilt.current) return;
    const r = tilt.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tilt.current.style.setProperty("--ry", `${x * 22}deg`);
    tilt.current.style.setProperty("--rx", `${-y * 16}deg`);
    tilt.current.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
    tilt.current.style.setProperty("--my", `${(y + 0.5) * 100}%`);
  }
  function rest() {
    for (const p of ["--rx", "--ry"]) tilt.current?.style.setProperty(p, "0deg");
  }
  function celebrate() {
    if (!item.earned) return replay(cup.current, "trophy-shake");
    replay(cup.current, "trophy-clink");
    const r = cup.current?.getBoundingClientRect();
    const metal = cssColor(`--trophy-${shown}`);
    if (r) confetti({ colors: [metal, cssColor("--trophy-shine"), cssColor("--trophy-gold"), cssColor("--primary")], pieces: 70, duration: 1800, origin: { x: r.left + r.width / 2, y: r.top + r.height * 0.4 } });
  }

  return (
    <div
      className="flex flex-col items-center gap-3"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          go(e.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div ref={tilt} className="trophy-tilt relative w-full max-w-[19rem]" onPointerMove={move} onPointerLeave={rest}>
        <div aria-hidden className="trophy-shine-sweep pointer-events-none absolute inset-0 z-10 rounded-full" />
        {leaving && (
          <div aria-hidden className="trophy-swap-out pointer-events-none absolute inset-0">
            <Trophy level={leaving} finished={plaque(leaving)} locked={!items[LEVELS.findIndex((l) => l.id === leaving)].earned} />
          </div>
        )}
        <button
          ref={cup}
          type="button"
          onClick={celebrate}
          aria-label={item.earned ? `${item.level.name} trophy: click to celebrate` : `${item.level.name} trophy, locked`}
          title={item.earned ? "Click to celebrate" : undefined}
          className="relative block w-full cursor-pointer rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span key={shown} className={cn("block", leaving && "trophy-swap-in")}>
            <Trophy level={shown} finished={plaque(shown)} locked={!item.earned} label={`${item.level.name} trophy${item.earned ? "" : ", locked"}`} />
          </span>
          {leaving && <span key={`flash-${shown}`} aria-hidden className="trophy-flash pointer-events-none absolute inset-[15%] rounded-full" />}
        </button>
      </div>

      {/* the plaque: which trophy this is, and how it was won */}
      <div className="flex w-full max-w-[22rem] items-center gap-2">
        <button type="button" onClick={() => go(-1)} aria-label="Previous trophy" className="trophy-nav">
          <ChevronLeft className="size-4" />
        </button>
        <div key={shown} className="trophy-plaque min-w-0 flex-1 text-center" aria-live="polite" data-shown={shown}>
          <p className="font-serif text-lg leading-tight font-semibold">{item.level.name}</p>
          <p className="text-xs text-pretty text-muted-foreground">
            {!item.earned
              ? `Locked. ${item.level.at - finished === 1 ? "One more finished document" : `${item.level.at - finished} more finished documents`} to unlock it.`
              : item.level.at === 0
                ? "Where it all started."
                : `${shown === current ? "Your trophy now. " : ""}Won${item.reachedOn ? ` on ${item.reachedOn}` : ""} with your ${ordinal(item.level.at)} finished document${item.earnedWith ? `, ${item.earnedWith}` : ""}.`}
          </p>
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Next trophy" className="trophy-nav">
          <ChevronRight className="size-4" />
        </button>
      </div>
      {shown !== current && (
        <button type="button" onClick={() => onShow(current)} className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
          <RotateCcw className="size-3" /> Back to your trophy now
        </button>
      )}
    </div>
  );
}

/** Every level as a small trophy on glass shelves: earned ones shine, locked ones wait as silhouettes. */
export function TrophyCabinet({ items, shown, finished, onShow }: { items: ShelfItem[]; shown: Level["id"]; finished: number; onShow: (id: Level["id"]) => void }) {
  return (
    <ol className="trophy-cabinet grid grid-cols-3 gap-y-5 rounded-2xl border px-3 pt-5 pb-3 sm:grid-cols-5 lg:grid-cols-9" aria-label="Trophy cabinet">
      {items.map(({ level: l, earned, reachedOn, isNew }, i) => {
        const selected = shown === l.id;
        return (
          <li key={l.id} className="flex flex-col" data-badge={l.id} data-earned={earned || undefined}>
            <button
              type="button"
              onClick={() => onShow(l.id)}
              aria-pressed={selected}
              aria-label={`${l.name}: ${earned ? `earned${reachedOn ? ` ${reachedOn}` : ""}` : `locked, ${l.at - finished} more`}. Show it in the spotlight.`}
              className={cn("cabinet-slot group relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 pt-2 pb-1 text-center focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", selected && "is-selected")}
              style={{ "--delay": `${i * 70}ms`, "--metal": `var(--trophy-${l.id})` } as React.CSSProperties}
            >
              {isNew && <span className="absolute top-0 right-1 z-10 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">New</span>}
              <span className="w-14 transition-transform duration-300 group-hover:-translate-y-1 sm:w-16">
                <Trophy level={l.id} finished={l.at} mini locked={!earned} label={`${l.name} trophy${earned ? "" : ", locked"}`} />
              </span>
              <span className="text-xs font-medium">{l.name}</span>
              <span className="text-[11px] text-muted-foreground">{earned ? (reachedOn ?? "Earned") : `${l.at - finished} more`}</span>
            </button>
            <span aria-hidden className="cabinet-plank mt-1 h-2" />
          </li>
        );
      })}
    </ol>
  );
}
