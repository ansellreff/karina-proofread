/**
 * Student names, written the same way everywhere: "Alex Suti" (not "ALEX SUTI" or "alex suti").
 *  - each word starts with a capital, the rest is small ("anne-marie" -> "Anne-Marie", "o'neil" -> "O'Neil");
 *  - names joined in a file name are split ("AlexSuti" -> "Alex Suti"), but a name written that way on
 *    purpose stays ("McDonald", "DeAndre": already mixed case, and the first part is too short to be a name);
 *  - small connecting words stay small after the first word ("van", "de", "bin", "binti", "al"…);
 *  - scripts without capitals (Chinese, …) are left as they are.
 */
const PARTICLES = new Set(["van", "von", "der", "den", "de", "del", "della", "da", "di", "du", "la", "le", "bin", "binti", "al", "el"]);

export function formatStudentName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/_+/g, " ")
    .replace(/(?<=\p{Ll}{2})(?=\p{Lu}\p{Ll}{2})/gu, " ") // "AlphaBravoCharlie" -> "Alpha Bravo Charlie"
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!s) return null;
  return s
    .split(" ")
    .map((word, i) => {
      const letters = word.replace(/[^\p{L}]/gu, "");
      if (!/[\p{Lu}\p{Ll}]/u.test(letters)) return word; // no capitals in this script
      const upper = /\p{Lu}/u.test(letters);
      const lower = /\p{Ll}/u.test(letters);
      // already written with care ("McDonald", "DeAndre"): keep it; plain "Alex" stays "Alex" anyway, and a word
      // starting small ("aLEX", caps lock) is a slip, not a choice
      if (upper && lower && /^\p{Lu}/u.test(letters) && !/^\p{Lu}\p{Ll}*$/u.test(letters)) return word;
      const small = word.toLowerCase();
      if (i > 0 && PARTICLES.has(small)) return small;
      return small.replace(/(^|[-'’])(\p{L})/gu, (_, before: string, c: string) => before + c.toUpperCase());
    })
    .join(" ");
}

/** The same name, compared loosely ("Alex Suti" ~ "AlexSuti" ~ "ALEX SUTI"). */
export const nameKey = (name: string) => name.toLowerCase().replace(/[^\p{L}]/gu, "");

/**
 * A name guessed from a file name, matched to a student already in the app: when the guess is the start of one
 * (and only one) known name ("AlexSuti" -> "Alex Suti Delta"), the fuller known name is used, so the same
 * student is written the same way on every document.
 */
export function matchKnownName(guess: string, known: (string | null)[]): string {
  const key = nameKey(guess);
  if (key.length < 4) return guess;
  const matches = [...new Set(known.filter((k): k is string => !!k).filter((k) => nameKey(k).startsWith(key)))];
  const distinct = [...new Map(matches.map((m) => [nameKey(m), m])).values()];
  return distinct.length === 1 ? (formatStudentName(distinct[0]) ?? guess) : guess;
}
