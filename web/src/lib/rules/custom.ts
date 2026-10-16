/** Karina's own rules from the Review rules page: replace text, add a note, add an end-note line, or tell the AI. */
import { customPattern, fill, type CustomRule } from "./config";
import { bodyParas, headerZone } from "./detect";
import { rulesOf, type DocType, type RuleContext, type TextEdit } from "./types";

const WORDS_PER_PAGE = 400; // Times New Roman 12 pt, 1.5 spacing, 1" margins

export const appliesTo = (r: CustomRule, docType: DocType) => r.enabled && (r.docTypes.length === 0 || r.docTypes.includes(docType));

/** Keep a sentence-initial capital: "As long as" + rule "as long as -> if" gives "If". */
function matchCase(found: string, replacement: string): string {
  if (/^\p{Lu}/u.test(found) && /^\p{Ll}/u.test(replacement) && !/^\p{Lu}{2,}/u.test(found)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** " (note)" unless Karina already wrote the parentheses. */
export const asNote = (text: string) => {
  const t = text.trim();
  return /^\(.*\)$/s.test(t) ? ` ${t}` : ` (${t})`;
};

/** Replace and note rules, as inline edits. */
export function customInlineEdits(ctx: RuleContext): TextEdit[] {
  const out: TextEdit[] = [];
  for (const r of rulesOf(ctx).custom) {
    if ((r.action !== "replace" && r.action !== "note") || !appliesTo(r, ctx.docType) || !r.find.trim()) continue;
    let re: RegExp;
    try {
      re = customPattern(r, true);
    } catch {
      continue; // invalid patterns are rejected when saving; never break a proofread over one
    }
    const reason = `Your rule: ${r.label || r.find}`;
    let done = false;
    for (const p of ctx.paras) {
      if (done || !p.text) continue;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(p.text))) {
        if (m[0] === "") {
          re.lastIndex++;
          continue;
        }
        const end = m.index + m[0].length;
        if (r.action === "replace") {
          const text = matchCase(m[0], r.text);
          if (text !== m[0]) out.push({ para: p.index, start: m.index, end, text, rule: `custom:${r.id}`, kind: "fix", reason });
        } else {
          out.push({ para: p.index, start: end, end, text: asNote(r.text), rule: `custom:${r.id}`, kind: "note", reason });
        }
        if (r.occurrences === "first") {
          done = true;
          break;
        }
      }
    }
  }
  return out;
}

/** Text the end-note conditions look at: everything except the header lines. */
function documentText(ctx: RuleContext): string {
  const header = new Set(headerZone(ctx).map((p) => p.index));
  return ctx.paras.filter((p) => !header.has(p.index)).map((p) => p.text).join("\n");
}

/** End-note lines from Karina's rules whose condition holds for this document. */
export function customEndNotes(ctx: RuleContext): { text: string; rule: CustomRule }[] {
  const words = bodyParas(ctx).reduce((n, p) => n + p.words, 0);
  const pages = Math.max(1, Math.round((words / WORDS_PER_PAGE) * 2) / 2);
  const text = documentText(ctx);
  const out: { text: string; rule: CustomRule }[] = [];
  for (const r of rulesOf(ctx).custom) {
    if (r.action !== "end-note" || !appliesTo(r, ctx.docType)) continue;
    let fires = false;
    try {
      if (r.condition === "always") fires = true;
      else if (r.condition === "mentions") fires = customPattern(r).test(text);
      else if (r.condition === "missing") fires = !customPattern(r).test(text);
      else if (r.condition === "longer-than") fires = words > r.words;
      else if (r.condition === "shorter-than") fires = words < r.words;
    } catch {
      fires = false;
    }
    if (fires && r.text.trim()) out.push({ text: fill(r.text.trim(), { words, pages }), rule: r });
  }
  return out;
}

/** Extra instructions for the AI layer that apply to this document type. */
export function customAiInstructions(ctx: RuleContext): string[] {
  return rulesOf(ctx).custom.filter((r) => r.action === "ai" && appliesTo(r, ctx.docType) && r.text.trim()).map((r) => r.text.trim());
}
