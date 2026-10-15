"""Read Karina's tracked changes out of .docx files, and rebuild the original (reject-all) document.

Text model per paragraph: a list of segments (kind, text) in document order, where kind is
  "N" (unchanged), "I" (inserted by the reviewer) or "D" (deleted by the reviewer).
Original text = N + D, final text = N + I.
"""
from __future__ import annotations

import copy
import io
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % W_NS
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"

DOC_TYPES = [
    ("recommendation", "Recommendation Letter"),
    ("video script", "Video Script"),
    ("personal statement", "Personal Statement"),
    ("study plan", "Study Plan"),
    ("studyplan", "Study Plan"),
    ("autobio", "Autobiography"),
    ("resume", "CV/Resume"),
    ("_cv", "CV/Resume"),
    ("cv ", "CV/Resume"),
    ("sop", "Statement of Purpose"),
    ("essay", "Essay"),
]

def _load_holdout() -> set[str]:
    """Documents held back from style learning and used only to measure accuracy.

    Listed in training/holdout.txt (gitignored: file names contain student names). If the file is missing,
    the 6 newest DONE_ files that contain tracked text edits are chosen and written there.
    """
    here = Path(__file__).parent
    listing = here / "holdout.txt"
    if listing.exists():
        return {line.strip() for line in listing.read_text(encoding="utf8").splitlines() if line.strip()}
    src = here.parent / "Enrollment Document_Checked for Training"
    dated = []
    for f in src.glob("DONE_*.docx"):
        m = re.search(r"(\d{8})", f.name)
        with zipfile.ZipFile(f) as z:
            has_text_edits = b"<w:delText" in z.read("word/document.xml") or b"<w:ins " in z.read("word/document.xml")
        if m and has_text_edits:
            dated.append((m.group(1), f.name))
    chosen = {name for _, name in sorted(dated, reverse=True)[:6]}
    listing.write_text("\n".join(sorted(chosen)) + "\n", encoding="utf8")
    return chosen


HOLDOUT = _load_holdout()


def doc_type_from_name(name: str) -> str:
    low = name.lower()
    for key, label in DOC_TYPES:
        if key in low:
            return label
    return "Unknown"


@dataclass
class EditUnit:
    start: int          # offset in the paragraph's original text
    before: str         # deleted text ("" for a pure insertion)
    after: str          # inserted text ("" for a pure deletion)


@dataclass
class Paragraph:
    index: int
    segments: list[tuple[str, str]]
    mark_inserted: bool = False     # paragraph mark added by reviewer (paragraph did not exist / was split)
    mark_deleted: bool = False      # paragraph mark removed by reviewer (merged with next)
    ppr_change: dict = field(default_factory=dict)   # {prop: (old, new)}
    rpr_changes: int = 0

    @property
    def original(self) -> str:
        return "".join(t for k, t in self.segments if k in "ND")

    @property
    def final(self) -> str:
        return "".join(t for k, t in self.segments if k in "NI")

    def units(self) -> list[EditUnit]:
        out: list[EditUnit] = []
        pos = 0
        cur: EditUnit | None = None
        for kind, text in self.segments:
            if kind == "N":
                if cur:
                    out.append(cur)
                    cur = None
                pos += len(text)
                continue
            if cur is None:
                cur = EditUnit(start=pos, before="", after="")
            if kind == "D":
                cur.before += text
                pos += len(text)
            else:
                cur.after += text
        if cur:
            out.append(cur)
        return [u for u in out if u.before != u.after]


