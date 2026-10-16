/**
 * Text comparison for the learning loop: which paragraphs of the student's original became which paragraphs of
 * Karina's final version, and the word-level edits inside each pair.
 */

const TOKEN = /[\p{L}\p{N}’'\-]+|\s+|[^\p{L}\p{N}\s]/gu;
const WORD = /[\p{L}\p{N}’'\-]+/gu;

export const tokens = (s: string): string[] => s.match(TOKEN) ?? [];

export interface Hunk {
  /** Offsets in the original text. */
  start: number;
  end: number;
  /** Replacement text ("" = deletion). */
  text: string;
}

/** Word-level edits that turn `a` into `b`, one per run of changed words (unchanged spaces separate them). */
export function wordDiff(a: string, b: string): Hunk[] {
  if (a === b) return [];
  const x = tokens(a);
  const y = tokens(b);
  // strip the common start and end first: paragraphs usually differ in a few places only
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const xs = x.slice(pre, x.length - suf);
  const ys = y.slice(pre, y.length - suf);
  const offset = x.slice(0, pre).join("").length;
  if (xs.length * ys.length > 4_000_000) return [{ start: offset, end: offset + xs.join("").length, text: ys.join("") }];

  // LCS over tokens (rows of the table as typed arrays: paragraphs can have a few hundred tokens)
  const n = xs.length;
  const m = ys.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = xs[i] === ys[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);

  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  let pos = offset;
  let i = 0;
  let j = 0;
  const flush = () => {
    if (cur && (cur.start !== cur.end || cur.text)) hunks.push(cur);
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && xs[i] === ys[j]) {
      flush();
      pos += xs[i++].length;
      j++;
    } else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) {
      cur ??= { start: pos, end: pos, text: "" };
      cur.text += ys[j++];
    } else {
      cur ??= { start: pos, end: pos, text: "" };
      pos += xs[i++].length;
      cur.end = pos;
    }
  }
  flush();
  // Hunks with at most one unchanged word between them are one edit, the way Karina marks them in Word
  // ("Petra Christian University" -> "Universitas Kristen Petra", not three fragments around "Petra").
  const merged: Hunk[] = [];
  for (const h of hunks) {
    const prev = merged[merged.length - 1];
    if (prev && /^\s*(?:[\p{L}\p{N}’'\-]+\s*)?$/u.test(a.slice(prev.end, h.start))) {
      prev.text += a.slice(prev.end, h.start) + h.text;
      prev.end = h.end;
    } else merged.push({ ...h });
  }
  return merged.map((h) => trimHunk(a, h)).filter((h) => h.start !== h.end || h.text);
}

/** Drop whitespace that both sides share at the edges ("very " -> "" stays, " big" -> " large" becomes "big" -> "large"). */
function trimHunk(a: string, h: Hunk): Hunk {
  let { start, end, text } = h;
  while (end > start && text && /\s/.test(a[end - 1]) && text.endsWith(a[end - 1])) {
    end--;
    text = text.slice(0, -1);
  }
  while (end > start && text && /\s/.test(a[start]) && text.startsWith(a[start])) {
    start++;
    text = text.slice(1);
  }
  return { start, end, text };
}

function wordBag(s: string): Map<string, number> {
  const bag = new Map<string, number>();
  for (const w of s.toLowerCase().match(WORD) ?? []) bag.set(w, (bag.get(w) ?? 0) + 1);
  return bag;
}

/** How alike two paragraphs are: shared words over all words (Dice), 1 for identical text. */
export function similarity(a: string, b: string, bagA = wordBag(a), bagB = wordBag(b)): number {
  if (a === b) return 1;
  let na = 0;
  let nb = 0;
  let shared = 0;
  for (const v of bagA.values()) na += v;
  for (const v of bagB.values()) nb += v;
  if (!na || !nb) return 0;
  for (const [w, v] of bagA) shared += Math.min(v, bagB.get(w) ?? 0);
  return (2 * shared) / (na + nb);
}

/** Pairs [original index, final index]; -1 on one side = a paragraph that was removed or added. */
export type Pair = [number, number];

export const SAME_PARAGRAPH = 0.5;

/**
 * Align the paragraphs of two versions in order (a longest-common-subsequence over paragraphs, where two
 * paragraphs count as the same one when at least half of their words are shared).
 */
export function alignParagraphs(orig: string[], fin: string[]): Pair[] {
  let pre = 0;
  while (pre < orig.length && pre < fin.length && orig[pre] === fin[pre]) pre++;
  let suf = 0;
  while (suf < orig.length - pre && suf < fin.length - pre && orig[orig.length - 1 - suf] === fin[fin.length - 1 - suf]) suf++;
  const a = orig.slice(pre, orig.length - suf);
  const b = fin.slice(pre, fin.length - suf);
  const bagsA = a.map(wordBag);
  const bagsB = b.map(wordBag);
  const n = a.length;
  const m = b.length;
  const sim = (i: number, j: number) => {
    const s = similarity(a[i], b[j], bagsA[i], bagsB[j]);
    // empty paragraphs only pair with empty paragraphs
    return s >= SAME_PARAGRAPH || (a[i].trim() === "" && b[j].trim() === "") ? Math.max(s, 0.5) : 0;
  };
  const S: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const M: Float64Array[] = Array.from({ length: n }, () => new Float64Array(m));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      M[i][j] = sim(i, j);
      S[i][j] = Math.max(S[i + 1][j], S[i][j + 1], M[i][j] ? S[i + 1][j + 1] + M[i][j] : 0);
    }
  const pairs: Pair[] = [];
  for (let k = 0; k < pre; k++) pairs.push([k, k]);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && M[i][j] && S[i][j] === S[i + 1][j + 1] + M[i][j]) pairs.push([pre + i++, pre + j++]);
    else if (j < m && (i === n || S[i][j] === S[i][j + 1])) pairs.push([-1, pre + j++]);
    else pairs.push([pre + i++, -1]);
  }
  for (let k = suf; k > 0; k--) pairs.push([orig.length - k, fin.length - k]);
  return pairs;
}

export const words = (s: string) => (s.match(WORD) ?? []).length;

/** Text compared the way Karina's edits are compared in training/eval.py (case, curly quotes and spaces ignored). */
export const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
