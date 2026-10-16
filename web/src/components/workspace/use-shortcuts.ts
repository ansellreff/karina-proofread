"use client";

import { useEffect, useRef } from "react";

export type ShortcutAction =
  | "next" | "prev" | "accept" | "reject" | "undo" | "save"
  | "togglePanel" | "toggleOriginal" | "toggleSplit" | "toggleLock" | "help" | "escape";

/** The list shown in the "?" dialog. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["J"], label: "Next change" },
  { keys: ["K"], label: "Previous change" },
  { keys: ["A"], label: "Accept the highlighted change (then go to the next)" },
  { keys: ["R"], label: "Reject the highlighted change (then go to the next)" },
  { keys: ["U"], label: "Undo your last accept/reject" },
  { keys: ["Ctrl", "S"], label: "Save as a new version" },
  { keys: ["\\"], label: "Show or hide the review panel" },
  { keys: ["O"], label: "Show the original, as received" },
  { keys: ["S"], label: "Side by side on/off" },
  { keys: ["L"], label: "Lock scroll and zoom on/off (side by side)" },
  { keys: ["Esc"], label: "Back to your review" },
  { keys: ["?"], label: "This list" },
];

type Target = { closest?: (selector: string) => unknown } | null;

/** Typing in the document, a text field, or an open menu/dialog: letter keys belong there, not to shortcuts. */
export function isTypingTarget(target: unknown): boolean {
  const el = target as Target;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], .superdoc, [role="dialog"], [role="menu"], [role="listbox"]');
}

/** Which shortcut a key press means (null: none). Ctrl/⌘+S works everywhere; letters only outside text. */
export function shortcutFor(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: unknown }): ShortcutAction | null {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && key === "s") return "save";
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTypingTarget(e.target)) return null;
  const map: Record<string, ShortcutAction> = {
    j: "next", k: "prev", a: "accept", r: "reject", u: "undo", "\\": "togglePanel",
    o: "toggleOriginal", s: "toggleSplit", l: "toggleLock", "?": "help", Escape: "escape",
  };
  return map[key] ?? null;
}

/** Calls `handler` for review-page shortcuts. */
export function useShortcuts(handler: (action: ShortcutAction) => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.key !== "j" && e.key !== "k") return;
      const action = shortcutFor(e);
      if (!action) return;
      e.preventDefault();
      latest.current(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
