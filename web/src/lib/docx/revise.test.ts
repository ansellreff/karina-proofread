import { describe, expect, it } from "vitest";
import { acceptAllRevisions } from "./accept";
import { bodyParagraphs, paragraphText } from "./paragraphs";
import { rejectAllRevisions } from "./reject";
import { Reviser, type Identity } from "./revise";
import { parseXml, serializeXml, wChild, wDescendants, type Document } from "./xml";

const ID: Identity = { author: "Karina Octavia", utcOffsetMinutes: 480 };
const NOW = new Date("2026-10-16T05:33:20Z");

const run = (text: string, rPr = "") => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;
const docXml = (bodyXml: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" mc:Ignorable=""><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`;

const texts = (doc: Document) => bodyParagraphs(doc).map((p) => p.text);
const roundTrip = (doc: Document) => parseXml(serializeXml(doc));
function accepted(doc: Document) {
  const d = roundTrip(doc);
  acceptAllRevisions(d);
  return texts(d);
}
function rejected(doc: Document) {
  const d = roundTrip(doc);
  rejectAllRevisions(d);
  return texts(d);
}

describe("Reviser text edits", () => {
  it("replaces text inside a single run", () => {
    const doc = parseXml(docXml(para(run("I want to actually applying the strategies."))));
    const p = bodyParagraphs(doc)[0].el;
    new Reviser(doc, ID, NOW).replace(p, 10, 27, "applying");
    expect(accepted(doc)).toEqual(["I want to applying the strategies."]);
    expect(rejected(doc)).toEqual(["I want to actually applying the strategies."]);
  });

  it("handles edits spanning several runs and keeps formatting of the first run", () => {
    const doc = parseXml(docXml(para(run("a Bachelor’s "), run("degree in ", "<w:b/>"), run("Chemistry from X"))));
    const p = bodyParagraphs(doc)[0].el;
    new Reviser(doc, ID, NOW).replace(p, 2, 32, "bachelor's degree in chemistry");
    expect(accepted(doc)).toEqual(["a bachelor's degree in chemistry from X"]);
    expect(rejected(doc)).toEqual(["a Bachelor’s degree in Chemistry from X"]);
  });

  it("applies several edits right to left on one paragraph", () => {
    const doc = parseXml(docXml(para(run("Name : Sinta.  Thesis : AI."))));
    const p = bodyParagraphs(doc)[0].el;
    const r = new Reviser(doc, ID, NOW);
    r.replace(p, 21, 23, ":"); // "Thesis :" -> "Thesis:"
    r.replace(p, 13, 15, " "); // double space
    r.replace(p, 4, 6, ":");
    expect(accepted(doc)).toEqual(["Name: Sinta. Thesis: AI."]);
    expect(rejected(doc)).toEqual(["Name : Sinta.  Thesis : AI."]);
  });

  it("inserts notes at start, middle and end", () => {
    const doc = parseXml(docXml(para(run("English"), run(", Indonesian"))));
    const p = bodyParagraphs(doc)[0].el;
    const r = new Reviser(doc, ID, NOW);
    r.insertAt(p, 19, " (how’s the level)");
    r.insertAt(p, 7, " (native)");
    r.insertAt(p, 0, "Languages: ");
    expect(accepted(doc)).toEqual(["Languages: English (native), Indonesian (how’s the level)"]);
    expect(rejected(doc)).toEqual(["English, Indonesian"]);
  });

  it("keeps Chinese characters and tabs intact", () => {
    const doc = parseXml(docXml(`<w:p><w:r><w:tab/><w:t xml:space="preserve">我的名字 is 明霞 and more</w:t></w:r></w:p>`));
    const p = bodyParagraphs(doc)[0].el;
    new Reviser(doc, ID, NOW).insertAt(p, 11, " (no family name?)");
    expect(accepted(doc)).toEqual(["\t我的名字 is 明霞 (no family name?) and more"]);
    expect(rejected(doc)).toEqual(["\t我的名字 is 明霞 and more"]);
  });

  it("edits text inside table cells", () => {
    const doc = parseXml(docXml(`<w:tbl><w:tr><w:tc><w:p>${run("Managemnt")}</w:p></w:tc></w:tr></w:tbl>`));
    const p = bodyParagraphs(doc)[0];
    expect(p.inTable).toBe(true);
    new Reviser(doc, ID, NOW).replace(p.el, 0, 9, "Management");
    expect(accepted(doc)).toEqual(["Management"]);
    expect(rejected(doc)).toEqual(["Managemnt"]);
  });

  it("stamps revisions like Word: author, local date with Z, unique ids", () => {
    const doc = parseXml(docXml(para(run("one two three"))));
    const p = bodyParagraphs(doc)[0].el;
    const r = new Reviser(doc, ID, NOW);
    r.replace(p, 8, 13, "3");
    r.replace(p, 0, 3, "1");
    const revs = [...wDescendants(doc, "ins"), ...wDescendants(doc, "del")];
    expect(revs.every((e) => e.getAttribute("w:author") === "Karina Octavia")).toBe(true);
    expect(revs[0].getAttribute("w:date")).toBe("2026-10-16T13:33:00Z");
    expect(revs[0].getAttribute("w16du:dateUtc")).toBe("2026-10-16T05:33:00Z");
    const ids = revs.map((e) => e.getAttribute("w:id"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Reviser paragraphs", () => {
  it("inserts a header block at the top", () => {
    const doc = parseXml(docXml(para(run("My name is Budi."))));
    const first = bodyParagraphs(doc)[0].el;
    new Reviser(doc, ID, NOW).insertParagraphsBefore(first, [{ text: "AUTOBIOGRAPHY", bold: true, align: "center" }, { text: "Applicant’s Name: Budi" }]);
    expect(accepted(doc)).toEqual(["AUTOBIOGRAPHY", "Applicant’s Name: Budi", "My name is Budi."]);
    expect(rejected(doc)).toEqual(["My name is Budi."]);
  });

  it("appends a note block after the last paragraph and rejects back to the original", () => {
    const doc = parseXml(docXml(para(run("Intro.")) + para(run("Closing."))));
    const last = bodyParagraphs(doc)[1].el;
    new Reviser(doc, ID, NOW).insertParagraphsAfter(last, [{ text: "Note:" }, { text: "Font: Times New Roman" }, { text: "Alignment: Justified" }]);
    expect(accepted(doc)).toEqual(["Intro.", "Closing.", "Note:", "Font: Times New Roman", "Alignment: Justified"]);
    expect(rejected(doc)).toEqual(["Intro.", "Closing."]);
  });

  it("deletes a whole paragraph", () => {
    const doc = parseXml(docXml(para(run("Keep.")) + para(run("My name is X, a grade 12 student.")) + para(run("Body."))));
    new Reviser(doc, ID, NOW).deleteParagraph(bodyParagraphs(doc)[1].el);
    expect(accepted(doc)).toEqual(["Keep.", "Body."]);
    expect(rejected(doc)).toEqual(["Keep.", "My name is X, a grade 12 student.", "Body."]);
  });
});

describe("Reviser formatting", () => {
  it("records font/size changes in schema order and restores them on reject", () => {
    const doc = parseXml(docXml(para(run("Body text", `<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:i/><w:sz w:val="22"/>`))));
    const p = bodyParagraphs(doc)[0].el;
    const r = new Reviser(doc, ID, NOW);
    const runEl = wDescendants(p, "r")[0];
    r.formatRun(runEl, { font: "Times New Roman", halfPoints: 24 });
    r.formatParagraph(p, { jc: "both", line: 360 });
    const rPr = wChild(runEl, "rPr")!;
    const order = Array.from(rPr.childNodes).map((n) => (n as { localName?: string }).localName);
    expect(order).toEqual(["rFonts", "i", "sz", "szCs", "rPrChange"]);
    expect(wChild(rPr, "rFonts")!.getAttribute("w:ascii")).toBe("Times New Roman");
    expect(wChild(rPr, "rFonts")!.hasAttribute("w:asciiTheme")).toBe(false);

    const d = roundTrip(doc);
    rejectAllRevisions(d);
    const back = wChild(wDescendants(d, "r")[0], "rPr")!;
    expect(wChild(back, "rFonts")!.getAttribute("w:asciiTheme")).toBe("minorHAnsi");
    expect(wChild(back, "sz")!.getAttribute("w:val")).toBe("22");
    expect(wChild(wDescendants(d, "p")[0], "pPr")?.getElementsByTagName("w:jc").length ?? 0).toBe(0);
  });

  it("splitting a formatted run keeps revision ids unique", () => {
    const doc = parseXml(docXml(para(run("alpha beta gamma"))));
    const p = bodyParagraphs(doc)[0].el;
    const r = new Reviser(doc, ID, NOW);
    r.formatRun(wDescendants(p, "r")[0], { font: "Times New Roman" });
    r.replace(p, 6, 10, "BETA");
    const ids = ["ins", "del", "rPrChange"].flatMap((n) => wDescendants(doc, n)).map((e) => e.getAttribute("w:id"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(accepted(doc)).toEqual(["alpha BETA gamma"]);
    // live text excludes runs inside tracked changes, so offsets before an edit stay valid
    expect(paragraphText(p)).toBe("alpha  gamma");
  });
});
