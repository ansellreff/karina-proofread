import { detectName, detectProgram, detectUniversity, headerZone } from "./detect";
import { NARRATIVE, rulesOf, type ParagraphInsert, type RuleContext } from "./types";

const TITLE_RE = /study plan|autobiograph|personal statement|statement of purpose|essay|research plan|motivation letter/i;
const NAME_RE = /\b(name|applicant)\b/i;
const PROGRAM_RE = /program|programme|master|bachelor|degree|department|institute|major|\bmba\b|ph\.?d|applied for/i;
const UNIV_RE = /universit|institute of technology|college|\b(NTU|NCKU|NTHU|NYCU|NCCU|NTUST|NTNU|NSYSU|NCU|YZU|NDHU|STUST|NKUST|NCUE)\b/i;
const looksLikeName = (t: string) => /^\s*[A-Z][\p{L}'’\-]+(?:\s+[A-Z][\p{L}'’\-]+){1,4}\s*(\(.*\))?\s*$/u.test(t) && !TITLE_RE.test(t) && !PROGRAM_RE.test(t) && !UNIV_RE.test(t);

/**
 * Karina's header block: title, applicant name, program applied for, university.
 * Missing lines are added; unknown values are left as prompts for the student ("????").
 */
export function headerBlock(ctx: RuleContext): ParagraphInsert[] {
  const cfg = rulesOf(ctx).builtIn.headerBlock;
  if (!cfg.enabled || !NARRATIVE.includes(ctx.docType)) return [];
  const header = headerZone(ctx);
  const first = ctx.paras.find((p) => p.text.trim());
  if (!first) return [];

  const title = header.find((p) => TITLE_RE.test(p.text));
  const rest = header.filter((p) => p !== title);
  const hasName = rest.some((p) => NAME_RE.test(p.text) || looksLikeName(p.text));
  const hasProgram = rest.some((p) => PROGRAM_RE.test(p.text));
  const hasUniversity = rest.some((p) => UNIV_RE.test(p.text));

  const lines: { text: string }[] = [];
  if (!hasName) {
    const name = detectName(ctx);
    lines.push({ text: name ? `Applicant’s Name: ${name}` : "Applicant’s Name: ????" });
  }
  if (!hasProgram) {
    const program = detectProgram(ctx);
    lines.push({ text: program ? `Applied for: ${program}` : "(Program you applied for)" });
  }
  if (!hasUniversity) {
    const univ = detectUniversity(ctx);
    lines.push({ text: univ ?? "(University you applied for)" });
  }

  const out: ParagraphInsert[] = [];
  const titleText = cfg.titles[ctx.docType]?.trim();
  if (!title && titleText) {
    out.push({ position: "before", para: first.index, paragraphs: [{ text: titleText, bold: true, align: "center" }], rule: "header-title" });
  }
  if (lines.length) {
    const anchor = header.length ? header[header.length - 1] : null;
    out.push(
      anchor
        ? { position: "after", para: anchor.index, paragraphs: lines, rule: "header-fields" }
        : { position: "before", para: first.index, paragraphs: lines, rule: "header-fields" },
    );
  }
  return out;
}
