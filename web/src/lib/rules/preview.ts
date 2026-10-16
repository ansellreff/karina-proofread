/** Run the review rules on pasted text (the "Try your rules" box on the Review rules page). */
import type { RuleConfig } from "./config";
import { grammarEdits } from "./grammar";
import { runRules } from "./index";
import { countSentences, countWords } from "./text";
import type { DocType, ParaInfo, RuleContext } from "./types";

export interface PreviewChange {
  rule: string;
  kind: "fix" | "note" | "paragraph";
  before: string;
  after: string;
  /** The paragraph with the change applied, for context. */
  context: string;
  beyondStyle?: boolean;
  reason?: string;
}

export async function previewRules(text: string, docType: DocType, config: RuleConfig): Promise<PreviewChange[]> {
  const texts = text.replace(/\r\n/g, "\n").split(/\n+/).map((t) => t.trim()).filter(Boolean).slice(0, 200);
  const paras: ParaInfo[] = texts.map((t, index) => {
    const words = countWords(t);
    return { index, text: t, words, sentences: countSentences(t), inTable: false, isList: /^\s*(?:[-•*]|\d+[.)])\s/.test(t), isShort: words > 0 && words < 15 && countSentences(t) <= 1 };
  });
  const ctx: RuleContext = { fileName: "preview.docx", docType, paras, fullText: texts.join("\n"), config };
  const out = runRules(ctx, { formatDeviated: false, tables: 0 }, await grammarEdits(ctx));
  const changes: PreviewChange[] = out.edits
    .sort((a, b) => a.para - b.para || a.start - b.start)
    .map((e) => {
      const t = texts[e.para];
      return {
        rule: e.rule, kind: e.kind, before: t.slice(e.start, e.end), after: e.text, beyondStyle: e.beyondStyle, reason: e.reason,
        context: `${t.slice(Math.max(0, e.start - 60), e.start)}⟦${t.slice(e.start, e.end)}→${e.text.trim()}⟧${t.slice(e.end, e.end + 60)}`,
      };
    });
  for (const ins of out.inserts) {
    changes.push({ rule: ins.rule, kind: "paragraph", before: "", after: ins.paragraphs.map((p) => p.text).join("\n"), context: "" });
  }
  return changes;
}
