"use client";

import { useCallback, useEffect, useState } from "react";

const EVENT = "kp:preference";

/**
 * A per-browser preference (side, width, panel open, last version seen…), kept in localStorage under `kp:<key>`.
 * Falls back to the default when storage is unavailable. Every component using the same key follows a change.
 */
export function usePreference<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(`kp:${key}`);
        if (raw !== null) setValue(JSON.parse(raw) as T);
      } catch {
        /* private window or blocked storage */
      }
    };
    read(); // once after mount (no storage during SSR)
    const changed = (e: Event) => (e as CustomEvent<string>).detail === key && read();
    window.addEventListener(EVENT, changed);
    return () => window.removeEventListener(EVENT, changed);
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(`kp:${key}`, JSON.stringify(v));
        window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
}
