import { getW, wChild, wChildren, wDescendants, type Document, type Element } from "./xml";

export interface RunFormat {
  font: string | null; // "theme" when the font comes from the theme
  halfPoints: number | null;
}

export interface ParaFormat {
  jc: string | null;
  line: number | null; // line spacing in 240ths (240 = single) when lineRule is auto
}

/** Simplified effective-formatting resolver: direct formatting -> style chain -> document defaults. */
export class StyleResolver {
  private styles = new Map<string, Element>();
  private defaultParaStyle: string | null = null;
  private defaultRPr: Element | null = null;
  private defaultPPr: Element | null = null;

  constructor(stylesDoc: Document | null) {
    if (!stylesDoc) return;
    for (const s of wDescendants(stylesDoc, "style")) {
      const id = getW(s, "styleId");
      if (!id) continue;
      this.styles.set(id, s);
      if (getW(s, "type") === "paragraph" && getW(s, "default") === "1") this.defaultParaStyle = id;
    }
    const dd = wDescendants(stylesDoc, "docDefaults")[0];
    if (dd) {
      this.defaultRPr = wChild(wChild(dd, "rPrDefault") ?? dd, "rPr");
      this.defaultPPr = wChild(wChild(dd, "pPrDefault") ?? dd, "pPr");
    }
  }

  private chain(styleId: string | null): Element[] {
    const out: Element[] = [];
    const seen = new Set<string>();
    let id = styleId;
    while (id && this.styles.has(id) && !seen.has(id)) {
      seen.add(id);
      const s = this.styles.get(id)!;
      out.push(s);
      const based = wChild(s, "basedOn");
      id = based ? getW(based, "val") : null;
    }
    return out;
  }

  private paraStyleChain(p: Element): Element[] {
    const pPr = wChild(p, "pPr");
    const ps = pPr && wChild(pPr, "pStyle");
    return this.chain(ps ? getW(ps, "val") : this.defaultParaStyle);
  }

  run(p: Element, run: Element): RunFormat {
    const rPr = wChild(run, "rPr");
    const rs = rPr && wChild(rPr, "rStyle");
    const sources: (Element | null)[] = [
      rPr,
      ...this.chain(rs ? getW(rs, "val") : null).map((s) => wChild(s, "rPr")),
      ...this.paraStyleChain(p).map((s) => wChild(s, "rPr")),
      this.defaultRPr,
    ];
    let font: string | null = null;
    let halfPoints: number | null = null;
    for (const src of sources) {
      if (!src) continue;
      const f = wChild(src, "rFonts");
      if (!font && f) {
        // Theme attributes take precedence over explicit names in Word.
        if (getW(f, "asciiTheme") || getW(f, "hAnsiTheme")) font = "theme";
        else font = getW(f, "ascii") || getW(f, "hAnsi");
      }
      const sz = wChild(src, "sz");
      if (halfPoints === null && sz) halfPoints = Number(getW(sz, "val"));
    }
    return { font, halfPoints: halfPoints ?? 20 };
  }

  para(p: Element): ParaFormat {
    const sources = [wChild(p, "pPr"), ...this.paraStyleChain(p).map((s) => wChild(s, "pPr")), this.defaultPPr];
    let jc: string | null = null;
    let line: number | null = null;
    for (const src of sources) {
      if (!src) continue;
      const j = wChild(src, "jc");
      if (!jc && j) jc = getW(j, "val");
      const sp = wChild(src, "spacing");
      if (line === null && sp && getW(sp, "line")) {
        const rule = getW(sp, "lineRule");
        line = rule === null || rule === "auto" ? Number(getW(sp, "line")) : null;
      }
    }
    return { jc: jc ?? "left", line: line ?? 240 };
  }

  isListStyle(p: Element): boolean {
    return this.paraStyleChain(p).some((s) => wChildren(wChild(s, "pPr") ?? s, "numPr").length > 0);
  }
}
