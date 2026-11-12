/**
 * Mark as done / Reopen celebrations: a badge flies out of the menu button that was used (the "⋯" in the Documents
 * list, Export on the review page), spinning and growing into the middle of the screen, then fades away. Done is a
 * green check that ticks itself; Reopen is a folder that opens and lets the document out. Plain DOM, removed when
 * finished; without the spin for people who turned animation off.
 */

/** Where the open menu's button is: read it in the click handler, before the menu closes. */
export function menuOrigin(): DOMRect | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-popup-open]")?.getBoundingClientRect() ?? null;
}

// pop-ring: a ripple when the badge lands in the middle
const CHECK = `<svg viewBox="0 0 52 52"><circle class="pop-ring" cx="26" cy="26" r="24" /><circle class="pop-badge" cx="26" cy="26" r="24" /><path class="pop-tick" d="M15 27 l7 7 l15 -16" /></svg>`;
const FOLDER = `<svg viewBox="0 0 52 52">
  <circle class="pop-ring" cx="26" cy="26" r="24" />
  <circle class="pop-badge" cx="26" cy="26" r="24" />
  <path class="pop-folder-back" d="M13 17 h9 l3 3 h13 a2 2 0 0 1 2 2 v16 a2 2 0 0 1 -2 2 h-24 a2 2 0 0 1 -2 -2 v-19 a2 2 0 0 1 1 -2z" />
  <g class="pop-sheet"><rect x="17" y="19" width="18" height="17" rx="1.5" /><path d="M20 24 h12 M20 28 h12 M20 32 h8" /></g>
  <path class="pop-folder-front" d="M11 26 h30 l-2.5 14 h-25 z" />
</svg>`;

function fly(kind: "done" | "reopen", origin: DOMRect | null, duration: number) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = `status-pop status-pop-${kind}`;
  el.dataset.statusPop = kind;
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = kind === "done" ? CHECK : FOLDER;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // the moment it lands in the middle: the ripple, tick and folder flap start from there (globals.css)
  const LAND = 0.4;
  el.style.setProperty("--land", `${Math.round(duration * LAND)}ms`);
  document.body.appendChild(el);
  // from the menu button's centre (or the middle of the screen) to the middle of the screen
  const dx = origin ? origin.left + origin.width / 2 - window.innerWidth / 2 : 0;
  const dy = origin ? origin.top + origin.height / 2 - window.innerHeight / 2 : 0;
  const keyframes: Keyframe[] = still
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
    : [
        // one smooth turn while it grows on its way, a soft settle, a calm pause, then it fades
        { transform: `translate(${dx}px, ${dy}px) scale(0.2) rotate(-360deg)`, opacity: 0.5, easing: "cubic-bezier(0.33, 0, 0.2, 1)" },
        { transform: "translate(0, 0) scale(1.07) rotate(0deg)", opacity: 1, offset: LAND, easing: "ease-in-out" },
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1, offset: LAND + 0.1 },
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 0.84, easing: "ease-in" },
        { transform: "translate(0, 0) scale(0.92) rotate(0deg)", opacity: 0 },
      ];
  const anim = el.animate(keyframes, { duration, fill: "both" });
  anim.onfinish = () => el.remove();
  setTimeout(() => el.remove(), duration + 500); // in case the animation never runs (background tab)
}

/** Mark as done: the green check. */
export const popDoneCheck = (origin: DOMRect | null = null) => fly("done", origin, 2400);

/** Reopen: the folder opens and the document comes back out (a little longer, to see it open). */
export const popReopen = (origin: DOMRect | null = null) => fly("reopen", origin, 2800);
