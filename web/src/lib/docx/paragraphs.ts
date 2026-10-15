import { closestW, isW, wChild, wDescendants, type Document, type Element } from "./xml";

/** One unit of visible text inside a run: a w:t, w:tab, w:br or w:noBreakHyphen. */
export interface Atom {
  run: Element;
  node: Element;
  text: string;
  start: number;
  end: number;
}

export interface Para {
  el: Element;
  index: number;
  text: string;
  inTable: boolean;
  isList: boolean;
}

const ATOM_TEXT: Record<string, string> = { tab: "\t", br: "\n", noBreakHyphen: "-" };

/** Runs whose nearest paragraph is `p` (skips text boxes) and that are not inside a tracked change. */
export function paragraphRuns(p: Element): Element[] {
  return wDescendants(p, "r").filter((r) => {
    if (closestW(r.parentNode!, "p") !== p) return false;
    for (let n = r.parentNode; n && n !== p; n = n.parentNode) {
      if (isW(n, "ins") || isW(n, "del") || isW(n, "moveFrom") || isW(n, "moveTo")) return false;
    }
    return true;
  });
}

export function paragraphAtoms(p: Element): Atom[] {
  const atoms: Atom[] = [];
  let pos = 0;
  for (const run of paragraphRuns(p)) {
    for (let n = run.firstChild; n; n = n.nextSibling) {
      if (!isW(n)) continue;
      const name = n.localName!;
      const text = name === "t" ? (n.textContent ?? "") : ATOM_TEXT[name];
      if (text === undefined || text === "") continue;
      atoms.push({ run, node: n, text, start: pos, end: pos + text.length });
      pos += text.length;
    }
  }
  return atoms;
}

export function paragraphText(p: Element): string {
  return paragraphAtoms(p).map((a) => a.text).join("");
}

export function body(doc: Document): Element {
  return wDescendants(doc, "body")[0];
}

/** All paragraphs of the document body in reading order (including table cells). */
export function bodyParagraphs(doc: Document): Para[] {
  return wDescendants(body(doc), "p").map((el, index) => {
    const pPr = wChild(el, "pPr");
    return {
      el,
      index,
      text: paragraphText(el),
      inTable: closestW(el, "tc") !== null,
      isList: !!pPr && !!wChild(pPr, "numPr"),
    };
  });
}
