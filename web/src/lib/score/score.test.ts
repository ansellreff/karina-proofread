import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { withDefaults } from "../rules/config";
import { scoreDocx } from "./score";

const p = (text: string, rPr = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>') =>
  `<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

async function docx(paras: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join("")}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

const BODY = [
  p("STUDY PLAN"),
  p("Applicant’s Name: Sari Wijaya"),
  p("Applied for: Master Program in Information Management"),
  p("National Taiwan University of Science and Technology"),
  p("I graduated from a university in Indonesia with a degree in computer science. During my studies I built several small web applications for local businesses. These projects taught me how software can help people work better. I also learned to work in a team and to explain technical ideas clearly."),
  p("In the first year I will take core courses in data analysis and information systems. In the second year I will write my thesis on digital tools for small enterprises. After graduation I want to build a career as a consultant for small companies in Indonesia. Studying in Taiwan will give me the international experience I need for this goal."),
];
const rules = withDefaults(null);
const opts = { fileName: "StudyPlan_test.docx", docType: "Study Plan" as const, rules };

describe("document score", () => {
  it("gives a well-formed, complete document a high score", async () => {
    const s = await scoreDocx(await docx(BODY), opts);
    expect(s.categories.find((c) => c.id === "formatting")!.score).toBe(20);
    expect(s.categories.find((c) => c.id === "structure")!.items).toEqual([]);
    expect(s.total).toBeGreaterThanOrEqual(90);
  });

  it("counts open bot fixes as grammar problems until they are decided", async () => {
    const file = await docx(BODY);
    const open = await scoreDocx(file, { ...opts, openFixes: 6 });
    const done = await scoreDocx(file, opts);
    expect(open.total).toBeLessThan(done.total);
    expect(open.categories[0].items[0].message).toMatch(/6 suggested fixes still open/);
  });

  it("checks the formatting standard and the header lines", async () => {
    const s = await scoreDocx(await docx(BODY.slice(4).map((x) => x.replace(/Times New Roman/g, "Calibri"))), opts);
    expect(s.categories.find((c) => c.id === "formatting")!.items.map((i) => i.message).join()).toMatch(/Calibri/);
    expect(s.categories.find((c) => c.id === "structure")!.items.map((i) => i.message).join()).toMatch(/title is missing/);
  });

  it("leaves Karina’s notes out: a note mentioning Taiwan doesn't answer “Why Taiwan?”", async () => {
    const noTaiwan = BODY.map((x) => x.replace("Studying in Taiwan", "Studying abroad").replace("National Taiwan University of Science and Technology", "National Central University"));
    const note = "Why Taiwan? You didn’t mention why you chose Taiwan. What motivates you to pursue a degree in Taiwan?";
    const file = await docx([...noTaiwan, p("Note:"), p(note)]);
    const missing = (s: Awaited<ReturnType<typeof scoreDocx>>) => s.categories.find((c) => c.id === "structure")!.items.some((i) => /Taiwan/.test(i.message));
    expect(missing(await scoreDocx(file, opts))).toBe(false); // the note is counted as text
    expect(missing(await scoreDocx(file, { ...opts, notes: ["Note:", note] }))).toBe(true);
  });
});
