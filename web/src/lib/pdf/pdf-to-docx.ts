/**
 * PDF -> Word (.docx), so a student's PDF can be proofread, reviewed with tracked changes and exported like any
 * Word file. Rebuilds text, paragraphs, fonts, sizes, bold/italic, alignment, line spacing, page size and margins.
 * Images and table borders are not rebuilt (their text is kept). Scanned PDFs (no text layer) are refused.
 */
import JSZip from "jszip";

interface Seg {
  text: string;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
}
interface Line {
  page: number;
  y: number; // baseline, top-down (points from the top of the page)
  left: number;
  right: number;
  size: number;
  segs: Seg[];
}
interface Para {
  lines: Line[];
  align: "left" | "center" | "both" | "right";
  spacing: number; // line multiple (1, 1.15, 1.5, 2)
  after: number; // space after, points
  indentFirst: number; // points
  breakBefore: boolean;
}

export interface PdfConversion {
  docx: Uint8Array;
  pages: number;
  paragraphs: number;
  /** Things Karina should know about the conversion. */
  notes: string[];
}

export class PdfNotReadable extends Error {}

const FONT_ALIASES: [RegExp, string][] = [
  [/^times ?new ?roman/i, "Times New Roman"], [/^arial/i, "Arial"], [/^helvetica/i, "Arial"], [/^calibri/i, "Calibri"],
  [/^cambria/i, "Cambria"], [/^aptos/i, "Aptos"], [/^georgia/i, "Georgia"], [/^garamond/i, "Garamond"], [/^verdana/i, "Verdana"],
  [/^tahoma/i, "Tahoma"], [/^segoe ?ui/i, "Segoe UI"], [/^century ?gothic/i, "Century Gothic"], [/^book ?antiqua/i, "Book Antiqua"],
  [/^palatino/i, "Palatino Linotype"], [/^roboto/i, "Roboto"], [/^open ?sans/i, "Open Sans"], [/^lato/i, "Lato"], [/^montserrat/i, "Montserrat"],
  [/^poppins/i, "Poppins"], [/^symbol/i, "Symbol"], [/^wingdings/i, "Wingdings"], [/^courier/i, "Courier New"],
];

