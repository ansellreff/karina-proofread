"""Score the bot's proofread files against Karina's real edits on the hold-out documents.

Both files share the same original text (the bot's input is the reject-all copy of Karina's file),
so every edit is placed on that common text and compared by location.

  matched (location): a Karina edit and a bot edit touch the same place (insertions within 3 chars)
  exact:              same place and the same replacement text (case/apostrophe/space-insensitive)

Usage:
  python training/eval.py --bot training/output/bot_rules [--label "Rules only"] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from format_analysis import effective, load  # noqa: E402
from revlib import HOLDOUT, doc_original_text, read_paragraphs  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KARINA = ROOT / "Enrollment Document_Checked for Training"
TOL = 3


@dataclass
class Unit:
    start: int
    end: int
    before: str
    after: str
    category: str


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("“", '"').replace("”", '"')).strip().lower()


def units(path: Path) -> tuple[list[Unit], int]:
    paras = read_paragraphs(path)
    text, starts = doc_original_text(paras)
    first_body = next((starts[i] for i, p in enumerate(paras) if len(p.original.split()) >= 15), 0)
    last_body = max((starts[i] + len(p.original) for i, p in enumerate(paras) if p.original.strip()), default=len(text))
    out = []
    for i, p in enumerate(paras):
        for u in p.units():
            s = starts[i] + u.start
            e = s + len(u.before)
            if not u.before and s <= first_body and (p.mark_inserted or not p.original.strip()):
                cat = "header"
            elif not u.before and s >= last_body:
                cat = "end-note"
            elif not u.before and (re.search(r"\(.{6,}\)|\?\?|\?\)", u.after) or u.after.strip().startswith("(")):
                cat = "inline-note"
            elif not u.before and len(u.after.split()) > 8:
                cat = "added-content"
            elif u.before and not u.after and len(u.before.split()) >= 12:
                cat = "cut"
            else:
                cat = "fix"
            out.append(Unit(s, e, u.before, u.after, cat))
    return out, len(text)


def overlaps(a: Unit, b: Unit) -> bool:
    a0, a1 = (a.start - TOL, a.end + TOL) if a.start == a.end else (a.start, a.end)
    b0, b1 = (b.start - TOL, b.end + TOL) if b.start == b.end else (b.start, b.end)
    return a0 < b1 and b0 < a1


def exact(a: Unit, b: Unit) -> bool:
    return overlaps(a, b) and norm(a.before) == norm(b.before) and norm(a.after) == norm(b.after)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bot", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--json")
    args = ap.parse_args()
    bot_dir = Path(args.bot)

    rows, cats, per_rule = [], {}, {}
    tot = {"k": 0, "b": 0, "k_hit": 0, "b_hit": 0, "exact": 0, "fmt_agree": 0, "fmt_total": 0}
    for name in sorted(HOLDOUT):
        k_units, _ = units(KARINA / name)
        b_path = bot_dir / name
        if not b_path.exists():
            continue
        b_units, _ = units(b_path)
        k_hit = [k for k in k_units if any(overlaps(k, b) for b in b_units)]
        b_hit = [b for b in b_units if any(overlaps(k, b) for k in k_units)]
        ex = [k for k in k_units if any(exact(k, b) for b in b_units)]
        for k in k_units:
            c = cats.setdefault(k.category, {"karina": 0, "matched": 0, "bot": 0, "bot_matched": 0})
            c["karina"] += 1
            c["matched"] += k in k_hit
        for b in b_units:
            c = cats.setdefault(b.category, {"karina": 0, "matched": 0, "bot": 0, "bot_matched": 0})
            c["bot"] += 1
            c["bot_matched"] += b in b_hit
        sidecar = b_path.with_name(b_path.stem + ".changes.json")
        if sidecar.exists():
            orig = ROOT / "training" / "output" / "holdout_originals" / name
            _, starts = doc_original_text(read_paragraphs(orig))
            for ch in json.loads(sidecar.read_text(encoding="utf8")):
                s = starts[ch["paragraph"]] + ch["start"]
                u = Unit(s, starts[ch["paragraph"]] + ch["end"], ch["before"], ch["after"], "")
                r = per_rule.setdefault(ch["rule"], {"n": 0, "hit": 0, "exact": 0, "examples": []})
                r["n"] += 1
                hit = any(overlaps(k, u) for k in k_units)
                r["hit"] += hit
                r["exact"] += any(exact(k, u) for k in k_units)
                if len(r["examples"]) < 4:
                    r["examples"].append(("✓ " if hit else "✗ ") + (f"{ch['before']!r} -> " if ch["before"] else "") + repr(ch["after"][:60]))
        kf, bf = effective(*load(KARINA / name)), effective(*load(b_path))
        agree = sum(1 for x, y in zip(kf, bf) if x == y)
        rows.append({"doc": name, "karina": len(k_units), "bot": len(b_units), "recall": len(k_hit) / max(1, len(k_units)),
                     "precision": len(b_hit) / max(1, len(b_units)), "exact": len(ex), "format_agree": f"{agree}/4",
                     "karina_format": kf, "bot_format": bf})
        tot["k"] += len(k_units); tot["b"] += len(b_units); tot["k_hit"] += len(k_hit); tot["b_hit"] += len(b_hit)
        tot["exact"] += len(ex); tot["fmt_agree"] += agree; tot["fmt_total"] += 4

    recall = tot["k_hit"] / max(1, tot["k"])
    precision = tot["b_hit"] / max(1, tot["b"])
    f1 = 2 * recall * precision / max(1e-9, recall + precision)
    print(f"\n=== {args.label or bot_dir.name} — hold-out documents: {len(rows)} ===")
    print(f"{'document':42} {'Karina':>6} {'bot':>5} {'recall':>7} {'precis.':>7} {'exact':>5}  format")
    for r in rows:
        print(f"{r['doc'][:42]:42} {r['karina']:6} {r['bot']:5} {r['recall']:7.0%} {r['precision']:7.0%} {r['exact']:5}  {r['format_agree']}")
    print(f"{'TOTAL':42} {tot['k']:6} {tot['b']:5} {recall:7.0%} {precision:7.0%} {tot['exact']:5}  {tot['fmt_agree']}/{tot['fmt_total']}")
    print(f"\nLocation match: recall {recall:.0%} (Karina's edits the bot also made), precision {precision:.0%} (bot edits Karina also made), F1 {f1:.0%}")
    print(f"Exact same wording: {tot['exact']}/{tot['k']} ({tot['exact'] / max(1, tot['k']):.0%})   Formatting agreement: {tot['fmt_agree']}/{tot['fmt_total']}")
    print(f"\n{'by type':16} {'Karina':>6} {'found':>6} {'recall':>7} | {'bot':>5} {'precis.':>7}")
    for c, v in sorted(cats.items()):
        print(f"{c:16} {v['karina']:6} {v['matched']:6} {v['matched'] / max(1, v['karina']):7.0%} | {v['bot']:5} {v['bot_matched'] / max(1, v['bot']):7.0%}")
    if per_rule:
        print(f"\n{'bot rule':28} {'edits':>5} {'Karina also edited there':>24} {'exact':>6}")
        for rule, v in sorted(per_rule.items(), key=lambda kv: -kv[1]["n"]):
            print(f"{rule:28} {v['n']:5} {v['hit']:>12} ({v['hit'] / v['n']:4.0%})      {v['exact']:6}   {' | '.join(v['examples'][:2])[:120]}")
    if args.json:
        Path(args.json).write_text(json.dumps({"label": args.label, "rows": rows, "totals": tot, "categories": cats, "rules": per_rule,
                                               "recall": recall, "precision": precision, "f1": f1}, indent=1, default=str), encoding="utf8")


if __name__ == "__main__":
    main()
