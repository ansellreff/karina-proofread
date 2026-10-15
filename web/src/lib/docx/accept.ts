import { isW, remove, unwrap, wChild, wChildren, wDescendants, type Document, type Element } from "./xml";

const PROP_CHANGES = [
  "rPrChange", "pPrChange", "sectPrChange", "tblPrChange", "trPrChange", "tcPrChange", "tblGridChange",
  "tblPrExChange", "numberingChange",
];

/**
 * Accept every tracked change in a part, so a resubmitted file starts clean.
 * Returns the number of revisions accepted.
 */
export function acceptAllRevisions(doc: Document): number {
  let count = 0;
  const isMarker = (el: Element) => isW(el.parentNode, "rPr");

  for (const name of ["del", "moveFrom"]) {
    for (const el of wDescendants(doc, name)) {
      if (isMarker(el)) continue;
      remove(el);
      count++;
    }
  }
  for (const name of ["ins", "moveTo"]) {
    for (const el of wDescendants(doc, name)) {
      if (isMarker(el)) continue;
      unwrap(el);
      count++;
    }
  }
  for (const name of PROP_CHANGES) {
    for (const el of wDescendants(doc, name)) {
      remove(el);
      count++;
    }
  }
  for (const name of ["moveFromRangeStart", "moveFromRangeEnd", "moveToRangeStart", "moveToRangeEnd"]) {
    for (const el of wDescendants(doc, name)) remove(el);
  }

  // Paragraph marks, processed last-to-first so chains of merged paragraphs resolve correctly.
  const paras = wDescendants(doc, "p").reverse();
  for (const p of paras) {
    const pPr = wChild(p, "pPr");
    const mark = pPr && wChild(pPr, "rPr");
    if (!mark) continue;
    for (const ins of wChildren(mark, "ins")) {
      remove(ins);
      count++;
    }
    const del = wChild(mark, "del");
    if (!del) continue;
    remove(del);
    count++;
    // Deleted paragraph mark: this paragraph's content joins the next paragraph.
    const next = p.nextSibling && isW(p.nextSibling, "p") ? (p.nextSibling as Element) : null;
    if (!next) continue;
    const content = Array.from(p.childNodes).filter((n) => !isW(n, "pPr"));
    const anchor = wChild(next, "pPr")?.nextSibling ?? next.firstChild;
    for (const n of content) next.insertBefore(n, anchor);
    remove(p);
  }
  return count;
}
