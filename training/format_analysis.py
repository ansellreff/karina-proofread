"""How does Karina handle formatting? Compares effective body formatting before (reject-all) and after (as reviewed).

Effective property = run rPr -> paragraph style chain -> docDefaults (simplified; theme fonts reported as 'theme').
Usage: python training/format_analysis.py
"""
from __future__ import annotations

import collections
import io
import sys
import tempfile
import zipfile
from pathlib import Path

from lxml import etree

sys.path.insert(0, str(Path(__file__).parent))
from revlib import HOLDOUT, W, reject_all  # noqa: E402

SRC = Path(__file__).resolve().parent.parent / "Enrollment Document_Checked for Training"


def load(path):
    z = zipfile.ZipFile(path)
    doc = etree.fromstring(z.read("word/document.xml"))
    styles = etree.fromstring(z.read("word/styles.xml")) if "word/styles.xml" in z.namelist() else None
    return doc, styles


def style_map(styles):
    m, default_para = {}, None
    if styles is None:
        return m, None, {}, {}
    for s in styles.iter(W + "style"):
        sid = s.get(W + "styleId")
        m[sid] = s
        if s.get(W + "type") == "paragraph" and s.get(W + "default") == "1":
            default_para = sid
    dd = styles.find(W + "docDefaults")
    drpr = dd.find(f"{W}rPrDefault/{W}rPr") if dd is not None else None
    dppr = dd.find(f"{W}pPrDefault/{W}pPr") if dd is not None else None
    return m, default_para, drpr, dppr


def font_of(rpr):
    if rpr is None:
        return None
    f = rpr.find(W + "rFonts")
    if f is None:
        return None
    if f.get(W + "ascii"):
        return f.get(W + "ascii")
    if f.get(W + "hAnsi"):
        return f.get(W + "hAnsi")
    if f.get(W + "asciiTheme"):
        return "theme"
    return None


def size_of(rpr):
    if rpr is None:
        return None
    s = rpr.find(W + "sz")
    return int(s.get(W + "val")) / 2 if s is not None else None


def chain(sid, m):
    out, seen = [], set()
    while sid and sid in m and sid not in seen:
        seen.add(sid)
        out.append(m[sid])
        b = m[sid].find(W + "basedOn")
        sid = b.get(W + "val") if b is not None else None
    return out


def effective(doc, styles):
    m, default_para, drpr, dppr = style_map(styles)
    fonts, sizes, jcs, spacing = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
    for p in doc.iter(W + "p"):
        text = "".join(t.text or "" for t in p.iter(W + "t"))
        if len(text.split()) < 12:  # body paragraphs only
            continue
        ppr = p.find(W + "pPr")
        ps = ppr.find(W + "pStyle") if ppr is not None else None
        sid = ps.get(W + "val") if ps is not None else default_para
        sch = chain(sid, m)
        jc = None
        line = None
        for src in [ppr] + [s.find(W + "pPr") for s in sch] + [dppr]:
            if src is None:
                continue
            if jc is None and src.find(W + "jc") is not None:
                jc = src.find(W + "jc").get(W + "val")
            sp = src.find(W + "spacing")
            if line is None and sp is not None and sp.get(W + "line"):
                line = int(sp.get(W + "line")) / 240
        jcs[jc or "left"] += 1
        spacing[line or 1.0] += 1
        for r in p.iter(W + "r"):
            rt = "".join(t.text or "" for t in r.iter(W + "t"))
            if not rt.strip():
                continue
            f = s = None
            for src in [r.find(W + "rPr")] + [st.find(W + "rPr") for st in sch] + [drpr]:
                f = f or font_of(src)
                s = s or size_of(src)
            fonts[f or "?"] += len(rt)
            sizes[s or 10] += len(rt)
    top = lambda c: c.most_common(1)[0][0] if c else None
    return top(fonts), top(sizes), top(jcs), top(spacing)


def main():
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for f in sorted(SRC.glob("*.docx")):
            if f.name in HOLDOUT:
                continue
            orig = Path(tmp) / f.name
            reject_all(f, orig)
            before = effective(*load(orig))
            after = effective(*load(f))
            rows.append((f.name[:45], before, after))
    print(f"{'document':45} | font/size/align/spacing BEFORE  ->  AFTER")
    stats = collections.Counter()
    for name, b, a in rows:
        print(f"{name:45} | {b}  ->  {a}")
        for i, label in enumerate(["font", "size", "align", "spacing"]):
            stats[(label, "deviates")] += b[i] != {0: "Times New Roman", 1: 12, 2: "both", 3: 1.5}[i]
            stats[(label, "fixed")] += b[i] != a[i]
    print()
    for label in ["font", "size", "align", "spacing"]:
        print(f"{label:8} non-standard before: {stats[(label, 'deviates')]:2}/{len(rows)}   changed by Karina: {stats[(label, 'fixed')]:2}")


if __name__ == "__main__":
    main()
