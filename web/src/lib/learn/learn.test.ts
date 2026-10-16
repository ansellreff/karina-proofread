import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { learnedExamples } from "../ai/prompt";
import type { ChangeRecord } from "../pipeline";
import { withDefaults } from "../rules/config";
import { switchOff } from "../rules/names";
import { FsFiles } from "../storage/fs-files";
import type { DocType } from "../rules/types";
import { alignParagraphs, wordDiff } from "./diff";
import { recordFromReview } from "./learn";
import { anonymise, propose, sampleOf, type LearnState } from "./proposals";
import { botOutcomes, netEdits, type LearnedRecord } from "./record";
import { LearnStore } from "./store";

const rules = withDefaults(null);
const empty: LearnState = { dismissed: [], examples: [] };

function record(id: string, orig: string[], fin: string[], opts: { docType?: DocType; changes?: ChangeRecord[]; reviewedAt?: string; names?: string[] } = {}): LearnedRecord {
  const { text, starts, edits } = netEdits(orig, fin);
  return {
    id, source: "upload", fileName: `${id}.docx`, docType: opts.docType ?? "Study Plan", learnedAt: "2026-10-16T00:00:00Z",
    reviewedAt: opts.reviewedAt ?? "2026-10-01T00:00:00Z", names: opts.names ?? [], text, starts, edits,
    outcomes: botOutcomes(opts.changes ?? [], text, starts, edits),
  };
}

const LONG = "I graduated from a university in Indonesia with a degree in computer science and worked for two years.";

describe("word diff and paragraph alignment", () => {
  it("finds the changed words only", () => {
    const a = "I want to study in Taiwan.";
    const h = wordDiff(a, "I plan to study in Taiwan.");
    expect(h).toEqual([{ start: 2, end: 6, text: "plan" }]);
  });

  it("keeps a renamed university as one edit, as in Word", () => {
    const a = "I studied at Petra Christian University in Surabaya.";
    const h = wordDiff(a, "I studied at Universitas Kristen Petra in Surabaya.");
    expect(h).toHaveLength(1);
    expect(a.slice(h[0].start, h[0].end)).toBe("Petra Christian University");
    expect(h[0].text).toBe("Universitas Kristen Petra");
  });

  it("aligns edited, cut and added paragraphs", () => {
    const orig = ["Alpha beta gamma delta epsilon.", "A paragraph she cut completely from the text.", "Closing words of the essay here."];
    const fin = ["STUDY PLAN", "Alpha beta gamma delta zeta.", "Closing words of the essay here.", "Note:"];
    expect(alignParagraphs(orig, fin)).toEqual([[-1, 0], [0, 1], [1, -1], [2, 2], [-1, 3]]);
  });
});

describe("net edits and bot outcomes", () => {
  const orig = [LONG, "In order to succeed, I study hard every single day of the week.", "I want to come back to Indonesia after I graduate."];
  const fin = ["STUDY PLAN", "Name: [Name]", LONG, "To succeed, I study hard every single day (which days?) of the week.", "I want to come back to Indonesia after I graduate.", "Note:", "Why Taiwan? Please explain."];

  it("puts each edit in eval.py's categories", () => {
    const { edits } = netEdits(orig, fin);
    const cats = edits.map((e) => e.category);
    expect(cats).toEqual(["header", "fix", "inline-note", "end-note"]);
    expect(edits[0].after).toBe("STUDY PLAN\nName: [Name]");
  });

  it("tells kept, changed and rejected suggestions apart", () => {
    const changes: ChangeRecord[] = [
      { rule: "header-title", kind: "paragraph", paragraph: 0, start: 0, end: 0, before: "", after: "STUDY PLAN" },
      { rule: "custom:x", kind: "fix", paragraph: 1, start: 0, end: 11, before: "In order to", after: "To" },
      { rule: "harper:Grammar", kind: "fix", paragraph: 2, start: 2, end: 6, before: "want", after: "wish" },
      { rule: "ai:fix", kind: "fix", paragraph: 1, start: 0, end: 11, before: "In order to", after: "So as to" },
    ];
    const rec = record("a", orig, fin, { changes });
    expect(rec.outcomes.map((o) => o.outcome)).toEqual(["kept", "kept", "rejected", "changed"]);
  });
});

