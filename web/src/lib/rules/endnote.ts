import { bodyParas } from "./detect";
import { countWords } from "./text";
import { NARRATIVE, type ParagraphInsert, type RuleContext } from "./types";

const WORDS_PER_PAGE = 400; // Times New Roman 12 pt, 1.5 spacing, 1" margins
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

/** Karina's standard formatting reminder (as written in her October 2026 reviews). */
export const FORMAT_REMINDER = [
  "ALWAYS REMEMBER BASIC WRITING FORMAT",
  "Font: Times New Roman",
  "Font Size: 12 pt (Title can be either 14pt or 16pt)",
  "Line Spacing: 1.5",
  "Alignment: Justified",
  "Margins: 1 inch (2.54 cm) on all sides",
  "Page Number: Bottom center or bottom right",
];

export interface EndNoteOptions {
  /** Body formatting deviated from Times New Roman 12 / justified / 1.15–1.5. */
  formatDeviated: boolean;
  tables: number;
}

function essayLimits(ctx: RuleContext): string[] {
  const out: string[] = [];
  const prompts = ctx.paras.filter((p) => /\(\s*(\d{3,4})\s*words?\s*max(?:imum)?\s*\)|max(?:imum)?\.?\s*(\d{3,4})\s*words/i.test(p.text));
  prompts.forEach((prompt, i) => {
    const m = /(\d{3,4})\s*words?\s*max|max(?:imum)?\.?\s*(\d{3,4})\s*words/i.exec(prompt.text)!;
    const limit = Number(m[1] ?? m[2]);
    const next = prompts[i + 1]?.index ?? Infinity;
    const answer = ctx.paras.filter((p) => p.index > prompt.index && p.index < next && !/^\s*ESSAY\b/i.test(p.text));
    const words = answer.reduce((n, p) => n + countWords(p.text), 0);
    if (words > limit) {
      out.push(`The ${ORDINAL[i] ?? `${i + 1}th`} essay exceeds the max words of ${limit}. Please check again, I found it is around ${Math.round(words / 10) * 10} words.`);
    }
  });
  return out;
}

/** The "Note:" block Karina adds at the end of almost every document. */
export function endNote(ctx: RuleContext, opts: EndNoteOptions): ParagraphInsert[] {
  const items: string[] = [];
  const last = [...ctx.paras].reverse().find((p) => p.text.trim()) ?? ctx.paras[ctx.paras.length - 1];
  if (!last) return [];

  if (ctx.docType === "CV/Resume") {
    items.push("Could you send me the guidelines from the uni for the resume? If not, try to make it with Resume builder with ATS Friendly Concept.");
  }

  if (NARRATIVE.includes(ctx.docType)) {
    const body = bodyParas(ctx);
    const words = body.reduce((n, p) => n + p.words, 0);
    const pages = Math.max(1, Math.round((words / WORDS_PER_PAGE) * 2) / 2);
    const text = ctx.fullText;

    if (opts.formatDeviated) items.push(...FORMAT_REMINDER);

    if (ctx.docType === "Essay") {
      items.push(...essayLimits(ctx));
    } else if (ctx.docType === "Study Plan" && (words > 1100 || pages > 3)) {
      items.push(`Please check again the max required pages for the study plan in the guidebook. If not mentioned, usually 2-3 pages (4 pages max) or around 1000 words. This one is around ${pages} pages (${words} words), try to make it shorter, compact and straight forward.`);
    } else if (ctx.docType === "Autobiography" && words > 850) {
      items.push(`Usually, autobio consists of only 1-2 pages. This one is around ${pages} pages, if you can shorten it into 2 pages, it will be good.`);
    } else if ((ctx.docType === "Personal Statement" || ctx.docType === "Statement of Purpose") && words > 850) {
      items.push("Please check in the guidebook about the number of pages or words. If not mentioned, try to make it into 2 pages max.");
    } else {
      items.push("Please check in the guidebook whether they specified certain limitation of pages or words. If not, you can proceed.");
    }

    const prose = body.filter((p) => !p.isList);
    if (prose.some((p) => p.sentences >= 7) && prose.some((p) => p.sentences <= 2)) {
      items.push("Try to balance the number of sentences in each paragraph, I found some paragraphs are very long but others are just 1-2 sentences. For each paragraph, try to write min. 3 sentences and max 5-6 sentences.");
    }

    const listParas = ctx.paras.filter((p) => p.isList && p.words > 0).length;
    if (ctx.docType !== "Essay" && (opts.tables > 0 || listParas >= 5)) {
      items.push("It is better to make narrative paragraphs rather than bullet points or tables, could save you more space and feel more personal.");
    }

    const sections = ctx.paras.filter((p) => p.isShort && /^\s*(?:\d+\.|[IVX]+\.)\s+\p{Lu}/u.test(p.text)).length;
    if (sections >= 6) {
      items.push(`Does the university ask you to make it into ${sections} points? Try to make it shorter, only into 3-4 points max.`);
    }

    if (ctx.docType === "Study Plan" && !/\b(first|second|1st|2nd)[- ]year\b|\byear\s*[12]\b|\b(first|second|1st|2nd) semester\b/i.test(text)) {
      items.push("What are you going to do during your studies? 1st year, 2nd year, you must put in detail to convince the committee that you have good preparation.");
    }
    if (ctx.docType !== "Essay" && !/\bTaiwan/i.test(body.map((p) => p.text).join(" "))) {
      items.push("Why Taiwan? You didn’t mention why you chose Taiwan. What motivates you to pursue a degree in Taiwan?");
    }
    if ((ctx.docType === "Study Plan" || ctx.docType === "Personal Statement" || ctx.docType === "Statement of Purpose") &&
      !/after (?:graduat|completing|finishing)|\bfuture\b|\bcareer\b|long[- ]term|short[- ]term/i.test(text)) {
      items.push("How’s your plan in the future? How will studying this major help you to find a suitable career or job?");
    }
  }

  if (!items.length) return [];
  return [{ position: "after", para: last.index, paragraphs: [{ text: "Note:" }, ...items.map((text) => ({ text }))], rule: "end-note" }];
}
