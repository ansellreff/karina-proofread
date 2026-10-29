import { ensureW16du, w3c } from "./dates";
import { paragraphAtoms, paragraphRuns } from "./paragraphs";
import {
  PPR_ORDER,
  RPR_ORDER,
  W16DU_NS,
  W_NS,
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

/** Reading speed for the review session: about 230 words a minute. */
const READ_CHARS_PER_MINUTE = 1300;
/** Typing speed for inserted text and notes. */
const TYPE_CHARS_PER_MINUTE = 180;
/** A long review still fits in one sitting. */
const MAX_SESSION_MINUTES = 150;

/** Writes tracked changes into word/document.xml the way Word records them. */
export class Reviser {
  private nextId: number;
  private readonly utcOffsetMinutes: number;
  private readonly now: Date;
  private readonly useDateUtc: boolean;
  /** Every revision written, with the edit it belongs to (0 = the formatting pass). */
  private readonly groupOf = new Map<Element, number>();
  private groups = 0;
  private group = 0;

  constructor(private doc: Document, identity: Identity, now = new Date()) {
    this.author = identity.author;
    let max = 0;
    for (const name of ["ins", "del", "rPrChange", "pPrChange", "sectPrChange", "tblPrChange", "comment", "commentRangeStart", "bookmarkStart"]) {
      for (const el of wDescendants(doc, name)) max = Math.max(max, Number(getW(el, "id")) || 0);
    }
    this.nextId = max + 1;
    this.utcOffsetMinutes = identity.utcOffsetMinutes;
    this.now = now;
    this.useDateUtc = ensureW16du(doc);
  }

  readonly author: string;

  private captured: string[] | null = null;

  /** Run `fn` and return the w:id values of the insertions/deletions it created (links UI items to revisions). */
  capture(fn: () => void): string[] {
    const outer = this.captured;
    const outerGroup = this.group;
    if (!outer) this.group = ++this.groups; // one edit = one moment in the review session
    this.captured = [];
    try {
      fn();
      return this.captured;
    } finally {
      const ids = this.captured;
      this.captured = outer ? [...outer, ...ids] : null;
      this.group = outerGroup;
    }
  }

  private setDate(el: Element, at: Date): void {
    setW(el, "date", w3c(new Date(at.getTime() + this.utcOffsetMinutes * 60_000)));
    if (this.useDateUtc) el.setAttributeNS(W16DU_NS, "w16du:dateUtc", w3c(at));
  }

  private stamp(el: Element): Element {
    if (this.captured && (el.localName === "ins" || el.localName === "del")) this.captured.push(String(this.nextId));
    setW(el, "id", String(this.nextId++));
    setW(el, "author", this.author);
    this.setDate(el, this.now);
    this.groupOf.set(el, this.group);
    return el;
  }

  /**
   * Give the revisions the times of a real review session that ends now, as Karina's own Word reviews have:
   * the formatting pass first, then each edit in reading order, the gaps growing with the text read in between
   * and the text typed, plus a little time to think. Changes made in the same minute share Word's minute stamp.
   */
  spreadTimes(random: () => number = Math.random): void {
    if (!this.groupOf.size) return;
    // how far into the text each revision sits, in reading order
    const at = new Map<number, number>();
    const typed = new Map<number, number>();
    let read = 0;
    const walk = (node: Element) => {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        const el = c as Element;
        const g = this.groupOf.get(el);
        if (g !== undefined) {
          if (!at.has(g)) at.set(g, g === 0 ? -1 : read);
          if (el.localName === "ins") typed.set(g, (typed.get(g) ?? 0) + (el.textContent?.length ?? 0));
        }
        if (isW(el, "t")) read += el.textContent?.length ?? 0;
        walk(el);
      }
    };
    walk(this.doc.documentElement!);
    for (const g of new Set(this.groupOf.values())) if (!at.has(g)) at.set(g, read); // outside the body (never expected)

    const order = [...at.keys()].sort((a, b) => at.get(a)! - at.get(b)! || a - b);
    let pos = 0;
    const gaps = order.map((g) => {
      if (g === 0) return 1 + random() * 2; // select all, set the font and spacing
      const reading = Math.max(0, at.get(g)! - pos) / READ_CHARS_PER_MINUTE;
      pos = Math.max(pos, at.get(g)!);
      return reading + 0.3 + random() * 1.2 + (typed.get(g) ?? 0) / TYPE_CHARS_PER_MINUTE;
    });
    const total = gaps.reduce((a, b) => a + b, 0);
    const scale = total > MAX_SESSION_MINUTES ? MAX_SESSION_MINUTES / total : 1;
    const start = this.now.getTime() - total * scale * 60_000;
    const when = new Map<number, Date>();
    let elapsed = 0;
    order.forEach((g, i) => {
      elapsed += gaps[i] * scale;
      when.set(g, new Date(Math.min(this.now.getTime(), start + elapsed * 60_000)));
    });
    for (const [el, g] of this.groupOf) this.setDate(el, when.get(g)!);
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
