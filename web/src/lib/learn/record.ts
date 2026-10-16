/**
 * A learned record: one document Karina finished, reduced to the student's original text, her edits on it and what
 * happened to each bot suggestion. Edits are placed on the original text exactly like training/eval.py does, so
 * the numbers here and the accuracy test mean the same thing.
 */
import type { ChangeRecord } from "../pipeline";
import type { DocType } from "../rules/types";
import { alignParagraphs, norm, wordDiff, words } from "./diff";

export type EditCategory = "header" | "end-note" | "inline-note" | "added-content" | "cut" | "fix";

export interface NetEdit {
  /** Offsets in the record's original text (paragraphs joined with "\n"). */
  start: number;
  end: number;
  before: string;
  after: string;
  category: EditCategory;
  /** Whole paragraphs added (header lines, end note, suggestions) rather than words inside a paragraph. */
  paragraphs?: boolean;
}

export type Outcome = "kept" | "changed" | "rejected";

export interface BotOutcome {
  rule: string;
  kind: ChangeRecord["kind"];
  start: number;
  end: number;
  before: string;
  after: string;
  outcome: Outcome;
}

export interface LearnedRecord {
  /** "job-<job id>" for a document finished in the app, "up-<uuid>" for an uploaded review. */
  id: string;
  source: "job" | "upload";
  jobId?: string;
  fileName: string;
  docType: DocType;
  learnedAt: string;
  /** When Karina finished it (newest tracked-change date, or when it was marked done). Recent habits count most. */
  reviewedAt: string;
  /** The student's name, replaced by "[Name]" in anything shown or sent to the AI. */
  names: string[];
  /** The student's original: paragraph texts joined with "\n". */
  text: string;
  starts: number[];
  edits: NetEdit[];
  outcomes: BotOutcome[];
}

const TOL = 3;

export function paragraphStarts(paras: string[]): { text: string; starts: number[] } {
  const starts: number[] = [];
  let pos = 0;
  for (const p of paras) {
    starts.push(pos);
    pos += p.length + 1;
  }
  return { text: paras.join("\n"), starts };
}

/** Karina's net edits: everything that differs between the original and her final version. */
export function netEdits(orig: string[], fin: string[]): { text: string; starts: number[]; edits: NetEdit[] } {
  const { text, starts } = paragraphStarts(orig);
  const raw: Omit<NetEdit, "category">[] = [];
  let anchor = 0; // where an added paragraph goes: the end of the last original paragraph seen
  let pending: string[] = [];
  const flushAdded = () => {
    if (pending.some((t) => t.trim())) raw.push({ start: anchor, end: anchor, before: "", after: pending.filter((t) => t.trim()).join("\n"), paragraphs: true });
    pending = [];
  };
  for (const [i, j] of alignParagraphs(orig, fin)) {
    if (i < 0) {
      pending.push(fin[j]);
      continue;
    }
    flushAdded();
    const s = starts[i];
    if (j < 0) {
      if (orig[i].trim()) raw.push({ start: s, end: s + orig[i].length, before: orig[i], after: "" });
    } else {
      for (const h of wordDiff(orig[i], fin[j])) raw.push({ start: s + h.start, end: s + h.end, before: orig[i].slice(h.start, h.end), after: h.text });
    }
    anchor = s + orig[i].length;
  }
  flushAdded();

  // categories as in training/eval.py units()
  const firstBody = starts[orig.findIndex((p) => words(p) >= 15)] ?? 0;
  let lastBody = text.length;
  for (let i = orig.length - 1; i >= 0; i--)
    if (orig[i].trim()) {
      lastBody = starts[i] + orig[i].length;
      break;
    }
  const edits = raw.map((e): NetEdit => {
    let category: EditCategory = "fix";
    if (!e.before && e.start <= firstBody && e.paragraphs) category = "header";
    else if (!e.before && e.start >= lastBody) category = "end-note";
    else if (!e.before && (/\(.{6,}\)|\?\?|\?\)/.test(e.after) || e.after.trim().startsWith("("))) category = "inline-note";
    else if (!e.before && words(e.after) > 8) category = "added-content";
    else if (e.before && !e.after && words(e.before) >= 12) category = "cut";
    return { ...e, category };
  });
  return { text, starts, edits };
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }, tol = TOL): boolean {
  const [a0, a1] = a.start === a.end ? [a.start - tol, a.end + tol] : [a.start, a.end];
  const [b0, b1] = b.start === b.end ? [b.start - tol, b.end + tol] : [b.start, b.end];
  return a0 < b1 && b0 < a1;
}

/** The original text between `w0` and `w1` with the given edits applied. */
export function applyIn(text: string, w0: number, w1: number, edits: { start: number; end: number; after: string }[]): string {
  let out = "";
  let pos = w0;
  for (const e of [...edits].sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (e.start < pos) continue;
    out += text.slice(pos, e.start) + e.after;
    pos = e.end;
  }
  return out + text.slice(pos, w1);
}

/** Did Karina keep, change or reject each bot suggestion? */
export function botOutcomes(changes: ChangeRecord[], text: string, starts: number[], edits: NetEdit[]): BotOutcome[] {
  const out: BotOutcome[] = [];
  for (const c of changes) {
    if (c.kind === "format" || starts[c.paragraph] === undefined) continue;
    const start = starts[c.paragraph] + c.start;
    const end = starts[c.paragraph] + c.end;
    let outcome: Outcome;
    if (c.kind === "paragraph") {
      // added paragraphs: compare the lines she ended up with in the gap where the bot put them
      const [g0, g1] = gapAround(text, start);
      const mine = edits.filter((e) => e.paragraphs && e.start >= g0 && e.start <= g1).flatMap((e) => e.after.split("\n").map(norm));
      const lines = c.after.split("\n").map(norm).filter(Boolean);
      const found = lines.filter((l) => mine.includes(l)).length / Math.max(1, lines.length);
      outcome = found >= 0.8 ? "kept" : found > 0 || mine.length ? "changed" : "rejected";
    } else {
      const near = edits.filter((e) => !e.paragraphs && overlaps(e, { start, end }));
      if (!near.length) outcome = "rejected";
      else {
        const w0 = Math.min(start, ...near.map((e) => e.start));
        const w1 = Math.max(end, ...near.map((e) => e.end));
        const hers = applyIn(text, w0, w1, near);
        const bots = applyIn(text, w0, w1, [{ start, end, after: c.after }]);
        outcome = norm(hers) === norm(bots) ? "kept" : "changed";
      }
    }
    out.push({ rule: c.rule, kind: c.kind, start, end, before: c.before, after: c.after, outcome });
  }
  return out;
}

/** The stretch of empty paragraphs around a paragraph boundary (where added paragraphs can land). */
function gapAround(text: string, at: number): [number, number] {
  let g0 = at;
  while (g0 > 0 && /\s/.test(text[g0 - 1])) g0--;
  let g1 = at;
  while (g1 < text.length && /\s/.test(text[g1])) g1++;
  return [g0, g1];
}