def _local(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _props(el) -> dict:
    """Flatten a w:rPr / w:pPr element into {child_tag: attr_string} for comparison."""
    if el is None:
        return {}
    out = {}
    for ch in el:
        tag = _local(ch.tag)
        if tag in ("rPrChange", "pPrChange", "ins", "del", "rPr", "sectPr"):
            continue
        out[tag] = " ".join(f"{_local(k)}={v}" for k, v in sorted(ch.attrib.items()))
    return out


def _segments(p) -> list[tuple[str, str]]:
    segs: list[tuple[str, str]] = []

    def add(kind: str, text: str):
        if not text:
            return
        if segs and segs[-1][0] == kind:
            segs[-1] = (kind, segs[-1][1] + text)
        else:
            segs.append((kind, text))

    for el in p.iter(W + "t", W + "delText", W + "tab", W + "br", W + "noBreakHyphen"):
        # skip text in nested paragraphs (text boxes) - they are visited as their own paragraphs
        owner = el.getparent()
        while owner is not None and owner.tag != W + "p":
            owner = owner.getparent()
        if owner is not p:
            continue
        # tab-stop definitions (w:pPr/w:tabs/w:tab) and property children are formatting, not text
        if el.getparent() is not None and _local(el.getparent().tag) in ("rPr", "tabs", "pPr"):
            continue
        in_ins = in_del = False
        anc = el.getparent()
        while anc is not None and anc is not p:
            t = _local(anc.tag)
            if t in ("ins", "moveTo"):
                in_ins = True
            elif t in ("del", "moveFrom"):
                in_del = True
            anc = anc.getparent()
        if in_ins and in_del:
            continue  # inserted then deleted by the reviewer: in neither version
        tag = _local(el.tag)
        text = el.text or "" if tag in ("t", "delText") else {"tab": "\t", "br": "\n", "noBreakHyphen": "-"}[tag]
        add("I" if in_ins else "D" if in_del else "N", text)
    return segs


def read_paragraphs(docx_path: str | Path) -> list[Paragraph]:
    with zipfile.ZipFile(docx_path) as z:
        root = etree.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    paras = []
    for i, p in enumerate(body.iter(W + "p")):
        ppr = p.find(W + "pPr")
        mark = ppr.find(W + "rPr") if ppr is not None else None
        para = Paragraph(index=i, segments=_segments(p))
        if mark is not None:
            para.mark_inserted = mark.find(W + "ins") is not None
            para.mark_deleted = mark.find(W + "del") is not None
        if ppr is not None and ppr.find(W + "pPrChange") is not None:
            new, old = _props(ppr), _props(ppr.find(W + "pPrChange").find(W + "pPr"))
            para.ppr_change = {k: (old.get(k), new.get(k)) for k in set(new) | set(old) if old.get(k) != new.get(k)}
        para.rpr_changes = sum(1 for r in p.iter(W + "rPrChange") if _local(r.getparent().getparent().tag) == "r")
        paras.append(para)
    return paras


def redline(paras: list[Paragraph]) -> str:
    """Human-readable redline: [-deleted-]{+inserted+}, one paragraph per line."""
    lines = []
    for p in paras:
        if not p.segments and not p.ppr_change:
            continue
        txt = "".join(t if k == "N" else f"[-{t}-]" if k == "D" else f"{{+{t}+}}" for k, t in p.segments)
        flags = []
        if p.mark_inserted:
            flags.append("NEW-PARA")
        if p.mark_deleted:
            flags.append("MERGED")
        if p.ppr_change:
            flags.append("FMT:" + ",".join(sorted(p.ppr_change)))
        if p.rpr_changes:
            flags.append(f"RUNFMT:{p.rpr_changes}")
        lines.append(f"[{p.index}]{' <' + ' '.join(flags) + '>' if flags else ''} {txt}")
    return "\n".join(lines)


# ---------------------------------------------------------------- reject-all (rebuild original) ---

def _reject_xml(root) -> None:
    # 1. Remove insertions (run-level), keep the paragraph-mark markers for step 4.
    for el in list(root.iter(W + "ins", W + "moveTo")):
        if _local(el.getparent().tag) != "rPr":
            el.getparent().remove(el)
    # 2. Unwrap deletions.
    for el in list(root.iter(W + "del", W + "moveFrom")):
        parent = el.getparent()
        if _local(parent.tag) == "rPr":
            continue
        idx = parent.index(el)
        for ch in list(el):
            parent.insert(idx, ch)
            idx += 1
        parent.remove(el)
    for t in root.iter(W + "delText"):
        t.tag = W + "t"
        t.set(XML_SPACE, "preserve")
    for t in root.iter(W + "delInstrText"):
        t.tag = W + "instrText"
    # 3. Restore old formatting.
    for ch in list(root.iter(W + "rPrChange")):
        rpr = ch.getparent()
        old = ch.find(W + "rPr")
        markers = [c for c in rpr if _local(c.tag) in ("ins", "del")]
        for c in list(rpr):
            rpr.remove(c)
        for c in markers:
            rpr.append(c)
        if old is not None:
            for c in list(old):
                rpr.append(c)
    for ch in list(root.iter(W + "pPrChange")):
        ppr = ch.getparent()
        old = ch.find(W + "pPr")
        keep = [c for c in ppr if _local(c.tag) in ("rPr", "sectPr")]
        for c in list(ppr):
            ppr.remove(c)
        if old is not None:
            for c in list(old):
                ppr.append(c)
        for c in keep:
            ppr.append(c)
    for tag in ("sectPrChange", "tblPrChange", "trPrChange", "tcPrChange", "tblGridChange", "numberingChange"):
        for ch in list(root.iter(W + tag)):
            ch.getparent().remove(ch)
    # 4. Paragraph marks: inserted mark -> merge paragraph into the next one; deleted mark -> keep.
    paras = list(root.iter(W + "p"))
    for p in reversed(paras):
        ppr = p.find(W + "pPr")
        mark = ppr.find(W + "rPr") if ppr is not None else None
        if mark is None:
            continue
        for m in mark.findall(W + "del"):
            mark.remove(m)
        ins = mark.find(W + "ins")
        if ins is None:
            continue
        mark.remove(ins)
        nxt = p.getnext()
        content = [c for c in p if _local(c.tag) != "pPr"]
        if nxt is not None and nxt.tag == W + "p":
            nppr = nxt.find(W + "pPr")
            pos = 1 if nppr is not None else 0
            for c in content:
                nxt.insert(pos, c)
                pos += 1
            p.getparent().remove(p)
        elif not content:
            parent = p.getparent()
            siblings = [c for c in parent if c.tag == W + "p"]
            if len(siblings) > 1 and _local(parent.tag) != "tc":
                parent.remove(p)


def reject_all(src: str | Path, dst: str | Path) -> None:
    """Write a copy of src with every tracked change rejected (= the student's original)."""
    with zipfile.ZipFile(src) as zin:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if re.fullmatch(r"word/(document|header\d*|footer\d*|footnotes|endnotes)\.xml", item.filename):
                    root = etree.fromstring(data)
                    _reject_xml(root)
                    data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
                zout.writestr(item, data)
    Path(dst).write_bytes(buf.getvalue())


def doc_original_text(paras: list[Paragraph]) -> tuple[str, list[int]]:
    """Whole-document original text plus each paragraph's start offset in it.

    Paragraphs whose mark was inserted by the reviewer were part of the next paragraph
    originally, so no separator is added after them.
    """
    parts, starts, pos = [], [], 0
    for p in paras:
        starts.append(pos)
        t = p.original
        parts.append(t)
        pos += len(t)
        if not p.mark_inserted:
            parts.append("\n")
            pos += 1
    return "".join(parts), starts


def copy_tree(el):
    return copy.deepcopy(el)
