import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { forEditor, toWord } from "./dates";

const NS = `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" mc:Ignorable=""`;
const W16 = `xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du"`;
const ins = (date: string, utc?: string) =>
  `<w:ins w:id="1" w:author="Karina Octavia" w:date="${date}"${utc ? ` w16du:dateUtc="${utc}"` : ""}><w:r><w:t>x</w:t></w:r></w:ins>`;
const docx = async (body: string, root = NS) => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${root}><w:body><w:p>${body}</w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
};
const xmlOf = async (data: Uint8Array) => (await JSZip.loadAsync(data)).file("word/document.xml")!.async("string");
const attr = (xml: string, name: string) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe("tracked-change dates between Word and the in-app editor", () => {
  it("the editor's copy shows Word's local time as written (no “Z”), so balloons are not 8 hours late", async () => {
    const xml = await xmlOf(await forEditor(await docx(ins("2026-10-30T01:37:00Z", "2026-10-29T17:37:00Z"), `${NS} ${W16}`), 480));
    expect(attr(xml, "w:date")).toBe("2026-10-30T01:37:00");
    expect(attr(xml, "w16du:dateUtc")).toBe("2026-10-29T17:37:00Z");
  });

  it("an edit saved by the editor before this fix (UTC with milliseconds) also shows its local time", async () => {
    expect(attr(await xmlOf(await forEditor(await docx(ins("2026-10-20T17:43:43.318Z")), 480)), "w:date")).toBe("2026-10-21T01:43:00");
  });

  it("saving puts the “Z” back on untouched changes, and turns the editor's own edits into Word's form", async () => {
    const saved = await docx(ins("2026-10-30T01:37:00", "2026-10-29T17:37:00Z") + ins("2026-10-29T17:40:54.733Z").replace('w:id="1"', 'w:id="2"'), `${NS} ${W16}`);
    const xml = await xmlOf(await toWord(saved, 480));
    const dates = [...xml.matchAll(/w:date="([^"]*)"/g)].map((m) => m[1]);
    expect(dates).toEqual(["2026-10-30T01:37:00Z", "2026-10-30T01:40:00Z"]);
    expect([...xml.matchAll(/w16du:dateUtc="([^"]*)"/g)].map((m) => m[1])).toEqual(["2026-10-29T17:37:00Z", "2026-10-29T17:40:00Z"]);
  });

  it("Word's own dates pass through untouched (the file is returned as it was)", async () => {
    const word = await docx(ins("2026-10-30T01:37:00Z"));
    expect(await toWord(word, 480)).toBe(word);
  });
});
