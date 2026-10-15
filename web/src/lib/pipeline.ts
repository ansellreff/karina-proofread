import { acceptAllRevisions } from "./docx/accept";
import { finalizeMetadata } from "./docx/metadata";
import { DocxPackage } from "./docx/package";
import { bodyParagraphs } from "./docx/paragraphs";
import { Reviser, type Identity } from "./docx/revise";
import { StyleResolver } from "./docx/styles";
import { wDescendants } from "./docx/xml";
import { KARINA } from "./identity";
import { buildContext } from "./rules/detect";
import { planFormatting } from "./rules/format";
import { grammarEdits } from "./rules/grammar";
import { runRules } from "./rules/index";
import type { DocType, TextEdit } from "./rules/types";

export interface ProofreadOptions {
  fileName: string;
  docType?: DocType;
  identity?: Identity;
  now?: Date;
  /** Include Harper (offline grammar checker) suggestions, limited to the kinds that match Karina. Default true. */
  grammar?: boolean;
  grammarKinds?: Set<string>;
}

export interface ChangeRecord {
  rule: string;
  kind: "fix" | "note" | "paragraph" | "format";
  paragraph: number;
  /** Offsets in the paragraph's original text (for paragraphs: 0 = before, length = after). */
  start: number;
  end: number;
  before: string;
  after: string;
  beyondStyle?: boolean;
}

export interface ProofreadResult {
  output: Uint8Array;
  docType: DocType;
  acceptedExisting: number;
  formatting: { deviated: boolean; found: Record<string, unknown>; runs: number; paragraphs: number };
  changes: ChangeRecord[];
}

export async function proofreadDocx(input: Uint8Array | ArrayBuffer, opts: ProofreadOptions): Promise<ProofreadResult> {
  const identity = opts.identity ?? KARINA;
  const now = opts.now ?? new Date();
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

  const reviser = new Reviser(doc, identity, now);
  const changes: ChangeRecord[] = [];

  // 1. formatting (before text edits, so inserted text inherits the new formatting)
  for (const { run, change } of format.runs) reviser.formatRun(run, change);
  for (const { p, change } of format.paras) reviser.formatParagraph(p, change);

  // 2. text edits, last offset first within each paragraph
  const byPara = new Map<number, TextEdit[]>();
  for (const e of rules.edits) byPara.set(e.para, [...(byPara.get(e.para) ?? []), e]);
  for (const [index, edits] of byPara) {
    const p = paras[index];
    for (const e of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      reviser.replace(p.el, e.start, e.end, e.text);
      changes.push({ rule: e.rule, kind: e.kind, paragraph: index, start: e.start, end: e.end, before: p.text.slice(e.start, e.end), after: e.text, beyondStyle: e.beyondStyle });
    }
  }

  // 3. new paragraphs (header block, end note)
  for (const ins of rules.inserts) {
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
    acceptedExisting,
    formatting: { deviated: format.deviated, found: format.found, runs: format.runs.length, paragraphs: format.paras.length },
    changes: changes.sort((a, b) => a.paragraph - b.paragraph),
  };
}
