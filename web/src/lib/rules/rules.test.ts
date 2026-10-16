import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, formatReminder, validateRules, withDefaults, type CustomRule, type RuleConfig } from "./config";
import { detectDocType } from "./detect";
import { endNote } from "./endnote";
import { headerBlock } from "./header";
import { inlineEdits } from "./inline";
import type { DocType, ParaInfo, RuleContext } from "./types";
import { countSentences, countWords } from "./text";

function ctx(texts: string[], docType: DocType = "Study Plan", config?: RuleConfig): RuleContext {
  const paras: ParaInfo[] = texts.map((text, index) => ({
    index,
    text,
    words: countWords(text),
    sentences: countSentences(text),
    inTable: false,
    isList: false,
    isShort: countWords(text) > 0 && countWords(text) < 15 && countSentences(text) <= 1,
  }));
  return { fileName: "x.docx", docType, paras, fullText: texts.join("\n"), config };
}

const apply = (text: string, docType?: DocType, config?: RuleConfig) => {
  const c = ctx([text], docType, config);
  const edits = inlineEdits(c).sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
};

describe("Karina inline rules", () => {
  it("lower-cases degree and field names but keeps proper adjectives", () => {
    expect(apply("I graduated with a Bachelor’s degree in Islamic Financial Management from X.")).toBe(
      "I graduated with a bachelor's degree in Islamic financial management from X.",
    );
    expect(apply("I want to pursue a Master Degree in Taiwan.")).toBe("I want to pursue a master's degree in Taiwan.");
  });

  it("stops the field before program or institution words", () => {
    expect(apply("I will pursue a Bachelor’s degree in International Business Bachelor Program.")).toBe(
      "I will pursue a bachelor's degree in international business Bachelor Program.",
    );
  });

  it("lower-cases after a colon but not after a full stop (Karina's rule)", () => {
    expect(apply("Education: Bachelor’s degree in Finance from X.")).toBe("Education: bachelor's degree in finance from X.");
    expect(apply("I like it. Master’s degree holders are welcome.")).toBe("I like it. Master’s degree holders are welcome.");
  });

  it("does not touch an already lower-case degree or a sentence start", () => {
    expect(apply("I hold a bachelor’s degree in chemistry.")).toBe("I hold a bachelor’s degree in chemistry.");
    expect(apply("Master’s degree holders are welcome.")).toBe("Master’s degree holders are welcome.");
  });

  it("removes a single space before a colon and double spaces mid-sentence", () => {
    expect(apply("Undergraduate Thesis : my research  on SMEs.")).toBe("Undergraduate Thesis: my research on SMEs.");
  });

  it("uses the official Indonesian university name at first mention", () => {
    expect(apply("I studied at Petra Christian University in 2026.")).toBe("I studied at Universitas Kristen Petra Indonesia in 2026.");
    expect(apply("I studied at IPB University.")).toBe("I studied at Institut Pertanian Bogor (IPB) University.");
  });

  it("asks for the real university name instead of 'your university'", () => {
    expect(apply("I want to study at your university.")).toContain("your university (mention the university name");
  });

  it("adds (put the year) to resume lines with a duration but no year", () => {
    expect(apply("Digital Marketing Intern | Real Estate | 6 Months", "CV/Resume")).toBe("Digital Marketing Intern | Real Estate | 6 Months (put the year)");
    expect(apply("Retail staff | Shop | 2024 – 1 year", "CV/Resume")).toBe("Retail staff | Shop | 2024 – 1 year");
  });
});

const withRule = (r: Partial<CustomRule>): RuleConfig => {
  const c = withDefaults(null);
  c.custom = [{ ...c.custom[0], id: "t", enabled: true, docTypes: [], find: "", match: "words", caseSensitive: false, occurrences: "all", condition: "always", words: 0, label: "test", action: "replace", text: "", ...r }];
  return c;
};
const BODY = "I have studied business for four years and I want to continue my studies in a strong program with good teachers.";