/** "ABCDEF+TimesNewRomanPS-BoldItalicMT" -> { family: "Times New Roman", bold, italic } */
export function parseFontName(raw: string): { family: string; bold: boolean; italic: boolean } {
  const name = raw.replace(/^[A-Z]{6}\+/, "");
  const bold = /bold|black|heavy|semibold|demi/i.test(name);
  const italic = /italic|oblique/i.test(name);
  const base = name
    .split(/[-,]/)[0]
    .replace(/(PSMT|PS|MT|Std|Pro|LT|Regular|Bold|Italic)+$/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  const alias = FONT_ALIASES.find(([re]) => re.test(base.replace(/\s+/g, " ")));
  return { family: alias ? alias[1] : base || "Times New Roman", bold, italic };
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mode = (xs: number[]) => {
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
};
const lineText = (l: Line) => l.segs.map((s) => s.text).join("");
const BULLET = /^\s*(?:[•●▪◦■□➢►\-–*]|\(?\d{1,2}[.)]|\(?[a-z][.)]|[ivx]{1,4}[.)])\s/i;

async function extract(data: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const lines: Line[] = [];
  const pageSizes: { width: number; height: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    pageSizes.push({ width: vp.width, height: vp.height });
    await page.getOperatorList(); // loads the fonts, so their real names are known
    const content = await page.getTextContent();
    const fonts = new Map<string, { family: string; bold: boolean; italic: boolean }>();
    const fontOf = (id: string) => {
      if (!fonts.has(id)) {
        let raw = "";
        try {
          const f = page.commonObjs.get(id) as { name?: string; bold?: boolean; italic?: boolean; black?: boolean } | null;
          raw = f?.name ?? "";
          const parsed = parseFontName(raw || (content.styles[id]?.fontFamily ?? ""));
          fonts.set(id, { family: parsed.family, bold: parsed.bold || !!f?.bold || !!f?.black, italic: parsed.italic || !!f?.italic });
        } catch {
          fonts.set(id, parseFontName(content.styles[id]?.fontFamily ?? ""));
        }
      }
      return fonts.get(id)!;
    };
    type Item = { str: string; x: number; y: number; w: number; size: number; font: string };
    const items: Item[] = [];
    for (const it of content.items as { str?: string; transform?: number[]; width?: number; fontName?: string }[]) {
      if (typeof it.str !== "string" || !it.transform) continue;
      it.str = it.str.replace(/[-]/g, ""); // icon-font glyphs (phone, mail, pin icons in CV templates)
      if (!it.str.length) continue;
      const [a, b, c, d, e, f] = it.transform;
      if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue; // rotated text (stamps, side labels)
      const size = Math.hypot(c, d) || Math.hypot(a, b);
      items.push({ str: it.str, x: e, y: vp.height - f, w: it.width ?? 0, size, font: it.fontName ?? "" });
    }
    items.sort((p, q) => p.y - q.y || p.x - q.x);
    let cur: Line | null = null;
    let lastEnd = 0;
    for (const it of items) {
      const tol = Math.max(2, it.size * 0.35);
      if (!cur || Math.abs(it.y - cur.y) > tol || it.x < lastEnd - it.size) {
        if (cur) lines.push(cur);
        cur = { page: n, y: it.y, left: it.x, right: it.x + it.w, size: it.size, segs: [] };
        lastEnd = it.x;
      }
      const fi = fontOf(it.font);
      const prev = cur.segs[cur.segs.length - 1];
      const gap = it.x - lastEnd;
      const needSpace = cur.segs.length > 0 && gap > it.size * 0.18 && !/\s$/.test(prev.text) && !/^\s/.test(it.str);
      const text = (needSpace ? " " : "") + it.str;
      const seg: Seg = { text, font: fi.family, size: Math.round(it.size * 2) / 2, bold: fi.bold, italic: fi.italic };
      if (prev && prev.font === seg.font && prev.size === seg.size && prev.bold === seg.bold && prev.italic === seg.italic) prev.text += text;
      else cur.segs.push(seg);
      lastEnd = Math.max(lastEnd, it.x + it.w);
      cur.right = Math.max(cur.right, it.x + it.w);
      cur.size = Math.max(cur.size, it.size);
    }
    if (cur) lines.push(cur);
    page.cleanup();
  }
  await task.destroy(); // pdf.js 6: the loading task closes the document
  return { lines: lines.filter((l) => lineText(l).trim()), pageSizes, pages: pageSizes.length };
}

/** Page numbers and running headers/footers repeat on every page: drop them. */
function dropRunningLines(lines: Line[], pageSizes: { height: number }[], pages: number): Line[] {
  const edge = (l: Line) => l.y < pageSizes[l.page - 1].height * 0.08 || l.y > pageSizes[l.page - 1].height * 0.92;
  const key = (l: Line) => lineText(l).trim().replace(/\d+/g, "#");
  const counts = new Map<string, number>();
  for (const l of lines) if (edge(l)) counts.set(key(l), (counts.get(key(l)) ?? 0) + 1);
  return lines.filter((l) => {
    if (!edge(l)) return true;
    const t = lineText(l).trim();
    if (/^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i.test(t)) return false;
    return !(pages > 1 && (counts.get(key(l)) ?? 0) >= Math.min(3, pages));
  });
}

function toParagraphs(lines: Line[], pageWidth: number): { paras: Para[]; leftMargin: number; rightEdge: number } {
  const leftMargin = mode(lines.map((l) => Math.round(l.left)));
  const rights = lines.map((l) => l.right).sort((a, b) => a - b);
  const rightEdge = rights[Math.floor(rights.length * 0.9)] ?? pageWidth - leftMargin;
  const column = rightEdge - leftMargin;
  const centerX = (leftMargin + rightEdge) / 2;
  const pitches: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].y - lines[i - 1].y;
    if (lines[i].page === lines[i - 1].page && p > 0 && Math.abs(lines[i].size - lines[i - 1].size) < 1) pitches.push(p / lines[i].size);
  }
  const typical = median(pitches) || 1.2; // line pitch as a multiple of the font size

  const paras: Para[] = [];
  let cur: Line[] = [];
  const flush = () => {
    if (cur.length) paras.push({ lines: cur, align: "left", spacing: 1, after: 0, indentFirst: 0, breakBefore: false });
    cur = [];
  };
  for (const l of lines) {
    const prev = cur[cur.length - 1];
    if (!prev) {
      cur.push(l);
      continue;
    }
    const samePage = prev.page === l.page;
    const pitch = (l.y - prev.y) / l.size;
    const prevText = lineText(prev).trim();
    const prevShort = prev.right < rightEdge - Math.max(0.12 * column, 3 * l.size);
    const centered = (x: Line) => Math.abs((x.left + x.right) / 2 - centerX) < 12 && x.left > leftMargin + 20;
    const boldLine = (x: Line) => x.segs.filter((s) => s.text.trim()).every((s) => s.bold);
    const breakHere =
      boldLine(prev) !== boldLine(l) || // headings, company names

      (samePage && pitch > typical * 1.45) ||
      Math.abs(l.size - prev.size) > 1.2 ||
      BULLET.test(lineText(l)) ||
      (prevShort && (/[.!?:;)"”’]$/.test(prevText) || /^\p{Lu}/u.test(lineText(l).trim()))) ||
      (centered(prev) !== centered(l)) ||
      (l.left > leftMargin + 12 && !BULLET.test(lineText(prev)) && !prevShort) ||
      (!samePage && prevShort); // otherwise a paragraph that runs on to the next page stays one paragraph
    if (breakHere) flush();
    cur.push(l);
  }
  flush();

  // paragraph properties
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const ls = p.lines;
    const first = ls[0];
    const allCentered = ls.every((x) => Math.abs((x.left + x.right) / 2 - centerX) < 14) && first.left > leftMargin + 20;
    const rightAligned = ls.every((x) => Math.abs(x.right - rightEdge) < 4) && first.left > centerX;
    const full = ls.slice(0, -1).filter((x) => x.right > rightEdge - 4).length;
    if (allCentered) p.align = "center";
    else if (rightAligned) p.align = "right";
    else if (ls.length >= 2 && full >= Math.max(1, Math.floor((ls.length - 1) * 0.8))) p.align = "both";
    if (first.left > leftMargin + 8 && p.align !== "center" && p.align !== "right" && !BULLET.test(lineText(first))) p.indentFirst = first.left - leftMargin;
    const inner: number[] = [];
    for (let j = 1; j < ls.length; j++) if (ls[j].page === ls[j - 1].page) inner.push((ls[j].y - ls[j - 1].y) / ls[j].size);
    const ratio = median(inner) || typical;
    const multiple = ratio / 1.15; // Word's single line is about 1.15 x the font size
    p.spacing = [1, 1.15, 1.5, 2].reduce((best, m) => (Math.abs(m - multiple) < Math.abs(best - multiple) ? m : best), 1);
    const next = paras[i + 1];
    const last = ls[ls.length - 1];
    if (next && next.lines[0].page === last.page) {
      const gap = next.lines[0].y - last.y - next.lines[0].size * ratio;
      if (gap > 2) p.after = Math.round(gap);
    }
  }
  return { paras, leftMargin, rightEdge };
}

