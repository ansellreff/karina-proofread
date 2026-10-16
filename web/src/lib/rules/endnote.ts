import { fill, formatReminder } from "./config";
import { customEndNotes } from "./custom";
import { bodyParas } from "./detect";
import { countWords } from "./text";
import { NARRATIVE, rulesOf, type ParagraphInsert, type RuleContext } from "./types";

const WORDS_PER_PAGE = 400; // Times New Roman 12 pt, 1.5 spacing, 1" margins
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export interface EndNoteOptions {
  /** Body formatting deviated from the formatting standard. */
  formatDeviated: boolean;
  tables: number;
}

/** Essays with a "(500 words max)" prompt: the answers that run over. */
export function essayOverruns(ctx: RuleContext): { ordinal: string; limit: number; words: number }[] {
  const out: { ordinal: string; limit: number; words: number }[] = [];
  const prompts = ctx.paras.filter((p) => /\(\s*(\d{3,4})\s*words?\s*max(?:imum)?\s*\)|max(?:imum)?\.?\s*(\d{3,4})\s*words/i.test(p.text));
  prompts.forEach((prompt, i) => {
    const m = /(\d{3,4})\s*words?\s*max|max(?:imum)?\.?\s*(\d{3,4})\s*words/i.exec(prompt.text)!;
    const limit = Number(m[1] ?? m[2]);
    const next = prompts[i + 1]?.index ?? Infinity;
    const answer = ctx.paras.filter((p) => p.index > prompt.index && p.index < next && !/^\s*ESSAY\b/i.test(p.text));
    const words = answer.reduce((n, p) => n + countWords(p.text), 0);
    if (words > limit) out.push({ ordinal: ORDINAL[i] ?? `${i + 1}th`, limit, words: Math.round(words / 10) * 10 });
  });
  return out;
}

/** Structure facts the end note and the score both use. */
export function structureFacts(ctx: RuleContext, tables: number) {
  const body = bodyParas(ctx);
  const words = body.reduce((n, p) => n + p.words, 0);
  const pages = Math.max(1, Math.round((words / WORDS_PER_PAGE) * 2) / 2);
  const prose = body.filter((p) => !p.isList);
  const unbalanced = prose.some((p) => p.sentences >= 7) && prose.some((p) => p.sentences <= 2);
  const listParas = ctx.paras.filter((p) => p.isList && p.words > 0).length;
  const listHeavy = ctx.docType !== "Essay" && (tables > 0 || listParas >= 5);
  const sections = ctx.paras.filter((p) => p.isShort && /^\s*(?:\d+\.|[IVX]+\.)\s+\p{Lu}/u.test(p.text)).length;
  const limit = rulesOf(ctx).builtIn.lengthCheck.limits.find((l) => l.docType === ctx.docType);
  return { words, pages, unbalanced, listHeavy, sections, limit, overLimit: !!limit && words > limit.maxWords };
}

/** The "Note:" block Karina adds at the end of almost every document. */
export function endNote(ctx: RuleContext, opts: EndNoteOptions): ParagraphInsert[] {
  const cfg = rulesOf(ctx);
  const b = cfg.builtIn;
  if (!b.endNote.enabled) return [];
  const items: string[] = [];
  const last = [...ctx.paras].reverse().find((p) => p.text.trim()) ?? ctx.paras[ctx.paras.length - 1];
  if (!last) return [];

  if (NARRATIVE.includes(ctx.docType)) {
    const f = structureFacts(ctx, opts.tables);

    if (opts.formatDeviated) items.push(...formatReminder(cfg.format));

    if (ctx.docType === "Essay") {
      if (b.essayLimit.enabled) items.push(...essayOverruns(ctx).map((o) => fill(b.essayLimit.message, o)));
    } else if (b.lengthCheck.enabled) {
      if (f.overLimit && f.limit) items.push(fill(f.limit.message, { words: f.words, pages: f.pages }));
      else items.push(b.lengthCheck.withinMessage);
    }

    if (b.paragraphBalance.enabled && f.unbalanced) items.push(b.paragraphBalance.message);
    if (b.listsAndTables.enabled && f.listHeavy) items.push(b.listsAndTables.message);
    if (b.tooManySections.enabled && f.sections >= b.tooManySections.minSections) items.push(fill(b.tooManySections.message, { sections: f.sections }));
  }

  // Karina's own end-note rules (guiding questions, CV guidelines, ...)
  items.push(...customEndNotes(ctx).map((n) => n.text));

  if (!items.length) return [];
  return [{ position: "after", para: last.index, paragraphs: [{ text: b.endNote.heading }, ...items.map((text) => ({ text }))], rule: "end-note" }];
}
