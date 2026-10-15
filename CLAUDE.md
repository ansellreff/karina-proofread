# Karina Proofread Bot

Private web app that proofreads student enrollment documents (study plans, autobiographies, CVs, SOPs…) in Karina Octavia's personal review style. Plan and milestones: `C:\Users\reffr\.claude\plans\tingly-meandering-scott.md`.

## Environment (isolated — nothing installed on Windows)
- Always start a shell with `. .\dev.ps1` from the repo root. It puts portable Node (`.tools/node`) and the Python venv (`.venv`) on PATH for that session only and keeps npm/pip caches in `.tools/`.
- Never `npm install -g` or `pip install` outside `.venv`.
- New npm packages with install scripts need `npm install-scripts approve <pkg>` (npm 11 allowScripts).

## Layout
- `web/` — Next.js 16 app (App Router, TypeScript, Tailwind v4, shadcn/ui). Read `web/AGENTS.md` before writing Next.js code.
- `training/` — Python scripts that mine Karina's tracked changes from the training documents.
- `Enrollment Document_*` — student documents with personal data. **Gitignored; never commit, deploy, or quote real names in prompts/examples.**

## Commands (after `. .\dev.ps1`)
- `python training\extract_revisions.py` — mine Karina's tracked changes → `training/extracted/` (+ hold-out originals)
- `cd web; npm run proofread -- <file|folder> [--out dir] [--no-grammar]` — Karina-style tracked-changes docx (rules engine, no AI)
- `python training\eval.py --bot <dir>` — score bot output vs Karina's real edits on the 6 hold-out docs (never tune rules on them)
- `cd web; npm test` — docx writer + rules unit tests

## Engine
- `web/src/lib/docx/` — OOXML engine (accept/reject, tracked insert/delete/format, Word-exact metadata). Element order in rPr/pPr matters (Word rejects out-of-order).
- `web/src/lib/rules/` — Karina Rules Engine. Every rule is backed by measured precision on her data; Harper limited to kinds that match her.
- `web/prompts/karina-style-guide.md` — her rulebook (anonymised), used by the AI layer in M2.

## Output rules
- Tracked changes and comments are authored `Karina Octavia`; no bot/AI trace in the docx or its metadata.
- Karina's notes to students are tracked inline insertions in parentheses, not Word comments.
