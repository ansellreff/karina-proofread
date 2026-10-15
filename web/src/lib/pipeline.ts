import { AnthropicReviewClient, type Effort, type ReviewClient } from "./ai/claude";
import { costOf, estimateCost, type CostEstimate, type Usage } from "./ai/cost";
import { editKey, mapReview } from "./ai/map";
import { systemPrompt, userPrompt } from "./ai/prompt";
import { acceptAllRevisions } from "./docx/accept";
import { finalizeMetadata } from "./docx/metadata";
import { DocxPackage } from "./docx/package";
import { bodyParagraphs, type Para } from "./docx/paragraphs";
import { Reviser, type Identity } from "./docx/revise";
import { StyleResolver } from "./docx/styles";
import { wDescendants, type Document } from "./docx/xml";
import { KARINA } from "./identity";
import { buildContext } from "./rules/detect";
import { planFormatting, type FormatPlan } from "./rules/format";
import { grammarEdits } from "./rules/grammar";
import { resolveOverlaps, runRules } from "./rules/index";
import type { DocType, ParagraphInsert, RuleContext, RuleOutput, TextEdit } from "./rules/types";

export const DEFAULT_MODEL = "claude-opus-5-5";

export interface AiOptions {
  model?: string;
  effort?: Effort;
  client?: ReviewClient;
}

export interface ProofreadOptions {
  fileName: string;
  docType?: DocType;
  identity?: Identity;
  now?: Date;
  /** Include Harper (offline grammar checker) suggestions, limited to the kinds that match Karina. Default true. */
  grammar?: boolean;
  grammarKinds?: Set<string>;
  /** Claude layer. Omit or false for the rules engine only. */
  ai?: AiOptions | false;
}

export interface ChangeRecord {
  rule: string;
  kind: "fix" | "note" | "paragraph" | "format" | "delete";
  paragraph: number;
  /** Offsets in the paragraph's original text (for paragraphs: 0 = before, length = after). */
  start: number;
  end: number;
  before: string;
  after: string;
  beyondStyle?: boolean;
  /** Private explanation for the review panel (AI edits). Never written into the document. */
  reason?: string;
}

export interface AiReport {
  model: string;
  usage: Usage;
  costUsd: number;
  dropped: { what: string; why: string }[];
}

export interface ProofreadResult {
  output: Uint8Array;
  docType: DocType;
  acceptedExisting: number;
  formatting: { deviated: boolean; found: Record<string, unknown>; runs: number; paragraphs: number };
  changes: ChangeRecord[];
  ai?: AiReport;
}

interface Prepared {
  pkg: DocxPackage;
  doc: Document;
  paras: Para[];
  ctx: RuleContext;
  format: FormatPlan;
  rules: RuleOutput;
  acceptedExisting: number;
}

async function prepare(input: Uint8Array | ArrayBuffer, opts: ProofreadOptions): Promise<Prepared> {
  const pkg = await DocxPackage.load(input);
  const doc = await pkg.xml("word/document.xml");
  if (!doc) throw new Error("Not a Word document (word/document.xml missing)");
  const acceptedExisting = acceptAllRevisions(doc);
  const styles = new StyleResolver(await pkg.xml("word/styles.xml"));
  const paras = bodyParagraphs(doc);
  const ctx = buildContext(opts.fileName, paras, opts.docType);
  const format = planFormatting(ctx, paras, styles);
  const extra: TextEdit[] = opts.grammar === false ? [] : await grammarEdits(ctx, opts.grammarKinds);
  const rules = runRules(ctx, { formatDeviated: format.deviated, tables: wDescendants(doc, "tbl").length }, extra);
  return { pkg, doc, paras, ctx, format, rules, acceptedExisting };
}

function ruleChangeRecords(p: Prepared): ChangeRecord[] {
  const recs: ChangeRecord[] = p.rules.edits.map((e) => ({
    rule: e.rule, kind: e.kind, paragraph: e.para, start: e.start, end: e.end,
    before: p.paras[e.para].text.slice(e.start, e.end), after: e.text, beyondStyle: e.beyondStyle,
  }));
  for (const ins of p.rules.inserts) {
    const at = ins.position === "before" ? 0 : p.paras[ins.para].text.length;
    for (const np of ins.paragraphs) recs.push({ rule: ins.rule, kind: "paragraph", paragraph: ins.para, start: at, end: at, before: "", after: np.text });
  }
  return recs;
}

/** Pre-run token and cost estimate for the Claude layer (uses the free token-counting endpoint). */
export async function estimateAiCost(input: Uint8Array | ArrayBuffer, opts: ProofreadOptions): Promise<CostEstimate> {
  const p = await prepare(input, opts);
  const ai = opts.ai || {};
  const model = ai.model ?? DEFAULT_MODEL;
  const client = ai.client ?? new AnthropicReviewClient();
  const counted = await client.countTokens({ system: systemPrompt(), user: userPrompt(p.ctx, ruleChangeRecords(p)), model });
  const words = p.ctx.paras.reduce((n, x) => n + x.words, 0);
  return estimateCost(model, counted.total, counted.system, words);
}

