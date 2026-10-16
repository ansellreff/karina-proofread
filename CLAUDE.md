# Karina Proofread Bot

Private web app that proofreads student enrollment documents (study plans, autobiographies, CVs, SOPs…) in Karina Octavia's personal review style. Plan and milestones: `C:\Users\reffr\.claude\plans\tingly-meandering-scott.md`.

## Tracking (Karina reads these to follow the project)
- `docs/PROJECT_PLAN.md`: plan, decisions, milestone status. Update when a decision or scope changes.
- `docs/PROGRESS_LOG.md`: append what was built, found and decided at each milestone step, in plain language. No student names.

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
- `cd web; npm test` — docx writer + rules + AI-layer unit tests
- `cd web; npm run dev` → http://localhost:3000 (jobs stored in `web/.data/`, gitignored)
- `cd web; node scripts/e2e.mjs <sample.docx>` — full browser check (system Edge via playwright-core; dev server must run)
- `cd web; node scripts/seed.mjs <files> [--ai]` — load documents into the local app
- `cd web; node scripts/clear-jobs.mjs [<jobId> ...]` — list jobs, or move the given ones to `web/.data/trash/`. Karina uploads her own documents to the local app too: never delete a job you didn't create in this session.
- `cd web; npx tsx scripts/score-docs.ts <file|folder>` — score documents (original vs. reviewed) to calibrate the score

## Web app notes
- SuperDoc v2 (`@superdoc/react`): document API is async (`activeEditor.doc.*` returns promises); `viewing.trackedChanges` must be `'markup'|'final'|'original'`; telemetry must stay `{ enabled: false }`.
- CSP in `next.config.ts` keeps the browser on `connect-src 'self'`.
- Editor saves go through `lib/docx/normalize.ts` (Word-identical metadata, no editor traces).

## Engine
- `web/src/lib/docx/` — OOXML engine (accept/reject, tracked insert/delete/format, Word-exact metadata). Element order in rPr/pPr matters (Word rejects out-of-order).
- `web/src/lib/rules/` — Karina Rules Engine. Every rule is backed by measured precision on her data; Harper limited to kinds that match her.
- `web/prompts/karina-rules.json` — Karina's editable rules (Review rules page, `lib/rules/config.ts` = types + factory defaults). Never hard-code rule wording or lists in the engine; add them to the config. After engine changes, compare `npm run proofread -- <docs> --rules <file>` output before/after.
- `web/src/lib/score/` — document score (0–100, no AI). Calibrate with `scripts/score-docs.ts` on the training folder.
- `web/prompts/karina-style-guide.md` — her rulebook (anonymised), used by the AI layer in M2.

## Output rules
- Tracked changes and comments are authored `Karina Octavia`; no bot/AI trace in the docx or its metadata.
- Karina's notes to students are tracked inline insertions in parentheses, not Word comments.