describe("rules from the Review rules page", () => {
  it("replace rule keeps a sentence-initial capital", () => {
    const c = withRule({ action: "replace", find: "as long as", text: "if" });
    expect(apply("As long as I work hard, I can do it as long as I try.", "Study Plan", c)).toBe("If I work hard, I can do it if I try.");
  });

  it("whole-word matching does not fire inside other words", () => {
    const c = withRule({ action: "replace", find: "art", text: "arts" });
    expect(apply("I like art and the start of the party.", "Study Plan", c)).toBe("I like arts and the start of the party.");
  });

  it("note rule adds the note after the first match only when asked", () => {
    const c = withRule({ action: "note", find: "scholarship", text: "which scholarship?", occurrences: "first" });
    expect(apply("I want a scholarship. The scholarship helps.", "Study Plan", c)).toBe("I want a scholarship (which scholarship?). The scholarship helps.");
  });

  it("respects the document types a rule is limited to", () => {
    const c = withRule({ action: "replace", find: "hello", text: "hi", docTypes: ["CV/Resume"] });
    expect(apply("hello there", "Study Plan", c)).toBe("hello there");
    expect(apply("hello there", "CV/Resume", c)).toBe("hi there");
  });

  it("end-note rule fires only when its condition holds", () => {
    const c = withRule({ action: "end-note", condition: "missing", find: "scholarship", text: "Do you plan to apply for a scholarship?" });
    const lines = (texts: string[]) => endNote(ctx(texts, "Study Plan", c), { formatDeviated: false, tables: 0 }).flatMap((i) => i.paragraphs.map((p) => p.text));
    expect(lines([BODY])).toContain("Do you plan to apply for a scholarship?");
    expect(lines([BODY + " I hope to get a scholarship."])).not.toContain("Do you plan to apply for a scholarship?");
  });

  it("switching a built-in rule off stops it", () => {
    const c = withDefaults(null);
    c.builtIn.spaceBeforeColon.enabled = false;
    expect(apply("Undergraduate Thesis : my research.", "Study Plan", c)).toBe("Undergraduate Thesis : my research.");
  });

  it("the formatting reminder follows the standard", () => {
    expect(formatReminder(DEFAULT_RULES.format)).toEqual([
      "ALWAYS REMEMBER BASIC WRITING FORMAT", "Font: Times New Roman", "Font Size: 12 pt (Title can be either 14pt or 16pt)",
      "Line Spacing: 1.5", "Alignment: Justified", "Margins: 1 inch (2.54 cm) on all sides", "Page Number: Bottom center or bottom right",
    ]);
  });

  it("refuses rules that would break or fire everywhere", () => {
    expect(validateRules(DEFAULT_RULES)).toEqual([]);
    expect(validateRules(withRule({ action: "replace", find: "(unclosed", match: "pattern", text: "x" })).join()).toMatch(/not valid/);
    expect(validateRules(withRule({ action: "replace", find: "a*", match: "pattern", text: "x" })).join()).toMatch(/empty text/);
    expect(validateRules(withRule({ action: "note", find: "x", text: " " })).join()).toMatch(/note is empty/);
  });
});

describe("document type detection", () => {
  it("handles joined words and underscores in file names", () => {
    expect(detectDocType("StatementofPurpose_TSE NTHU_Someone.docx", [])).toBe("Statement of Purpose");
    expect(detectDocType("StudyPlan_(NAME) NYUST.docx", [])).toBe("Study Plan");
    expect(detectDocType("DONE_X_Autobio_20261011.docx", [])).toBe("Autobiography");
    expect(detectDocType("X_Personal Statement.docx", [])).toBe("Personal Statement");
  });
});

describe("Karina header block", () => {
  it("adds missing title, name, program and university", () => {
    const c = ctx([
      "In all the festivals I have seen online, Taiwan's festivals feel more expressive and joyful than anywhere else I know.",
      "My name is Sari Wijaya and I am applying to National Tsing Hua University because I love technology and science.",
    ], "Autobiography");
    const ins = headerBlock(c);
    const lines = ins.flatMap((i) => i.paragraphs.map((p) => p.text));
    expect(lines).toEqual(["AUTOBIOGRAPHY", "Applicant’s Name: Sari Wijaya", "(Program you applied for)", "National Tsing Hua University"]);
  });

  it("leaves a complete header alone", () => {
    const c = ctx(["STUDY PLAN", "Name: Rina", "Program Applied for: Global MBA", "University Applied for: Southern Taiwan University", "My long body paragraph starts here and continues with many words so it is clearly body text."]);
    expect(headerBlock(c)).toEqual([]);
  });
});