export async function proofreadDocx(input: Uint8Array | ArrayBuffer, opts: ProofreadOptions): Promise<ProofreadResult> {
  const identity = opts.identity ?? KARINA;
  const now = opts.now ?? new Date();
  const p = await prepare(input, opts);
  const { pkg, doc, paras, ctx, format, rules } = p;

  // ---- Claude layer: sees the document plus what the rules already did; rules win any overlap.
  let edits = rules.edits;
  let inserts: ParagraphInsert[] = rules.inserts;
  let deletions: { para: number; reason: string }[] = [];
  const reasons = new Map<string, string>();
  let aiReport: AiReport | undefined;
  if (opts.ai) {
    const model = opts.ai.model ?? DEFAULT_MODEL;
    const client = opts.ai.client ?? new AnthropicReviewClient();
    const res = await client.review({ system: systemPrompt(), user: userPrompt(ctx, ruleChangeRecords(p)), model, effort: opts.ai.effort ?? "high" });
    const mapped = mapReview(res.review, ctx);
    deletions = mapped.deletions;
    for (const [k, v] of mapped.reasons) reasons.set(k, v);
    // Rule edits inside a paragraph the AI cuts are moot; they are filtered out below.
    inserts = [...rules.inserts, ...mapped.inserts];
    if (mapped.endNoteItems.length) {
      const note = inserts.find((i) => i.rule === "end-note");
      const items = mapped.endNoteItems.map((text) => ({ text }));
      if (note) note.paragraphs.push(...items);
      else {
        const last = [...ctx.paras].reverse().find((x) => x.text.trim());
        if (last) inserts.push({ position: "after", para: last.index, paragraphs: [{ text: "Note:" }, ...items], rule: "end-note" });
      }
    }
    // A paragraph that new paragraphs attach to cannot also be cut (both would change its paragraph mark).
    const anchors = new Set(inserts.filter((i) => i.position === "after").map((i) => i.para));
    for (const d of deletions.filter((d) => anchors.has(d.para))) mapped.dropped.push({ what: `delete P${d.para}`, why: "paragraph anchors inserted text" });
    deletions = deletions.filter((d) => !anchors.has(d.para));
    const deleted = new Set(deletions.map((d) => d.para));
    edits = resolveOverlaps([...rules.edits, ...mapped.edits]).filter((e) => !deleted.has(e.para));
    aiReport = { model: res.model, usage: res.usage, costUsd: costOf(res.usage, model), dropped: mapped.dropped };
  }

  const reviser = new Reviser(doc, identity, now);
  const changes: ChangeRecord[] = [];

  // 1. formatting (before text edits, so inserted text inherits the new formatting)
  for (const { run, change } of format.runs) reviser.formatRun(run, change);
  for (const { p: para, change } of format.paras) reviser.formatParagraph(para, change);

  // 2. text edits, last offset first within each paragraph
  const byPara = new Map<number, TextEdit[]>();
  for (const e of edits) byPara.set(e.para, [...(byPara.get(e.para) ?? []), e]);
  for (const [index, list] of byPara) {
    const para = paras[index];
    for (const e of list.sort((a, b) => b.start - a.start || b.end - a.end)) {
      reviser.replace(para.el, e.start, e.end, e.text);
      changes.push({
        rule: e.rule, kind: e.kind, paragraph: index, start: e.start, end: e.end,
        before: para.text.slice(e.start, e.end), after: e.text, beyondStyle: e.beyondStyle, reason: reasons.get(editKey(e)),
      });
    }
  }

  // 3. whole-paragraph cuts
  for (const d of deletions) {
    reviser.deleteParagraph(paras[d.para].el);
    changes.push({ rule: "ai:delete", kind: "delete", paragraph: d.para, start: 0, end: paras[d.para].text.length, before: paras[d.para].text, after: "", reason: d.reason });
  }

  // 4. new paragraphs: the end note first, so later "after" inserts land before it
  const ordered = [...inserts.filter((i) => i.rule === "end-note"), ...inserts.filter((i) => i.rule !== "end-note")];
  for (const ins of ordered) {
    const ref = paras[ins.para].el;
    if (ins.position === "before") reviser.insertParagraphsBefore(ref, ins.paragraphs);
    else reviser.insertParagraphsAfter(ref, ins.paragraphs);
    const at = ins.position === "before" ? 0 : paras[ins.para].text.length;
    for (const np of ins.paragraphs) changes.push({ rule: ins.rule, kind: "paragraph", paragraph: ins.para, start: at, end: at, before: "", after: np.text });
  }

  await finalizeMetadata(pkg, identity, now);
  return {
    output: await pkg.save(),
    docType: ctx.docType,
    acceptedExisting: p.acceptedExisting,
    formatting: { deviated: format.deviated, found: format.found, runs: format.runs.length, paragraphs: format.paras.length },
    changes: changes.sort((a, b) => a.paragraph - b.paragraph || a.start - b.start),
    ai: aiReport,
  };
}