// ---------------------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

function runXml(s: Seg, base: { font: string; size: number }): string {
  const props: string[] = [];
  if (s.font !== base.font) props.push(`<w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}" w:cs="${esc(s.font)}"/>`);
  if (s.bold) props.push("<w:b/><w:bCs/>");
  if (s.italic) props.push("<w:i/><w:iCs/>");
  if (Math.round(s.size * 2) !== Math.round(base.size * 2)) props.push(`<w:sz w:val="${Math.round(s.size * 2)}"/><w:szCs w:val="${Math.round(s.size * 2)}"/>`);
  return `<w:r>${props.length ? `<w:rPr>${props.join("")}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(s.text)}</w:t></w:r>`;
}

function paraXml(p: Para, base: { font: string; size: number }): string {
  // join the lines: a line ending in a hyphen continues the word; otherwise a space
  const segs: Seg[] = [];
  p.lines.forEach((l, i) => {
    l.segs.forEach((s, j) => {
      let text = s.text;
      if (i > 0 && j === 0) {
        const prev = segs[segs.length - 1];
        const hyphen = prev && /\p{L}-$/u.test(prev.text);
        if (!hyphen && prev && !/\s$/.test(prev.text)) text = " " + text.replace(/^\s+/, "");
        else text = text.replace(/^\s+/, "");
      }
      const prev = segs[segs.length - 1];
      if (prev && prev.font === s.font && prev.size === s.size && prev.bold === s.bold && prev.italic === s.italic) prev.text += text;
      else segs.push({ ...s, text });
    });
  });
  if (segs.length) {
    segs[0].text = segs[0].text.replace(/^\s+/, "");
    segs[segs.length - 1].text = segs[segs.length - 1].text.replace(/\s+$/, "");
  }
  const pPr: string[] = [];
  if (p.breakBefore) pPr.push("<w:pageBreakBefore/>");
  pPr.push(`<w:spacing w:before="0" w:after="${Math.round(p.after * 20)}" w:line="${Math.round(p.spacing * 240)}" w:lineRule="auto"/>`);
  if (p.indentFirst > 0) pPr.push(`<w:ind w:firstLine="${Math.round(p.indentFirst * 20)}"/>`);
  if (p.align !== "left") pPr.push(`<w:jc w:val="${p.align}"/>`);
  return `<w:p><w:pPr>${pPr.join("")}</w:pPr>${segs.map((s) => runXml(s, base)).join("")}</w:p>`;
}

/** Convert a PDF (bytes) to a .docx (bytes). */
export async function pdfToDocx(data: Uint8Array): Promise<PdfConversion> {
  const { lines: raw, pageSizes, pages } = await extract(data);
  const chars = raw.reduce((n, l) => n + lineText(l).replace(/\s/g, "").length, 0);
  if (chars < 80) {
    throw new PdfNotReadable("This PDF has no selectable text (it looks like a scan or a photo), so it can’t be proofread. Ask the student for the Word file, or a PDF saved from Word.");
  }
  const lines = dropRunningLines(raw, pageSizes, pages);
  const size0 = pageSizes[0];
  const { paras, leftMargin, rightEdge } = toParagraphs(lines, size0.width);

  // the most used font and size become the document defaults
  const weight = new Map<string, number>();
  for (const l of lines) for (const s of l.segs) weight.set(`${s.font}|${s.size}`, (weight.get(`${s.font}|${s.size}`) ?? 0) + s.text.length);
  const [fontSize] = [...weight].sort((a, b) => b[1] - a[1])[0] ?? ["Times New Roman|12"];
  const [font, sizeText] = fontSize.split("|");
  const base = { font, size: Number(sizeText) };

  const firstY = median(pageSizes.map((_, i) => lines.find((l) => l.page === i + 1)?.y ?? 72));
  const top = Math.max(18, firstY - base.size);
  const margins = {
    top: Math.round(top * 20),
    bottom: 1440,
    left: Math.round(Math.max(18, leftMargin) * 20),
    right: Math.round(Math.max(18, size0.width - rightEdge) * 20),
  };
  const body = paras.map((p) => paraXml(p, base)).join("");
  const sectPr = `<w:sectPr><w:pgSz w:w="${Math.round(size0.width * 20)}" w:h="${Math.round(size0.height * 20)}"/><w:pgMar w:top="${margins.top}" w:right="${margins.right}" w:bottom="${margins.bottom}" w:left="${margins.left}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`, { createFolders: false });
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`, { createFolders: false });
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, { createFolders: false });
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}${sectPr}</w:body></w:document>`, { createFolders: false });
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(base.font)}" w:hAnsi="${esc(base.font)}" w:eastAsia="${esc(base.font)}" w:cs="${esc(base.font)}"/><w:sz w:val="${Math.round(base.size * 2)}"/><w:szCs w:val="${Math.round(base.size * 2)}"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style></w:styles>`, { createFolders: false });
  zip.file("word/settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W}><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`, { createFolders: false });
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title></dc:title><dc:creator></dc:creator><cp:lastModifiedBy></cp:lastModifiedBy><cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`, { createFolders: false });
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Template>Normal.dotm</Template><TotalTime>0</TotalTime><Pages>${pages}</Pages><Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity><AppVersion>16.0000</AppVersion></Properties>`, { createFolders: false });

  const notes = ["Converted from PDF: text, fonts, sizes, bold/italic, alignment and spacing are kept; pictures and table borders are not."];
  return { docx: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), pages, paragraphs: paras.length, notes };
}
