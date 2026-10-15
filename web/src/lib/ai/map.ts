import { headerZone } from "../rules/detect";
import type { ParagraphInsert, RuleContext, TextEdit } from "../rules/types";
import type { Review } from "./schema";

export interface MappedReview {
  edits: TextEdit[];
  deletions: { para: number; reason: string }[];
  inserts: ParagraphInsert[];
  endNoteItems: string[];
  /** AI suggestions that could not be placed (anchor text not found, invalid paragraph). */
  dropped: { what: string; why: string }[];
  /** Private reasons per edit, keyed by `${para}:${start}:${end}:${text}`. */
  reasons: Map<string, string>;
}

export const editKey = (e: { para: number; start: number; end: number; text: string }) => `${e.para}:${e.start}:${e.end}:${e.text}`;

const fold = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[ \t ]+/g, " ");

/** Find `needle` in `hay`, tolerating curly/straight quotes and repeated spaces. Returns [start, end) in `hay`. */
export function locate(hay: string, needle: string, from = 0): [number, number] | null {
  if (!needle) return null;
  const exact = hay.indexOf(needle, from);
  if (exact >= 0) return [exact, exact + needle.length];
  // Build a folded copy of hay with an index map back to the original.
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < hay.length; i++) {
    const ch = fold(hay[i]);
    if (ch === " " && folded.endsWith(" ")) continue;
    folded += ch;
    map.push(i);
  }
  map.push(hay.length);
  const n = fold(needle).replace(/ +/g, " ");
  const at = folded.indexOf(n, Math.max(0, map.findIndex((m) => m >= from)));
  if (at < 0) return null;
  return [map[at], map[at + n.length - 1] + 1];
}

/** Shrink a replacement to the words that actually change, as Karina's word-level edits are. */
export function minimalDiff(find: string, replace: string): { prefix: number; suffix: number } {
  const tok = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const a = tok(find);
  const b = tok(replace);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { prefix: a.slice(0, p).join("").length, suffix: a.slice(a.length - s).join("").length };
}

/**
 * Word-level diff of `find` -> `replace` as separate hunks (offsets relative to `find`), so
 * "Initially, I worked as crew" -> "At first, I worked as a crew member" becomes two small tracked changes.
 */
export function wordHunks(find: string, replace: string): { start: number; end: number; text: string }[] {
  const tok = (s: string) => s.match(/[\p{L}\p{N}’'\-]+|\s+|[^\p{L}\p{N}\s]/gu) ?? [];
  const a = tok(find);
  const b = tok(replace);
  if (a.length * b.length > 40_000) {
    const { prefix, suffix } = minimalDiff(find, replace);
    return [{ start: prefix, end: find.length - suffix, text: replace.slice(prefix, replace.length - suffix) }];
  }
  // LCS table over tokens
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hunks: { start: number; end: number; text: string }[] = [];
  let i = 0, j = 0, pos = 0;
  let cur: { start: number; end: number; text: string } | null = null;
  const flush = () => {
    if (cur && (cur.start !== cur.end || cur.text)) hunks.push(cur);
    cur = null;
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      pos += a[i].length;
      i++;
      j++;
    } else if (j < b.length && (i === a.length || L[i][j + 1] >= L[i + 1][j])) {
      cur ??= { start: pos, end: pos, text: "" };
      cur.text += b[j++];
    } else {
      cur ??= { start: pos, end: pos, text: "" };
      pos += a[i].length;
      cur.end = pos;
      i++;
    }
  }
  flush();
  // Hunks separated by at most one unchanged word read better as one change, the way Karina marks them
  // ("crew" -> "a crew member", "have to" -> "must").
  const merged: typeof hunks = [];
  for (const h of hunks) {
    const prev = merged[merged.length - 1];
    if (prev && /^\s*(?:[\p{L}\p{N}’'\-]+\s*)?$/u.test(find.slice(prev.end, h.start))) {
      prev.text += find.slice(prev.end, h.start) + h.text;
      prev.end = h.end;
    } else merged.push({ ...h });
  }
  // Trim whitespace shared by both sides ("have to " -> "must " becomes "have to" -> "must").
  for (const h of merged) {
    while (h.end > h.start && h.text && /\s/.test(find[h.end - 1]) && h.text.endsWith(find[h.end - 1])) {
      h.end--;
      h.text = h.text.slice(0, -1);
    }
    while (h.end > h.start && h.text && /\s/.test(find[h.start]) && h.text.startsWith(find[h.start])) {
      h.start++;
      h.text = h.text.slice(1);
    }
  }
  return merged;
}

export function mapReview(review: Review, ctx: RuleContext): MappedReview {
  const byIndex = new Map(ctx.paras.map((p) => [p.index, p]));
  const header = new Set(headerZone(ctx).map((p) => p.index));
  const out: MappedReview = { edits: [], deletions: [], inserts: [], endNoteItems: [], dropped: [], reasons: new Map() };

  const push = (e: TextEdit, reason: string) => {
    out.edits.push(e);
    out.reasons.set(editKey(e), reason);
  };

  for (const r of review.replacements) {
    const p = byIndex.get(r.paragraph);
    const span = p ? locate(p.text, r.find) : null;
    if (!p || !span) {
      out.dropped.push({ what: `P${r.paragraph}: "${r.find}" -> "${r.replace}"`, why: p ? "text not found" : "no such paragraph" });
      continue;
    }
    const original = p.text.slice(span[0], span[1]);
    for (const h of wordHunks(original, r.replace)) {
      const start = span[0] + h.start;
      const end = span[0] + h.end;
      if (start === end && !h.text) continue;
      if (p.text.slice(start, end) === h.text) continue;
      push({ para: p.index, start, end, text: h.text, rule: "ai:fix", kind: "fix", beyondStyle: r.beyond_style }, r.reason);
    }
  }

  for (const ins of review.insertions) {
    const p = byIndex.get(ins.paragraph);
    if (!p || !ins.text) {
      out.dropped.push({ what: `P${ins.paragraph}: insert "${ins.text}"`, why: "no such paragraph" });
      continue;
    }
    let at: number;
    if (!ins.after) at = p.text.trimEnd().length;
    else {
      const span = locate(p.text, ins.after);
      if (!span) {
        out.dropped.push({ what: `P${ins.paragraph}: after "${ins.after}" insert "${ins.text}"`, why: "anchor not found" });
        continue;
      }
      at = span[1];
    }
    push({ para: p.index, start: at, end: at, text: ins.text, rule: ins.kind === "note" ? "ai:note" : "ai:fix", kind: ins.kind, beyondStyle: ins.beyond_style }, ins.reason);
  }

  for (const d of review.paragraph_deletions) {
    if (!byIndex.has(d.paragraph) || header.has(d.paragraph)) {
      out.dropped.push({ what: `delete P${d.paragraph}`, why: header.has(d.paragraph) ? "header line" : "no such paragraph" });
      continue;
    }
    out.deletions.push({ para: d.paragraph, reason: d.reason });
  }

  for (const s of review.suggestion_paragraphs) {
    if (!byIndex.has(s.after_paragraph) || !s.text.trim()) {
      out.dropped.push({ what: `suggestion after P${s.after_paragraph}`, why: "no such paragraph" });
      continue;
    }
    out.inserts.push({ position: "after", para: s.after_paragraph, paragraphs: [{ text: s.text.trim() }], rule: "ai:suggestion" });
  }

  out.endNoteItems = review.end_note_items.map((t) => t.trim()).filter(Boolean);
  return out;
}
