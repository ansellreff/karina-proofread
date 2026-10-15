import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { acceptAllRevisions } from "../docx/accept";
import { bodyParagraphs } from "../docx/paragraphs";
import { rejectAllRevisions } from "../docx/reject";
import { parseXml, wDescendants } from "../docx/xml";
import { proofreadDocx } from "../pipeline";
import { buildContext } from "../rules/detect";
import type { ReviewClient } from "./claude";
import { costOf, estimateCost } from "./cost";
import { locate, mapReview, minimalDiff, wordHunks } from "./map";
import type { Review } from "./schema";

const run = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" mc:Ignorable=""><w:body>${paragraphs.map((p) => `<w:p>${run(p)}</w:p>`).join("")}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}
async function texts(docx: Uint8Array, mode: "accept" | "reject") {
  const zip = await JSZip.loadAsync(docx);
  const doc = parseXml(await zip.file("word/document.xml")!.async("string"));
  if (mode === "accept") acceptAllRevisions(doc);
  else rejectAllRevisions(doc);
  return bodyParagraphs(doc).map((p) => p.text).filter((t) => t);
}

const DOC = [
  "STUDY PLAN",
  "Applicant’s Name: Sinta Pratiwi",
  "Applied for: Master of Information Management",
  "National Taiwan University",
  "My name is Sinta Pratiwi, a fresh graduate from Jakarta who wants to continue to a master degree in Taiwan next year.",
  "Initially, I worked as crew at an event planner, where I have to record all expenses and prepare monthly reports for the owner.",
  "After graduation, I hope to work as a data analyst in a multinational company and later contribute to Indonesia.",
];

const fakeReview: Review = {
  replacements: [
    { paragraph: 5, find: "Initially, I worked as crew", replace: "At first, I worked as a crew member", beyond_style: false, reason: "article + Karina's 'At first'" },
    { paragraph: 5, find: "I have to record", replace: "I must record", beyond_style: false, reason: "concision" },
    { paragraph: 5, find: "text that is not there", replace: "x", beyond_style: false, reason: "should be dropped" },
  ],
  insertions: [
    { paragraph: 6, after: "multinational company", text: " (which industry? put a bit detail ya)", kind: "note", beyond_style: false, reason: "vague goal" },
  ],
  paragraph_deletions: [{ paragraph: 4, reason: "generic intro; header already gives the name" }],
  suggestion_paragraphs: [{ after_paragraph: 5, text: "Suggestion: explain how this experience connects to the program you applied for." }],
  end_note_items: ["Why Taiwan? What motivates you to pursue a degree in Taiwan?"],
};

class FakeClient implements ReviewClient {
  calls = 0;
  async countTokens() {
    return { total: 9000, system: 8000 };
  }
  async review() {
    this.calls++;
    return { review: fakeReview, usage: { input_tokens: 1000, output_tokens: 4000, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0 }, model: "claude-opus-5-5" };
  }
}

describe("AI mapping helpers", () => {
  it("locates text with curly/straight quote and spacing differences", () => {
    expect(locate("Karina’s  note here", "Karina's note")).toEqual([0, 14]);
    expect(locate("abc", "zzz")).toBeNull();
  });

  it("shrinks replacements to the changed words", () => {
    expect(minimalDiff("I have to record", "I must record")).toEqual({ prefix: 2, suffix: 7 });
    const find = "Initially, I worked as crew";
    const hunks = wordHunks(find, "At first, I worked as a crew member");
    const applied = hunks.reduceRight((s, h) => s.slice(0, h.start) + h.text + s.slice(h.end), find);
    expect(applied).toBe("At first, I worked as a crew member");
    expect(hunks.map((h) => [find.slice(h.start, h.end), h.text])).toEqual([["Initially", "At first"], ["crew", "a crew member"]]);
  });

  it("maps a review to edits and reports what it could not place", async () => {
    const zip = await JSZip.loadAsync(await makeDocx(DOC));
    const paras = bodyParagraphs(parseXml(await zip.file("word/document.xml")!.async("string")));
    const m = mapReview(fakeReview, buildContext("Sinta_Study Plan.docx", paras));
    expect(m.edits.map((e) => e.text)).toEqual(["At first", "a crew member", "must", " (which industry? put a bit detail ya)"]);
    expect(m.dropped.map((d) => d.why)).toContain("text not found");
    expect(m.deletions).toEqual([{ para: 4, reason: "generic intro; header already gives the name" }]);
  });
});

describe("pipeline with the Claude layer (fake client)", () => {
  it("writes AI edits as Karina's tracked changes and rejects back to the exact original", async () => {
    const client = new FakeClient();
    const res = await proofreadDocx(await makeDocx(DOC), { fileName: "Sinta_Study Plan.docx", grammar: false, ai: { client } });
    expect(client.calls).toBe(1);

    const acc = await texts(res.output, "accept");
    expect(acc).not.toContain(DOC[4]); // generic intro cut
    expect(acc.join("\n")).toContain("At first, I worked as a crew member at an event planner, where I must record");
    expect(acc.join("\n")).toContain("multinational company (which industry? put a bit detail ya)");
    expect(acc).toContain("Suggestion: explain how this experience connects to the program you applied for.");
    expect(acc).toContain("Why Taiwan? What motivates you to pursue a degree in Taiwan?");
    expect(acc.indexOf("Suggestion: explain how this experience connects to the program you applied for.")).toBeLessThan(acc.indexOf("Note:"));

    expect(await texts(res.output, "reject")).toEqual(DOC);

    const zip = await JSZip.loadAsync(res.output);
    const doc = parseXml(await zip.file("word/document.xml")!.async("string"));
    const authors = new Set([...wDescendants(doc, "ins"), ...wDescendants(doc, "del")].map((e) => e.getAttribute("w:author")));
    expect([...authors]).toEqual(["Karina Octavia"]);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toMatch(/claude|anthropic|\bAI\b|\bbot\b/i);

    expect(res.ai?.costUsd).toBeCloseTo((1000 * 4 + 8000 * 0.2 + 4000 * 20) / 1e6, 6);
    expect(res.changes.find((c) => c.rule === "ai:delete")?.reason).toContain("generic intro");
    expect(res.changes.find((c) => c.after === "must")?.reason).toBe("concision");
  });
});

describe("cost", () => {
  it("prices usage and estimates a range", () => {
    expect(costOf({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5-5")).toBe(4);
    const e = estimateCost("claude-opus-5-5", 12000, 9000, 1000);
    expect(e.usdLow).toBeLessThan(e.usdHigh);
    expect(e.usdHigh).toBeLessThan(0.5);
  });
});