describe("proposals", () => {
  const sentence = (i: number) => `In order to reach goal ${i}, I practise every week with my friends at the campus.`;
  const edited = (i: number) => `To reach goal ${i}, I practise every week with my friends at the campus.`;
  const doc = (n: number, edit: boolean) => [LONG, ...Array.from({ length: n }, (_, i) => (edit ? edited(i) : sentence(i)))];

  it("proposes a replace rule she applied consistently, with its precision", () => {
    const recs = [record("a", doc(2, false), doc(2, true)), record("b", doc(2, false), doc(2, true))];
    const p = propose(recs, rules, empty).find((x) => x.type === "replace");
    expect(p?.type).toBe("replace");
    if (p?.type !== "replace") return;
    expect(p.rule.find).toBe("In order to");
    expect(p.rule.text).toBe("To");
    expect([p.times, p.docs, p.right, p.matches]).toEqual([4, 2, 4, 4]);
  });

  it("does not propose it where she usually left the phrase alone", () => {
    const recs = [record("a", doc(2, false), doc(2, true)), record("b", doc(2, false), doc(2, true)), record("c", doc(6, false), doc(6, false))];
    expect(propose(recs, rules, empty).some((x) => x.type === "replace")).toBe(false);
  });

  it("never proposes a dismissed key again, nor a rule she already has", () => {
    const recs = [record("a", doc(2, false), doc(2, true)), record("b", doc(2, false), doc(2, true))];
    const key = propose(recs, rules, empty).find((x) => x.type === "replace")!.key;
    expect(propose(recs, rules, { ...empty, dismissed: [key] }).some((x) => x.key === key)).toBe(false);
    const withRule = { ...rules, custom: [...rules.custom, { ...rules.custom[0], id: "mine", action: "replace" as const, find: "in order to", text: "to", enabled: true }] };
    expect(propose(recs, withRule, empty).some((x) => x.key === key)).toBe(false);
  });

  it("proposes switching off a rule only when it is unhelpful in recent documents too", () => {
    const orig = [LONG, "We worked hard on the project : it was fun."];
    const change: ChangeRecord = { rule: "space-before-colon", kind: "fix", paragraph: 1, start: 29, end: 30, before: " ", after: "" };
    const old = [1, 2, 3, 4].map((i) => record(`old${i}`, orig, orig, { changes: [change], reviewedAt: `2025-0${i}-01T00:00:00Z` }));
    const off = propose(old, rules, empty).find((x) => x.type === "switch-off");
    expect(off?.type === "switch-off" && off.ruleId).toBe("space-before-colon");
    expect(switchOff(rules, "space-before-colon", undefined, []).builtIn.spaceBeforeColon.enabled).toBe(false);

    const fixed = orig.map((p) => p.replace("project :", "project:"));
    const recent = [5, 6, 7, 8].map((i) => record(`new${i}`, orig, fixed, { changes: [change], reviewedAt: `2026-0${i}-01T00:00:00Z` }));
    expect(propose([...old, ...recent], rules, empty).some((x) => x.type === "switch-off")).toBe(false);
  });

  it("offers her own notes as AI examples, without the student's name", () => {
    const orig = [LONG, "My name is Sari Wijaya and I love chemistry since high school."];
    const fin = [LONG, "My name is Sari Wijaya and I love chemistry since high school (since when exactly? give the year)."];
    const recs = [record("a", orig, fin, { names: ["Sari Wijaya"] })];
    const ex = propose(recs, rules, empty).find((x) => x.type === "example");
    expect(ex?.type === "example" && ex.example.kind).toBe("note");
    expect(ex?.type === "example" && ex.example.text).toContain("{+ (since when exactly? give the year)+}");
    expect(ex?.type === "example" && ex.example.text).not.toContain("Sari");
    expect(anonymise("Thank you, Sari! Sari Wijaya wrote it.", ["Sari Wijaya"])).toBe("Thank you, [Name]! [Name] wrote it.");
    expect(sampleOf(recs[0], 0, 1, "").lead).toBe("");
  });

  it("sends approved examples with the AI prompt", () => {
    const block = learnedExamples([{ key: "ex:1", docType: "Study Plan", kind: "note", text: "I love it{+ (why?)+}", addedAt: "" }]);
    expect(block).toContain("<examples_from_recent_reviews>");
    expect(block).toContain("### Study Plan\n- (note) I love it{+ (why?)+}");
    expect(learnedExamples([])).toBe("");
  });
});

describe("learning from a reviewed Word file", () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const run = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const ins = (t: string) => `<w:ins w:id="1" w:author="Karina Octavia" w:date="2026-09-30T10:00:00Z"><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:ins>`;
  const del = (t: string) => `<w:del w:id="2" w:author="Karina Octavia" w:date="2026-09-30T10:00:00Z"><w:r><w:delText xml:space="preserve">${t}</w:delText></w:r></w:del>`;

  async function reviewed(paras: string[]): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${paras.map((p) => `<w:p>${p}</w:p>`).join("")}<w:sectPr/></w:body></w:document>`);
    return zip.generateAsync({ type: "uint8array" });
  }

  it("rebuilds the original and her final version, and records her edits", async () => {
    const data = await reviewed([run(LONG), run("I want ") + del("to going") + ins("to go") + run(" to Taiwan for my master degree.")]);
    const rec = await recordFromReview("StudyPlan_test.docx", data, "Study Plan", rules);
    expect(rec.text).toContain("I want to going to Taiwan");
    expect(rec.edits.some((e) => e.before === "going" && e.after === "go")).toBe(true);
    expect(rec.reviewedAt).toBe("2026-09-30T10:00:00.000Z");
    expect(rec.id.startsWith("up-")).toBe(true);
  });

  it("refuses a file without tracked changes", async () => {
    await expect(recordFromReview("StudyPlan_plain.docx", await reviewed([run(LONG)]), "Study Plan", rules)).rejects.toThrow(/no tracked changes/);
  });

  it("stores, lists and forgets records", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "learn-"));
    try {
      const store = new LearnStore(new FsFiles(dir));
      const rec = record("up-abc", [LONG], [LONG]);
      await store.save(rec);
      expect((await store.list()).map((r) => r.id)).toEqual(["up-abc"]);
      expect(await store.remove("up-abc")).toBe(true);
      expect(await store.list()).toEqual([]);
      await expect(store.remove("../meta")).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
