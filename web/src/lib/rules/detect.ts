import type { Para } from "../docx/paragraphs";
import { TAIWAN_UNIVERSITIES } from "./data";
import { countSentences, countWords } from "./text";
import type { DocType, ParaInfo, RuleContext } from "./types";

const TYPE_PATTERNS: [RegExp, DocType][] = [
  [/recommendation|reference letter/i, "Recommendation Letter"],
  [/video script|self[- ]introduction video/i, "Video Script"],
  [/personal statement/i, "Personal Statement"],
  [/statement of purpose|\bsop\b/i, "Statement of Purpose"],
  [/study ?plan|research plan/i, "Study Plan"],
  [/autobio/i, "Autobiography"],
  [/resume|curriculum vitae|\bcv\b/i, "CV/Resume"],
  [/essay/i, "Essay"],
];

export function detectDocType(fileName: string, paras: ParaInfo[]): DocType {
  const name = fileName.replace(/[_]+/g, " ").replace(/\.docx?$/i, "");
  for (const [re, t] of TYPE_PATTERNS) if (re.test(name)) return t;
  // Joined words in file names: "StatementofPurpose", "PersonalStatement", "StudyPlan"
  const squashed = name.replace(/[\s\-.()]+/g, "").toLowerCase();
  const JOINED: [string, DocType][] = [
    ["recommendationletter", "Recommendation Letter"], ["videoscript", "Video Script"], ["personalstatement", "Personal Statement"],
    ["statementofpurpose", "Statement of Purpose"], ["studyplan", "Study Plan"], ["researchplan", "Study Plan"],
    ["autobiography", "Autobiography"], ["curriculumvitae", "CV/Resume"],
  ];
  for (const [key, t] of JOINED) if (squashed.includes(key)) return t;
  const head = paras.filter((p) => p.text.trim()).slice(0, 4).map((p) => p.text).join("\n");
  for (const [re, t] of TYPE_PATTERNS) if (re.test(head)) return t;
  return "Unknown";
}

export function buildContext(fileName: string, paras: Para[], docType?: DocType): RuleContext {
  const infos: ParaInfo[] = paras.map((p) => {
    const words = countWords(p.text);
    return {
      index: p.index,
      text: p.text,
      words,
      sentences: countSentences(p.text),
      inTable: p.inTable,
      isList: p.isList,
      isShort: words > 0 && words < 15 && countSentences(p.text) <= 1,
    };
  });
  return {
    fileName,
    docType: docType ?? detectDocType(fileName, infos),
    paras: infos,
    fullText: infos.map((p) => p.text).join("\n"),
  };
}

/** Leading short lines before the first body paragraph (title, name, program, university). */
export function headerZone(ctx: RuleContext): ParaInfo[] {
  const out: ParaInfo[] = [];
  for (const p of ctx.paras) {
    if (!p.text.trim()) continue;
    if (p.inTable || !p.isShort || out.length >= 6) break;
    out.push(p);
  }
  return out;
}

/** Body paragraphs: real prose, not header lines, tables or empty paragraphs. */
export function bodyParas(ctx: RuleContext): ParaInfo[] {
  const header = new Set(headerZone(ctx).map((p) => p.index));
  return ctx.paras.filter((p) => !header.has(p.index) && !p.inTable && p.words >= 15);
}

export function detectName(ctx: RuleContext): string | null {
  const m = ctx.fullText.match(/\bMy (?:full |birth |complete )?name is ([A-Z][\p{L}'’\-]+(?:\s+[A-Z][\p{L}'’\-]+){0,4})/u);
  return m ? m[1] : null;
}

export function detectUniversity(ctx: RuleContext): string | null {
  let best: { name: string; n: number } | null = null;
  for (const u of TAIWAN_UNIVERSITIES) {
    let n = ctx.fullText.split(u.name).length - 1;
    for (const s of u.short) n += (ctx.fullText.match(new RegExp(`\\b${s.replace(/ /g, "\\s")}\\b`, "g")) ?? []).length;
    if (n > 0 && (!best || n > best.n || (n === best.n && u.name.length > best.name.length))) best = { name: u.name, n };
  }
  return best?.name ?? null;
}

export function detectProgram(ctx: RuleContext): string | null {
  const word = "(?:[A-Z][\\p{L}&’'\\-]*|of|and|in|for|&)";
  const patterns = [
    new RegExp(`\\b((?:International |Global )?Master(?:’s|'s)? (?:Program(?:me)?|Degree Program) (?:in|of) ${word}(?:\\s+${word}){0,8})`, "u"),
    new RegExp(`\\b((?:International |Global )?(?:Bachelor|Master) (?:Program(?:me)? )?of ${word}(?:\\s+${word}){0,8})`, "u"),
    new RegExp(`\\b((?:Graduate )?Institute of ${word}(?:\\s+${word}){0,8})`, "u"),
    new RegExp(`\\b(Department of ${word}(?:\\s+${word}){0,8})`, "u"),
    new RegExp(`\\b((?:International |Global )?(?:Master of Business Administration|MBA|IMBA|GMBA)(?: Program(?:me)?)?)`, "u"),
  ];
  for (const re of patterns) {
    const m = ctx.fullText.match(re);
    if (m) return m[1].replace(/\s+(?:of|and|in|for|&)$/u, "").trim();
  }
  return null;
}
