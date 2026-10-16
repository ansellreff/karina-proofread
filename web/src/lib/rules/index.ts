import { endNote, type EndNoteOptions } from "./endnote";
import { headerBlock } from "./header";
import { inlineEdits } from "./inline";
import type { RuleContext, RuleOutput, TextEdit } from "./types";

/** Drop edits that overlap an earlier (higher-priority) edit in the same paragraph. */
export function resolveOverlaps(edits: TextEdit[]): TextEdit[] {
  const kept: TextEdit[] = [];
  for (const e of edits) {
    const clash = kept.some(
      (k) => k.para === e.para && (e.start < k.end && k.start < e.end || (e.start === e.end && k.start === k.end && e.start === k.start) || (e.start === e.end && e.start > k.start && e.start < k.end) || (k.start === k.end && k.start > e.start && k.start < e.end)),
    );
    if (!clash) kept.push(e);
  }
  return kept;
}

export function runRules(ctx: RuleContext, opts: EndNoteOptions, extra: TextEdit[] = []): RuleOutput {
  const edits = resolveOverlaps([...inlineEdits(ctx), ...extra]);
  const inserts = [...headerBlock(ctx), ...endNote(ctx, opts)];
  return { edits, inserts };
}

export type { RuleContext, RuleOutput, TextEdit } from "./types";
