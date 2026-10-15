"""Extract every tracked change from the training documents.

Outputs (all gitignored, they contain student text):
  training/extracted/revisions.jsonl   one line per edit unit, with paragraph context
  training/extracted/formatting.jsonl  one line per paragraph-format change
  training/extracted/redline/<doc>.txt readable redline per document
  training/extracted/summary.json      per-document counts
  training/output/holdout_originals/   reject-all copies of the hold-out documents (eval inputs)

Usage:  python training/extract_revisions.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from revlib import HOLDOUT, doc_type_from_name, read_paragraphs, redline, reject_all  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Enrollment Document_Checked for Training"
OUT = ROOT / "training" / "extracted"
ORIG = ROOT / "training" / "output" / "holdout_originals"


def main() -> None:
    (OUT / "redline").mkdir(parents=True, exist_ok=True)
    ORIG.mkdir(parents=True, exist_ok=True)
    summary = []
    with open(OUT / "revisions.jsonl", "w", encoding="utf8") as rev, open(OUT / "formatting.jsonl", "w", encoding="utf8") as fmt:
        for f in sorted(SRC.glob("*.docx")):
            paras = read_paragraphs(f)
            doctype = doc_type_from_name(f.name)
            holdout = f.name in HOLDOUT
            n_units = 0
            for p in paras:
                for u in p.units():
                    n_units += 1
                    rev.write(json.dumps({
                        "doc": f.name, "doctype": doctype, "holdout": holdout, "para": p.index,
                        "before": u.before, "after": u.after, "start": u.start,
                        "para_original": p.original, "para_final": p.final,
                        "new_para": p.mark_inserted, "merged": p.mark_deleted,
                    }, ensure_ascii=False) + "\n")
                if p.ppr_change:
                    fmt.write(json.dumps({
                        "doc": f.name, "doctype": doctype, "holdout": holdout, "para": p.index,
                        "change": p.ppr_change, "text": p.final[:80],
                    }, ensure_ascii=False) + "\n")
            (OUT / "redline" / (f.stem + ".txt")).write_text(redline(paras), encoding="utf8")
            if holdout:
                reject_all(f, ORIG / f.name)
            summary.append({
                "doc": f.name, "doctype": doctype, "holdout": holdout, "paragraphs": len(paras),
                "edit_units": n_units,
                "para_format_changes": sum(1 for p in paras if p.ppr_change),
                "run_format_changes": sum(p.rpr_changes for p in paras),
            })
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf8")
    train = [s for s in summary if not s["holdout"]]
    print(f"{len(summary)} documents ({len(train)} training, {len(summary) - len(train)} hold-out)")
    print(f"edit units: {sum(s['edit_units'] for s in summary)} total, {sum(s['edit_units'] for s in train)} in training docs")
    for s in summary:
        print(f"  {'H' if s['holdout'] else ' '} {s['doctype']:22} units={s['edit_units']:4} pfmt={s['para_format_changes']:4} rfmt={s['run_format_changes']:5}  {s['doc']}")


if __name__ == "__main__":
    main()
