import { describe, expect, it } from "vitest";
import { headerBlock } from "./header";
import { INLINE_RULES } from "./inline";
import type { DocType, ParaInfo, RuleContext } from "./types";
import { countSentences, countWords } from "./text";

function ctx(texts: string[], docType: DocType = "Study Plan"): RuleContext {
  const paras: ParaInfo[] = texts.map((text, index) => ({
    index,
    text,
    words: countWords(text),
    sentences: countSentences(text),
    inTable: false,
    isList: false,
    isShort: countWords(text) > 0 && countWords(text) < 15 && countSentences(text) <= 1,
  }));
  return { fileName: "x.docx", docType, paras, fullText: texts.join("\n") };
}

const apply = (text: string, docType?: DocType) => {
  const c = ctx([text], docType);
  const edits = INLINE_RULES.flatMap((r) => r(c)).sort((a, b) => b.start - a.start);
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
