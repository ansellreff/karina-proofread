"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import { useEffect, useSyncExternalStore } from "react";

/** Light / dark / follow the computer, remembered per browser (class "dark" on <html>). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PaperSync />
      {children}
    </NextThemes>
  );
}

// ---- paper colour in dark mode: "white" (like Word, default) or "dark" (inverted page, easier at night)

export type Paper = "white" | "dark";
const KEY = "kp:paper";
const EVENT = "kp:paper";

function readPaper(): Paper {
  try {
    return localStorage.getItem(KEY) === '"dark"' ? "dark" : "white";
  } catch {
    return "white";
  }
}

export function setPaper(p: Paper) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private window */
  }
  document.documentElement.dataset.paper = p;
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** The paper preference, kept in sync between the header, Settings and the review page. */
export function usePaper(): Paper {
  return useSyncExternalStore(subscribe, readPaper, () => "white");
}

/** Puts the preference on <html data-paper> so the CSS can apply it. */
function PaperSync() {
  const paper = usePaper();
  useEffect(() => {
    document.documentElement.dataset.paper = paper;
  }, [paper]);
  return null;
}
