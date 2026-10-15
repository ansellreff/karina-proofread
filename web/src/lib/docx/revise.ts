import { paragraphAtoms, paragraphRuns } from "./paragraphs";
import {
  MC_NS,
  PPR_ORDER,
  RPR_ORDER,
  W16DU_NS,
  W_NS,
  XMLNS_NS,
  ensureFirstChild,
  getW,
  insertAfter,
  isW,
  putOrdered,
  setW,
  textEl,
  wChild,
  wDescendants,
  wEl,
  type Document,
  type Element,
} from "./xml";

export interface Identity {
  author: string;
  /** Minutes east of UTC for the reviewer's clock (Word writes local time with a "Z"). */
  utcOffsetMinutes: number;
  providerId?: string;
  userId?: string;
}

export interface NewParagraph {
  text: string;
  bold?: boolean;
  align?: "left" | "center" | "both";
  /** Paragraph whose formatting the new paragraph copies. */
  template?: Element;
}

const pad = (n: number) => String(n).padStart(2, "0");
function w3c(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`;
}

/** Writes tracked changes into word/document.xml the way Word records them. */
export class Reviser {
  private nextId: number;
  private readonly localDate: string;
  private readonly utcDate: string;
  private readonly useDateUtc: boolean;

  constructor(private doc: Document, identity: Identity, now = new Date()) {
    this.author = identity.author;
    let max = 0;
    for (const name of ["ins", "del", "rPrChange", "pPrChange", "sectPrChange", "tblPrChange", "comment", "commentRangeStart", "bookmarkStart"]) {
      for (const el of wDescendants(doc, name)) max = Math.max(max, Number(getW(el, "id")) || 0);
    }
    this.nextId = max + 1;
    this.localDate = w3c(new Date(now.getTime() + identity.utcOffsetMinutes * 60_000));
    this.utcDate = w3c(now);
    this.useDateUtc = ensureW16du(doc);
  }

  readonly author: string;

  private stamp(el: Element): Element {
    setW(el, "id", String(this.nextId++));
    setW(el, "author", this.author);
    setW(el, "date", this.localDate);
    if (this.useDateUtc) el.setAttributeNS(W16DU_NS, "w16du:dateUtc", this.utcDate);
    return el;
  }

  private revision(name: "ins" | "del" | "rPrChange" | "pPrChange"): Element {
    return this.stamp(wEl(this.doc, name));
  }

  // ------------------------------------------------------------------ run splitting ---

  /** Split `run` so that `node` (and, for a w:t, its first `chars` characters) stay in the first half. */
  private splitRun(run: Element, node: Element, chars: number | null): Element {
    const second = run.cloneNode(false) as Element;
    const rPr = wChild(run, "rPr");
    if (rPr) {
      const copy = rPr.cloneNode(true) as Element;
      for (const ch of wDescendants(copy, "rPrChange")) this.stamp(ch);
      second.appendChild(copy);
    }
    if (chars !== null && isW(node, "t")) {
      const text = node.textContent ?? "";
      node.textContent = text.slice(0, chars);
      second.appendChild(textEl(this.doc, "t", text.slice(chars)));
    }
    let n = node.nextSibling;
    while (n) {
      const next = n.nextSibling;
      second.appendChild(n);
      n = next;
    }
    insertAfter(second, run);
    return second;
  }

  /** Make sure a run boundary exists at `offset` in paragraph `p`. */
  private boundary(p: Element, offset: number): void {
    const atoms = paragraphAtoms(p);
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      if (a.start < offset && offset < a.end) {
        this.splitRun(a.run, a.node, offset - a.start);
        return;
      }
      if (a.end === offset && atoms[i + 1] && atoms[i + 1].run === a.run) {
        this.splitRun(a.run, a.node, null);
        return;
      }
    }
  }

  private makeRun(rPr: Element | null, text: string, ins = false): Element {
    const r = wEl(this.doc, "r");
    if (rPr) {
      const copy = rPr.cloneNode(true) as Element;
      for (const ch of wDescendants(copy, "rPrChange")) ch.parentNode!.removeChild(ch);
      r.appendChild(copy);
    }
    const parts = text.split(/(\t|\n)/);
    for (const part of parts) {
      if (part === "") continue;
      if (part === "\t") r.appendChild(wEl(this.doc, "tab"));
      else if (part === "\n") r.appendChild(wEl(this.doc, "br"));
      else r.appendChild(textEl(this.doc, "t", part));
    }
    if (ins) {
      const wrap = this.revision("ins");
      wrap.appendChild(r);
      return wrap;
    }
    return r;
  }

  private wrapDeleted(run: Element): Element {
    const del = this.revision("del");
    run.parentNode!.insertBefore(del, run);
    del.appendChild(run);
    for (const t of wDescendants(run, "t")) {
      const dt = textEl(this.doc, "delText", t.textContent ?? "");
      run.replaceChild(dt, t);
    }
    for (const it of wDescendants(run, "instrText")) {
      const d = wEl(this.doc, "delInstrText");
      d.appendChild(this.doc.createTextNode(it.textContent ?? ""));
      run.replaceChild(d, it);
    }
    return del;
  }

  // ------------------------------------------------------------------ text edits ---

  /**
   * Replace characters [start, end) of paragraph `p` with `text` as tracked changes.
   * Apply several edits on one paragraph from the last offset to the first.
   */
  replace(p: Element, start: number, end: number, text: string): void {
    let deleted: Element[] = [];
    if (end > start) {
      this.boundary(p, start);
      this.boundary(p, end);
      const runs: Element[] = [];
      for (const a of paragraphAtoms(p)) {
        if (a.start >= start && a.end <= end && !runs.includes(a.run)) runs.push(a.run);
      }
      deleted = runs.map((r) => this.wrapDeleted(r));
    }
    if (!text) return;

    if (!deleted.length) this.boundary(p, start);
    const atoms = paragraphAtoms(p);
    const before = [...atoms].reverse().find((a) => a.end <= start);
    const after = atoms.find((a) => a.start >= start);
    const source = deleted.length ? wChild(deleted[0], "r") : (before ?? after)?.run ?? null;
    const ins = this.makeRun(source ? wChild(source, "rPr") : null, text, true);

    if (deleted.length) {
      insertAfter(ins, deleted[deleted.length - 1]);
    } else if (before && before.end === start) {
      insertAfter(ins, before.run);
    } else if (after) {
      after.run.parentNode!.insertBefore(ins, after.run);
    } else {
      p.appendChild(ins);
    }
  }

  insertAt(p: Element, offset: number, text: string): void {
    this.replace(p, offset, offset, text);
  }

  /** Delete a whole paragraph (its text and its paragraph mark). */
  deleteParagraph(p: Element): void {
    for (const run of paragraphRuns(p)) this.wrapDeleted(run);
    const mark = ensureFirstChildOrdered(ensureFirstChild(p, "pPr"), "rPr");
    putOrdered(mark, this.revision("del"), RPR_ORDER);
  }

  // ------------------------------------------------------------------ new paragraphs ---

  private newParagraph(spec: NewParagraph, markInserted: boolean): Element {
    const p = wEl(this.doc, "p");
    const pPr = wEl(this.doc, "pPr");
    const tplPPr = spec.template ? wChild(spec.template, "pPr") : null;
    if (tplPPr) {
      for (let n = tplPPr.firstChild; n; n = n.nextSibling) {
        if (isW(n) && !["rPr", "sectPr", "pPrChange", "numPr"].includes(n.localName!)) pPr.appendChild(n.cloneNode(true));
      }
    }
    if (spec.align) putOrdered(pPr, wEl(this.doc, "jc", { val: spec.align }), PPR_ORDER);
    const tplRun = spec.template ? paragraphRuns(spec.template)[0] : undefined;
    const runRPr = (tplRun && (wChild(tplRun, "rPr")?.cloneNode(true) as Element)) || wEl(this.doc, "rPr");
    for (const ch of wDescendants(runRPr, "rPrChange")) ch.parentNode!.removeChild(ch);
    for (const name of ["b", "bCs"]) {
      const old = wChild(runRPr, name);
      if (old) runRPr.removeChild(old);
      if (spec.bold) putOrdered(runRPr, wEl(this.doc, name), RPR_ORDER);
    }
    const mark = runRPr.cloneNode(true) as Element;
    if (markInserted) putOrdered(mark, this.revision("ins"), RPR_ORDER);
    pPr.appendChild(mark);
    p.appendChild(pPr);
    if (spec.text) p.appendChild(this.makeRun(runRPr, spec.text, true));
    return p;
  }

  /** Insert new paragraphs before `ref` (e.g. a header block at the top of the document). */
  insertParagraphsBefore(ref: Element, specs: NewParagraph[]): Element[] {
    return specs.map((s) => {
      const p = this.newParagraph({ template: ref, ...s }, true);
      ref.parentNode!.insertBefore(p, ref);
      return p;
    });
  }

  /** Insert new paragraphs after `ref`. When `ref` is the last paragraph of the body, records it the way Word does. */
  insertParagraphsAfter(ref: Element, specs: NewParagraph[]): Element[] {
    if (!specs.length) return [];
    const next = ref.nextSibling;
    const isLast = !next || !(isW(next, "p") || isW(next, "tbl"));
    if (!isLast) {
      const anchor = next as Element;
      return specs.map((s) => {
        const p = this.newParagraph({ template: ref, ...s }, true);
        anchor.parentNode!.insertBefore(p, anchor);
        return p;
      });
    }
    // Typing Enter at the end of the last paragraph: the old final mark moves to the new last paragraph,
    // and `ref` gets an inserted mark. Rejecting merges everything back into one paragraph with ref's formatting.
    const created: Element[] = [];
    let after: Element = ref;
    specs.forEach((s, i) => {
      const last = i === specs.length - 1;
      const p = this.newParagraph({ template: ref, ...s }, !last);
      if (last) {
        const refPPr = wChild(ref, "pPr");
        const pPr = wChild(p, "pPr")!;
        if (refPPr) {
          const kept = refPPr.cloneNode(true) as Element;
          for (const ch of wDescendants(kept, "pPrChange")) ch.parentNode!.removeChild(ch);
          p.replaceChild(kept, pPr);
          if (s.align) putOrdered(kept, wEl(this.doc, "jc", { val: s.align }), PPR_ORDER);
        }
      }
      insertAfter(p, after);
      after = p;
      created.push(p);
    });
    const refMark = ensureFirstChildOrdered(ensureFirstChild(ref, "pPr"), "rPr");
    putOrdered(refMark, this.revision("ins"), RPR_ORDER);
    return created;
  }

  // ------------------------------------------------------------------ formatting ---

  /** Tracked run formatting change (font name and/or size in half-points). */
  formatRun(run: Element, change: { font?: string; halfPoints?: number }): void {
    const rPr = ensureFirstChild(run, "rPr");
    this.formatProps(rPr, change);
  }

  /** Same as formatRun, for the paragraph mark of `p`. */
  formatMark(p: Element, change: { font?: string; halfPoints?: number }): void {
    const mark = ensureFirstChildOrdered(ensureFirstChild(p, "pPr"), "rPr");
    this.formatProps(mark, change);
  }

  private formatProps(rPr: Element, change: { font?: string; halfPoints?: number }): void {
    if (wChild(rPr, "rPrChange")) return;
    const old = wEl(this.doc, "rPr");
    for (let n = rPr.firstChild; n; n = n.nextSibling) {
      if (isW(n) && !["ins", "del", "moveFrom", "moveTo"].includes(n.localName!)) old.appendChild(n.cloneNode(true));
    }
    if (change.font) {
      const f = wChild(rPr, "rFonts") ?? putOrdered(rPr, wEl(this.doc, "rFonts"), RPR_ORDER);
      for (const a of ["asciiTheme", "hAnsiTheme", "cstheme"]) if (f.hasAttributeNS(W_NS, a)) f.removeAttributeNS(W_NS, a);
      setW(f, "ascii", change.font);
      setW(f, "hAnsi", change.font);
      setW(f, "cs", change.font);
    }
    if (change.halfPoints) {
      putOrdered(rPr, wEl(this.doc, "sz", { val: String(change.halfPoints) }), RPR_ORDER);
      putOrdered(rPr, wEl(this.doc, "szCs", { val: String(change.halfPoints) }), RPR_ORDER);
    }
    const ch = this.revision("rPrChange");
    ch.appendChild(old);
    putOrdered(rPr, ch, RPR_ORDER);
  }

  /** Tracked paragraph formatting change (alignment and/or auto line spacing in 240ths). */
  formatParagraph(p: Element, change: { jc?: string; line?: number }): void {
    const pPr = ensureFirstChild(p, "pPr");
    if (wChild(pPr, "pPrChange")) return;
    const old = wEl(this.doc, "pPr");
    for (let n = pPr.firstChild; n; n = n.nextSibling) {
      if (isW(n) && !["rPr", "sectPr", "pPrChange"].includes(n.localName!)) old.appendChild(n.cloneNode(true));
    }
    if (change.jc) putOrdered(pPr, wEl(this.doc, "jc", { val: change.jc }), PPR_ORDER);
    if (change.line) {
      const sp = (wChild(pPr, "spacing")?.cloneNode(true) as Element) ?? wEl(this.doc, "spacing");
      setW(sp, "line", String(change.line));
      setW(sp, "lineRule", "auto");
      putOrdered(pPr, sp, PPR_ORDER);
    }
    const ch = this.revision("pPrChange");
    ch.appendChild(old);
    putOrdered(pPr, ch, PPR_ORDER);
  }
}

function ensureFirstChildOrdered(pPr: Element, name: "rPr"): Element {
  return wChild(pPr, name) ?? putOrdered(pPr, wEl(pPr.ownerDocument!, name), PPR_ORDER);
}

/** Declare the w16du namespace (Word 2023+ UTC revision dates) on the document root if possible. */
function ensureW16du(doc: Document): boolean {
  const root = doc.documentElement!;
  if (root.getAttribute("xmlns:w16du")) return true;
  const ignorable = root.getAttributeNS(MC_NS, "Ignorable");
  if (!root.getAttribute("xmlns:mc")) return false;
  root.setAttributeNS(XMLNS_NS, "xmlns:w16du", W16DU_NS);
  root.setAttributeNS(MC_NS, "mc:Ignorable", ignorable ? `${ignorable} w16du` : "w16du");
  return true;
}
