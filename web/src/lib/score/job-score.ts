/** Scores for a document in the app: original, after all suggestions, and the current state of Karina's review. */
import type { ChangeRecord } from "../pipeline";
import type { RuleConfig } from "../rules/config";
import type { DocType } from "../rules/types";
import { scoreDocx, type DocScore } from "./score";

/** Karina's notes and note paragraphs from a proofread: instructions to the student, left out of the score. */
export function noteTexts(changes: ChangeRecord[]): string[] {
  const out: string[] = [];
  for (const c of changes) {
    if (c.kind === "note") out.push(c.after);
    else if (c.kind === "paragraph" && (c.rule === "end-note" || c.rule === "ai:suggestion")) out.push(...c.after.split("\n"));
  }
  return out.map((t) => t.trim()).filter(Boolean);
}

const isFix = (c: ChangeRecord) => c.kind === "fix" || c.kind === "delete";

/** Bot fixes still open: any of their tracked changes is pending (all of them when `pending` is omitted). */
export function openFixCount(changes: ChangeRecord[], pending?: Set<string>): number {
  return changes.filter((c) => isFix(c) && (!pending || (c.revisionIds ?? []).some((id) => pending.has(id)))).length;
}

interface JobLike {
  fileName: string;
  docType: DocType;
}

/** Right after proofreading: the student's file (every bot fix still a problem) and the result if everything is accepted. */
export async function proofreadScores(job: JobLike, original: Uint8Array, botVersion: Uint8Array, changes: ChangeRecord[], rules: RuleConfig) {
  const base = { fileName: job.fileName, docType: job.docType, rules, notes: noteTexts(changes) };
  const [before, potential] = await Promise.all([
    scoreDocx(original, { ...base, openFixes: openFixCount(changes) }),
    scoreDocx(botVersion, base),
  ]);
  return { original: before, potential };
}

/**
 * The document as Karina's review stands: open suggestions are rejected (not applied yet), the rest accepted.
 * `openFixes` comes from the review panel when known (exact even after undo, when changes get new ids).
 */
export async function currentScore(job: JobLike, docx: Uint8Array, changes: ChangeRecord[], pending: Set<string>, rules: RuleConfig, openFixes?: number): Promise<DocScore> {
  return scoreDocx(docx, { fileName: job.fileName, docType: job.docType, rules, notes: noteTexts(changes), pendingIds: pending, openFixes: openFixes ?? openFixCount(changes, pending) });
}
