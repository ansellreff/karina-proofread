import { isW, remove, unwrap, W_NS, wChild, wChildren, wDescendants, type Document, type Element } from "./xml";

/**
 * Reject tracked changes in a part (restores the author's original). With `only`, just the revisions whose
 * w:id is in the set (the rest stay tracked).
 */
export function rejectAllRevisions(doc: Document, only?: Set<string>): void {
  const picked = (el: Element) => !only || only.has(el.getAttributeNS(W_NS, "id") ?? el.getAttribute("w:id") ?? "");
  const isMarker = (el: Element) => isW(el.parentNode, "rPr");
  for (const name of ["ins", "moveTo"]) for (const el of wDescendants(doc, name)) if (!isMarker(el) && picked(el)) remove(el);
  for (const name of ["del", "moveFrom"]) {
    for (const el of wDescendants(doc, name)) {
      if (isMarker(el) || !picked(el)) continue;
      for (const t of wDescendants(el, "delText")) {
        const nt = doc.createElementNS(t.namespaceURI, "w:t");
        nt.setAttribute("xml:space", "preserve");
        nt.appendChild(doc.createTextNode(t.textContent ?? ""));
        t.parentNode!.replaceChild(nt, t);
      }
      for (const t of wDescendants(el, "delInstrText")) {
        const nt = doc.createElementNS(t.namespaceURI, "w:instrText");
        nt.appendChild(doc.createTextNode(t.textContent ?? ""));
        t.parentNode!.replaceChild(nt, t);
      }
      unwrap(el);
    }
  }
  for (const ch of wDescendants(doc, "rPrChange")) {
    if (!picked(ch)) continue;
    const rPr = ch.parentNode as Element;
    const old = wChild(ch, "rPr");
    const markers = wChildren(rPr).filter((c) => ["ins", "del"].includes(c.localName!));
    while (rPr.firstChild) rPr.removeChild(rPr.firstChild);
    for (const m of markers) rPr.appendChild(m);
    if (old) while (old.firstChild) rPr.appendChild(old.firstChild);
  }
  for (const ch of wDescendants(doc, "pPrChange")) {
    if (!picked(ch)) continue;
    const pPr = ch.parentNode as Element;
    const old = wChild(ch, "pPr");
    const keep = wChildren(pPr).filter((c) => ["rPr", "sectPr"].includes(c.localName!));
    while (pPr.firstChild) pPr.removeChild(pPr.firstChild);
    if (old) while (old.firstChild) pPr.appendChild(old.firstChild);
    for (const k of keep) pPr.appendChild(k);
  }
  const paras = wDescendants(doc, "p").reverse();
  for (const p of paras) {
    const mark = wChild(wChild(p, "pPr") ?? p, "rPr");
    if (!mark || !isW(mark.parentNode, "pPr")) continue;
    for (const d of wChildren(mark, "del")) if (picked(d)) remove(d);
    const ins = wChild(mark, "ins");
    if (!ins || !picked(ins)) continue;
    remove(ins);
    const next = p.nextSibling && isW(p.nextSibling, "p") ? (p.nextSibling as Element) : null;
    const content = Array.from(p.childNodes).filter((n) => !isW(n, "pPr"));
    if (next) {
      const anchor = wChild(next, "pPr")?.nextSibling ?? next.firstChild;
      for (const n of content) next.insertBefore(n, anchor);
      remove(p);
    }
  }
}
