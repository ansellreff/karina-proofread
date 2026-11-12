/**
 * A green check that pops up in the middle of the screen for a moment when a document is marked as done.
 * Plain DOM (like the record confetti), removed when its animation ends; motion is shortened by the reduced-motion
 * rule in globals.css.
 */
export function popDoneCheck(): void {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "done-pop";
  el.dataset.donePop = "";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27 l7 7 l15 -16" /></svg>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
