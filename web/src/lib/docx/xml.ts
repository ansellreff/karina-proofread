import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";

export type { Document, Element, Node };

export const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const W15_NS = "http://schemas.microsoft.com/office/word/2012/wordml";
export const W16DU_NS = "http://schemas.microsoft.com/office/word/2023/wordml/word16du";
export const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";
export const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
export const XML_NS = "http://www.w3.org/XML/1998/namespace";

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml.replace(/^﻿/, ""), "application/xml");
}

export function serializeXml(doc: Document): string {
  let out = new XMLSerializer().serializeToString(doc);
  if (!out.startsWith("<?xml")) {
    out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
  }
  return out;
}

export function isEl(node: Node | null | undefined): node is Element {
  return !!node && node.nodeType === 1;
}

/** True when `node` is the WordprocessingML element `w:<name>`. */
export function isW(node: Node | null | undefined, name?: string): node is Element {
  return isEl(node) && node.namespaceURI === W_NS && (name === undefined || node.localName === name);
}

export function wChildren(el: Element, name?: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (isW(n, name)) out.push(n);
  return out;
}

export function wChild(el: Element, name: string): Element | null {
  for (let n = el.firstChild; n; n = n.nextSibling) if (isW(n, name)) return n;
  return null;
}

export function wDescendants(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(W_NS, name)) as Element[];
}

export function getW(el: Element, attr: string): string | null {
  const v = el.getAttributeNS(W_NS, attr);
  return v === "" && !el.hasAttributeNS(W_NS, attr) ? null : v;
}

export function setW(el: Element, attr: string, value: string): void {
  el.setAttributeNS(W_NS, `w:${attr}`, value);
}

export function wEl(doc: Document, name: string, attrs: Record<string, string> = {}): Element {
  const el = doc.createElementNS(W_NS, `w:${name}`);
  for (const [k, v] of Object.entries(attrs)) setW(el, k, v);
  return el;
}

export function textEl(doc: Document, name: "t" | "delText", text: string): Element {
  const el = wEl(doc, name);
  el.setAttributeNS(XML_NS, "xml:space", "preserve");
  el.appendChild(doc.createTextNode(text));
  return el;
}

export function insertAfter(newNode: Node, ref: Node): void {
  ref.parentNode!.insertBefore(newNode, ref.nextSibling);
}

export function remove(node: Node): void {
  node.parentNode?.removeChild(node);
}

/** Replace `el` with its children. */
export function unwrap(el: Element): void {
  const parent = el.parentNode!;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** Nearest ancestor (or self) that is `w:<name>`. */
export function closestW(node: Node, name: string, stopAt?: Node): Element | null {
  for (let n: Node | null = node; n && n !== stopAt; n = n.parentNode) if (isW(n, name)) return n;
  return null;
}

// Schema order of children (CT_RPr / CT_PPr / CT_Settings). Word rejects out-of-order elements.
export const RPR_ORDER = [
  "ins", "del", "moveFrom", "moveTo", "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike",
  "dstrike", "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden", "color",
  "spacing", "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign",
  "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath", "rPrChange",
];
export const PPR_ORDER = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr", "suppressLineNumbers",
  "pBdr", "shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE",
  "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents",
  "suppressOverlap", "jc", "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle",
  "rPr", "sectPr", "pPrChange",
];
export const SETTINGS_ORDER = [
  "writeProtection", "view", "zoom", "removePersonalInformation", "removeDateAndTime", "doNotDisplayPageBoundaries",
  "displayBackgroundShape", "printPostScriptOverText", "printFractionalCharacterWidth", "printFormsData",
  "embedTrueTypeFonts", "embedSystemFonts", "saveSubsetFonts", "saveFormsData", "mirrorMargins",
  "alignBordersAndEdges", "bordersDoNotSurroundHeader", "bordersDoNotSurroundFooter", "gutterAtTop",
  "hideSpellingErrors", "hideGrammaticalErrors", "activeWritingStyle", "proofState", "formsDesign",
  "attachedTemplate", "linkStyles", "stylePaneFormatFilter", "stylePaneSortMethod", "documentType", "mailMerge",
  "revisionView", "trackRevisions",
];

/** Insert `el` into `parent` at the position required by `order`; replaces an existing element of the same name. */
export function putOrdered(parent: Element, el: Element, order: string[]): Element {
  const name = el.localName!;
  const existing = wChild(parent, name);
  if (existing) {
    parent.replaceChild(el, existing);
    return el;
  }
  const idx = order.indexOf(name);
  for (let n = parent.firstChild; n; n = n.nextSibling) {
    if (!isEl(n)) continue;
    const j = order.indexOf(n.localName!);
    if (j > idx) {
      parent.insertBefore(el, n);
      return el;
    }
  }
  parent.appendChild(el);
  return el;
}

/** Get or create the first-child property element (`w:rPr` of a run, `w:pPr` of a paragraph). */
export function ensureFirstChild(parent: Element, name: string): Element {
  const existing = wChild(parent, name);
  if (existing) return existing;
  const el = wEl(parent.ownerDocument!, name);
  parent.insertBefore(el, parent.firstChild);
  return el;
}
