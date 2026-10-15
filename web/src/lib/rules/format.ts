import { paragraphRuns, type Para } from "../docx/paragraphs";
import type { StyleResolver } from "../docx/styles";
import type { Element } from "../docx/xml";
import { countWords } from "./text";
import { NARRATIVE, type RuleContext } from "./types";

export const STANDARD = { font: "Times New Roman", halfPoints: 24, jc: "both", minLine: 276, line: 360 };

export interface FormatPlan {
  deviated: boolean;
  found: { font: string | null; size: number | null; jc: string | null; line: number | null };
  runs: { run: Element; change: { font?: string; halfPoints?: number } }[];
  paras: { p: Element; change: { jc?: string; line?: number } }[];
}

const top = <T>(counts: Map<T, number>): T | null => {
  let best: T | null = null;
  let n = -1;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  return best;
};

/**
 * Karina's current habit (Oct 2026 files): normalise body text to Times New Roman 12 pt, justified,
 * 1.5 line spacing when it is tighter than 1.15. Titles, tables and short heading lines keep their size.
 */
export function planFormatting(ctx: RuleContext, paras: Para[], styles: StyleResolver): FormatPlan {
  const empty: FormatPlan = { deviated: false, found: { font: null, size: null, jc: null, line: null }, runs: [], paras: [] };
  if (!NARRATIVE.includes(ctx.docType)) return empty;

  const body = paras.filter((p) => !p.inTable && countWords(p.text) >= 8);
  if (!body.length) return empty;
  const fonts = new Map<string, number>();
  const sizes = new Map<number, number>();
  const jcs = new Map<string, number>();
  const lines = new Map<number, number>();
  for (const p of body) {
    const pf = styles.para(p.el);
    jcs.set(pf.jc ?? "left", (jcs.get(pf.jc ?? "left") ?? 0) + 1);
    lines.set(pf.line ?? 240, (lines.get(pf.line ?? 240) ?? 0) + 1);
    for (const r of paragraphRuns(p.el)) {
      const len = (r.textContent ?? "").length;
      if (!len) continue;
      const rf = styles.run(p.el, r);
      fonts.set(rf.font ?? "?", (fonts.get(rf.font ?? "?") ?? 0) + len);
      sizes.set(rf.halfPoints ?? 20, (sizes.get(rf.halfPoints ?? 20) ?? 0) + len);
    }
  }
  const found = { font: top(fonts), size: top(sizes), jc: top(jcs), line: top(lines) };
  const badFont = found.font !== STANDARD.font;
  const badSize = found.size !== STANDARD.halfPoints;
  const badJc = found.jc !== STANDARD.jc;
  const badLine = (found.line ?? 240) < STANDARD.minLine;
  const plan: FormatPlan = { deviated: badFont || badSize || badJc || badLine, found, runs: [], paras: [] };

  const bodySet = new Set(body.map((p) => p.el));
  for (const p of paras) {
    for (const r of paragraphRuns(p.el)) {
      if (!(r.textContent ?? "").trim()) continue;
      const rf = styles.run(p.el, r);
      const change: { font?: string; halfPoints?: number } = {};
      if (badFont && rf.font !== STANDARD.font) change.font = STANDARD.font;
      if (badSize && bodySet.has(p.el) && rf.halfPoints !== STANDARD.halfPoints) change.halfPoints = STANDARD.halfPoints;
      if (change.font || change.halfPoints) plan.runs.push({ run: r, change });
    }
    if (!bodySet.has(p.el)) continue;
    const pf = styles.para(p.el);
    const change: { jc?: string; line?: number } = {};
    if (badJc && (pf.jc === "left" || pf.jc === "start" || pf.jc === null)) change.jc = STANDARD.jc;
    if (badLine && (pf.line ?? 240) < STANDARD.minLine) change.line = STANDARD.line;
    if (change.jc || change.line) plan.paras.push({ p: p.el, change });
  }
  return plan;
}
