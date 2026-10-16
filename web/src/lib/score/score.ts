/**
 * Document score out of 100: grammar & spelling, clarity, formatting and structure & completeness, measured with
 * the same rules the proofreader uses (no AI, no cost). Karina's notes are instructions to the student, so they are
 * taken out before scoring; open bot fixes count as problems until they are accepted (fixed) or rejected (judged fine).
 */
import { acceptAllRevisions } from "../docx/accept";
import { DocxPackage } from "../docx/package";
import { bodyParagraphs, paragraphRuns, type Para } from "../docx/paragraphs";
import { rejectAllRevisions } from "../docx/reject";
import { StyleResolver } from "../docx/styles";
import { wDescendants } from "../docx/xml";
import { isNarrative, type RuleConfig } from "../rules/config";
import { appliesTo, customEndNotes } from "../rules/custom";
import { bodyParas, buildContext } from "../rules/detect";
import { essayOverruns, structureFacts } from "../rules/endnote";
import { standardOf } from "../rules/format";
import { getLinter, usableLint } from "../rules/grammar";
import { headerPresence } from "../rules/header";
import { inlineEdits } from "../rules/inline";
import { countWords } from "../rules/text";
import type { DocType, ParaInfo, RuleContext } from "../rules/types";

export type CategoryId = "grammar" | "clarity" | "formatting" | "structure";

export interface ScoreItem {
  message: string;
  /** Text to find in the document to show where it is. */
  find?: string;
}

export interface ScoreCategory {
  id: CategoryId;
  label: string;
  score: number;
  max: number;
  items: ScoreItem[];
}

export interface DocScore {
  total: number;
  categories: ScoreCategory[];
  words: number;
  at: string;
}

export interface ScoreOptions {
  fileName: string;
  docType: DocType;
  rules: RuleConfig;
  /** w:ids of bot suggestions still open: they are rejected before scoring (the text is as the student wrote it). */
  pendingIds?: Set<string>;
  /** Bot fixes still open (counted as grammar problems). */
  openFixes?: number;
  /** Karina's inline notes and note paragraphs: removed before scoring. */
  notes?: string[];
}

const MAX: Record<CategoryId, number> = { grammar: 35, clarity: 15, formatting: 20, structure: 30 };
const LABEL: Record<CategoryId, string> = { grammar: "Grammar & spelling", clarity: "Clarity", formatting: "Formatting", structure: "Structure & completeness" };

/** Grammar-checker kinds that count as real errors in the score (whatever is set for edits). */
const SCORED_KINDS = new Set(["Agreement", "Grammar", "Spelling", "Redundancy", "Miscellaneous", "Eggcorn", "Malapropism", "Usage", "Capitalization"]);

/** Wordy phrases (from Karina's concision fixes and common ones). */
const WORDY: [RegExp, string][] = [
  [/\bin order to\b/i, "to"], [/\bdue to the fact that\b/i, "because"], [/\bat this point in time\b/i, "now"],
  [/\ba number of\b/i, "several"], [/\band also\b/i, "and"], [/\bthe fact that\b/i, "that"], [/\bfirst and foremost\b/i, "first"],
  [/\beach and every\b/i, "every"], [/\bfor the purpose of\b/i, "to / for"], [/\bin the event that\b/i, "if"],
  [/\bhas the ability to\b/i, "can"], [/\bit is important to note that\b/i, "(cut)"], [/\bin terms of\b/i, "in / for"],
  [/\bactually\b/i, "(often not needed)"], [/\bthe ultimate goal\b/i, "the goal"], [/\bvery unique\b/i, "unique"],
];
const LONG_SENTENCE = 40;

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Points left after `per100` problems per 100 words: full marks at 0, half at `half`. */
const decay = (max: number, per100: number, half: number) => max * Math.pow(0.5, per100 / half);

/** A short, findable piece of text around a problem (whole words). */
function snippet(text: string, start: number, end: number): string {
  const s = text.slice(Math.max(0, start - 20), Math.min(text.length, end + 20));
  const words = s.split(/\s+/);
  if (start > 20) words.shift();
  if (end + 20 < text.length) words.pop();
  return words.join(" ").trim() || text.slice(start, end);
}

function sentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^.!?]+(?:[.!?]+["”’)]*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (m[0].trim()) out.push({ text: m[0], start: m.index });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------

async function grammar(ctx: RuleContext, body: ParaInfo[], words: number, openFixes: number): Promise<ScoreCategory> {
  const items: ScoreItem[] = [];
  const linter = await getLinter();
  let n = 0;
  for (const p of body) {
    for (const lint of await linter.lint(p.text, { language: "plaintext" })) {
      const kind = lint.lint_kind();
      if (!SCORED_KINDS.has(kind)) continue;
      const { start, end } = lint.span();
      const problem = p.text.slice(start, end);
      const s = lint.suggestions()[0];
      const repl = s ? s.get_replacement_text() : null;
      if (!usableLint(kind, problem, repl, lint.message())) continue;
      n++;
      const fix = repl === null ? "" : s.kind() === 1 ? " (remove)" : ` → “${s.kind() === 2 ? problem + repl : repl}”`;
      items.push({ message: `“${problem.trim() || problem}”${fix}: ${lint.message()}`, find: snippet(p.text, start, end) });
    }
  }
  if (openFixes > 0) items.unshift({ message: `${openFixes} suggested fix${openFixes === 1 ? "" : "es"} still open in What changed` });
  const per100 = words ? ((n + openFixes) / words) * 100 : 0;
  // half the points at 2.5 problems per 100 words (calibrated on Karina's reviewed documents: originals average
  // about 70, her reviewed versions about 86)
  return { id: "grammar", label: LABEL.grammar, max: MAX.grammar, score: round1(decay(MAX.grammar, per100, 2.5)), items };
}

function clarity(body: ParaInfo[], words: number): ScoreCategory {
  const items: ScoreItem[] = [];
  let weight = 0;
  for (const p of body) {
    for (const s of sentences(p.text)) {
      const w = countWords(s.text);
      if (w > LONG_SENTENCE) {
        weight += 1;
        items.push({ message: `Very long sentence (${w} words): split it`, find: s.text.trim().split(/\s+/).slice(0, 8).join(" ") });
      }
    }
    for (const [re, better] of WORDY) {
      const m = re.exec(p.text);
      if (m) {
        weight += 0.5;
        items.push({ message: `Wordy: “${m[0]}” → ${better}`, find: snippet(p.text, m.index, m.index + m[0].length) });
      }
    }
  }
  const per100 = words ? (weight / words) * 100 : 0;
  return { id: "clarity", label: LABEL.clarity, max: MAX.clarity, score: round1(decay(MAX.clarity, per100, 0.6)), items };
}

function formatting(ctx: RuleContext, paras: Para[], styles: StyleResolver): ScoreCategory {
  const f = ctx.config!.format;
  const std = standardOf(f);
  const body = paras.filter((p) => !p.inTable && countWords(p.text) >= 8);
  const items: ScoreItem[] = [];
  const cat = (score: number): ScoreCategory => ({ id: "formatting", label: LABEL.formatting, max: MAX.formatting, score: round1(score), items });
  if (!body.length) return cat(MAX.formatting);

  const fonts = new Map<string, number>();
  const sizes = new Map<number, number>();
  let chars = 0;
  for (const p of body) {
    for (const r of paragraphRuns(p.el)) {
      const len = (r.textContent ?? "").length;
      if (!len) continue;
      const rf = styles.run(p.el, r);
      chars += len;
      fonts.set(rf.font ?? "?", (fonts.get(rf.font ?? "?") ?? 0) + len);
      sizes.set(rf.halfPoints ?? 20, (sizes.get(rf.halfPoints ?? 20) ?? 0) + len);
    }
  }
  const share = <K>(m: Map<K, number>, k: K) => (chars ? (m.get(k) ?? 0) / chars : 1);
  const top = <K>(m: Map<K, number>): [K, number] | null => [...m].sort((a, b) => b[1] - a[1])[0] ?? null;
  const fontName = (k: string) => (k === "theme" ? "the theme font (e.g. Calibri/Aptos)" : k === "?" ? "an unknown font" : k);

  if (f.autoFix.includes(ctx.docType)) {
    // the formatting standard on the Review rules page, 5 points each
    const fontShare = share(fonts, std.font);
    const sizeShare = share(sizes, std.halfPoints);
    const jcShare = body.filter((p) => (styles.para(p.el).jc === "both") === (std.jc === "both")).length / body.length;
    const lineShare = body.filter((p) => (styles.para(p.el).line ?? 240) >= std.minLine).length / body.length;
    const [mainFont] = top(fonts) ?? ["?"];
    const [mainSize] = top(sizes) ?? [20];
    if (fontShare < 0.95) items.push({ message: `Font: most text is in ${fontName(mainFont)}; the standard is ${f.font}` });
    if (sizeShare < 0.95) items.push({ message: `Font size: most text is ${mainSize / 2} pt; the standard is ${f.sizePt} pt` });
    if (jcShare < 0.95) items.push({ message: `Alignment: ${Math.round((1 - jcShare) * 100)}% of paragraphs are not ${f.alignment}` });
    if (lineShare < 0.95) items.push({ message: `Line spacing: ${Math.round((1 - lineShare) * 100)}% of paragraphs are tighter than ${f.minLineSpacing}` });
    return cat(5 * fontShare + 5 * sizeShare + 5 * jcShare + 5 * lineShare);
  }

  // CVs, letters, scripts keep their own format: consistent font and body size
  const [mainFont, fontN] = top(fonts) ?? ["?", 0];
  const [, sizeN] = top(sizes) ?? [20, 0];
  const fontShare = chars ? fontN / chars : 1;
  const sizeShare = chars ? sizeN / chars : 1;
  if (fontShare < 0.9) items.push({ message: `Mixed fonts: only ${Math.round(fontShare * 100)}% of the text is in ${fontName(mainFont)}. Use one font throughout` });
  if (sizeShare < 0.8) items.push({ message: `Mixed text sizes in the body. Keep one size for normal text` });
  return cat(10 * Math.min(1, fontShare / 0.9) + 10 * Math.min(1, sizeShare / 0.8));
}

function structure(ctx: RuleContext, tables: number): ScoreCategory {
  const cfg = ctx.config!;
  const checks: { points: number; ok: boolean; message: string }[] = [];
  const t = ctx.docType;

  if (isNarrative(t)) {
    if (t !== "Essay") {
      const h = headerPresence(ctx);
      checks.push({ points: 3, ok: !!h.title, message: "Header: the document title is missing" });
      checks.push({ points: 3, ok: h.hasName, message: "Header: the applicant’s name is missing" });
      checks.push({ points: 3, ok: h.hasProgram, message: "Header: the program applied for is missing" });
      checks.push({ points: 3, ok: h.hasUniversity, message: "Header: the university applied for is missing" });
    }
    const f = structureFacts(ctx, tables);
    if (t === "Essay") {
      const over = essayOverruns(ctx);
      checks.push({ points: 8, ok: over.length === 0, message: over.map((o) => `The ${o.ordinal} essay is about ${o.words} words; the limit is ${o.limit}`).join(". ") || "Essay over its word limit" });
    } else if (f.limit) {
      checks.push({ points: 6, ok: !f.overLimit, message: `Too long: about ${f.words} words (${f.pages} pages); your limit for a ${t.toLowerCase()} is ${f.limit.maxWords} words` });
    }
    checks.push({ points: 4, ok: !f.unbalanced, message: "Unbalanced paragraphs: some have 7+ sentences, others only 1–2" });
    if (t !== "Essay") checks.push({ points: 3, ok: !f.listHeavy, message: "Bullet points or tables instead of narrative paragraphs" });
    checks.push({ points: 2, ok: f.sections < cfg.builtIn.tooManySections.minSections, message: `Too many numbered sections (${f.sections})` });
  } else if (t === "CV/Resume") {
    const text = ctx.fullText;
    checks.push({ points: 6, ok: /@[\w-]+\.[\w.]+/.test(text), message: "No email address" });
    checks.push({ points: 4, ok: /(?:\+?\d[\d\s().-]{7,}\d)/.test(text), message: "No phone number" });
    checks.push({ points: 6, ok: /\beducation\b/i.test(text) && /\b(experience|employment|work)\b/i.test(text), message: "Missing an Education or Experience section" });
    const notes = inlineEdits(ctx).filter((e) => e.rule === "resume-year" || e.rule === "resume-language");
    checks.push({ points: 6, ok: !notes.some((e) => e.rule === "resume-year"), message: "Experience lines with a duration but no year" });
    checks.push({ points: 4, ok: !notes.some((e) => e.rule === "resume-language"), message: "Language listed without a level" });
    const words = ctx.paras.reduce((n, p) => n + p.words, 0);
    checks.push({ points: 4, ok: words <= 900, message: `Long for a CV (about ${words} words); aim for 1–2 pages` });
  } else {
    const f = structureFacts(ctx, tables);
    checks.push({ points: 6, ok: !f.unbalanced, message: "Unbalanced paragraphs: some have 7+ sentences, others only 1–2" });
    checks.push({ points: 4, ok: f.words >= 80, message: "Very short document" });
  }

  // Karina's own conditional end-note rules ("doesn't mention Taiwan", ...) are content checks
  const conditional = cfg.custom.filter((r) => r.action === "end-note" && r.condition !== "always" && appliesTo(r, t));
  if (conditional.length) {
    const fired = new Set(customEndNotes(ctx).map((n) => n.rule.id));
    const each = 8 / conditional.length;
    for (const r of conditional) checks.push({ points: each, ok: !fired.has(r.id), message: r.label || r.text });
  }

  const total = checks.reduce((n, c) => n + c.points, 0) || 1;
  const got = checks.reduce((n, c) => n + (c.ok ? c.points : 0), 0);
  const items = checks.filter((c) => !c.ok).map((c) => ({ message: c.message }));
  return { id: "structure", label: LABEL.structure, max: MAX.structure, score: round1((got / total) * MAX.structure), items };
}

// ---------------------------------------------------------------------------------------------------------------

/** Score a document state (a .docx, possibly with tracked changes). */
export async function scoreDocx(input: Uint8Array | ArrayBuffer, opts: ScoreOptions): Promise<DocScore> {
  const pkg = await DocxPackage.load(input);
  const doc = await pkg.xml("word/document.xml");
  if (!doc) throw new Error("Not a Word document");
  if (opts.pendingIds?.size) rejectAllRevisions(doc, opts.pendingIds); // open suggestions: as the student wrote it
  acceptAllRevisions(doc); // everything Karina accepted or typed herself
  const styles = new StyleResolver(await pkg.xml("word/styles.xml"));
  const paras = bodyParagraphs(doc);

  // take Karina's notes out: they are instructions, not part of the student's text
  const notes = (opts.notes ?? []).map((n) => n.trim()).filter((n) => n.length > 2);
  const noteParas = new Set(notes);
  const cleaned = paras.map((p) => {
    if (noteParas.has(p.text.trim())) return { ...p, text: "" };
    let text = p.text;
    for (const n of notes) if (text.includes(n)) text = text.split(n).join("");
    return text === p.text ? p : { ...p, text: text.replace(/\s{2,}/g, " ") };
  });
  const ctx = buildContext(opts.fileName, cleaned, opts.docType, opts.rules);
  const body = bodyParas(ctx);
  const words = body.reduce((n, p) => n + p.words, 0);
  const tables = wDescendants(doc, "tbl").length;

  const categories = [
    await grammar(ctx, body, words, opts.openFixes ?? 0),
    clarity(body, words),
    formatting(ctx, paras.filter((p) => !noteParas.has(p.text.trim())), styles),
    structure(ctx, tables),
  ];
  return { total: Math.round(categories.reduce((n, c) => n + c.score, 0)), categories, words, at: new Date().toISOString() };
}
