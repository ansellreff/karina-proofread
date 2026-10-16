# Karina Proofread Bot

Private web app that proofreads student enrollment documents (study plans, autobiographies, CVs, SOPs…) in Karina Octavia's personal review style. Plan and milestones: `docs/PROJECT_PLAN.md`.

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
- `cd web; node scripts/e2e.mjs <sample.docx> [--pdf <sample.pdf>]` — full browser check (system Edge via playwright-core; dev server must run)
- `cd web; node scripts/seed.mjs <files> [--ai] [--no-proofread]` — load .docx/.pdf documents into the local app
- `cd web; npx tsx scripts/pdf-to-docx.ts <file.pdf> --out <dir> [--text]` — check PDF→Word conversion (`lib/pdf/pdf-to-docx.ts`, pdf.js)
- `cd web; node scripts/make-icons.mjs` — re-render the phone-install icons from `src/app/icon.svg`
- `cd web; node scripts/shots.mjs <jobId> <outDir> [--dark-only] [--paper dark]` — screenshots of every screen, light/dark, desktop/phone (design review)

## Theme
- Light/dark tokens in `web/src/app/globals.css` (`:root` and `.dark`; every pair checked ≥ 4.5:1). Never hard-code colours in components; use tokens (`--mark-foreground`, `--shadow-color` exist for chips and shadows).
- SuperDoc follows the theme through its `--sd-*` tokens under `html.dark`; the page stays white via `--sd-layout-page-bg`. Optional dark paper = `html[data-paper="dark"]` (filter invert). The print view forces light.
- `cd web; node scripts/clear-jobs.mjs [<jobId> ...]` — list jobs, or move the given ones to `web/.data/trash/`. Karina uploads her own documents to the local app too: never delete a job you didn't create in this session.
- `cd web; npx tsx scripts/score-docs.ts <file|folder>` — score documents (original vs. reviewed) to calibrate the score
- `cd web; npx tsx scripts/learn.ts <file|folder> [--store <dir>] [--apply <out.json>] [--show]` — learn from Karina's reviewed Word files (skips the hold-out set); `--store` a scratch dir to keep the app's data untouched, `--apply` writes rules with every rule proposal approved (for the before/after accuracy test)

## Storage, sign-in, online (M4)
- **Two modes:**
  - **Local:** no `DATABASE_URL`. Files in `web/.data`, rules in `web/prompts`. This is what the tests and e2e use.
  - **Online (Vercel):** files in Neon Postgres (`DATABASE_URL`, one `app_files` table), rules under `settings/` with the bundled `prompts/*` as defaults. On Vercel, a missing `DATABASE_URL` shows a "setup isn't finished" page (`src/proxy.ts`). Setup: `docs/ONLINE_SETUP.md`.
  - **No sign-in** (Karina's decision, 2026-10-17): the app is public to anyone with the address. The password sign-in, with in-app change and Vercel reset, is in git history at `c272e1c`. Microsoft sign-in and OneDrive are at `6bda307` (Azure wasn't available to her).
- **Getting the stores:** pages and routes get them with `await stores()` (`lib/storage/stores.ts`). The command-line scripts use `localStores()` (`lib/storage/local.ts`). Never read or write `.data` or `prompts` directly: go through `AppFiles` (`lib/storage/files.ts`: local `FsFiles`, `PgFiles` in `pg-files.ts`).
- **`/api/version`:** reports the deployed commit and whether the database is connected.
- **Trying online mode on this PC:**
  1. `DATABASE_URL=pglite:<folder>` (PGlite, a dev dependency).
  2. `next build`, then `next start -p 3100` with `__NEXT_PROCESSED_ENV=true`, so `.env.local` is ignored.
  3. `node scripts/e2e-online.mjs <sample.docx> --base http://localhost:3100`.
- **Data copy:** `scripts/copy-to-online.ts` copies `.data` and the prompts to the online database once (with `DATABASE_URL` set in the shell only).
- **Pushing:** `push.bat` (repo root):
  1. `git add -A`.
  2. `web/scripts/prepush-check.mjs`: blocks student names (from the document folders and `.data`), private files and keys in everything not yet on GitHub.
  3. Commit as Karina Octavia, then push.
  4. `web/scripts/vercel-check.mjs`: waits until `/api/version` reports the pushed commit, otherwise prints the Vercel redeploy reminder.
  - Push only with Karina's OK. After any push, confirm Vercel updated.
- **Build traces:** `next.config.ts` traces `prompts/*` and the pdf.js worker and fonts, and **excludes `.data` and backups**. After config changes, check that no `.nft.json` lists `.data`.
- **Hold-out guard:** SHA-256 of the 6 test files in `lib/learn/holdout.ts`, with no names.

## Web app notes
- SuperDoc v2 (`@superdoc/react`): document API is async (`activeEditor.doc.*` returns promises); `viewing.trackedChanges` must be `'markup'|'final'|'original'`; telemetry must stay `{ enabled: false }`.
- CSP in `next.config.ts` keeps the browser on `connect-src 'self'`.
- Editor saves go through `lib/docx/normalize.ts` (Word-identical metadata, no editor traces).

## Engine
- `web/src/lib/docx/` — OOXML engine (accept/reject, tracked insert/delete/format, Word-exact metadata). Element order in rPr/pPr matters (Word rejects out-of-order).
- `web/src/lib/rules/` — Karina Rules Engine. Every rule is backed by measured precision on her data; Harper limited to kinds that match her.
- `web/prompts/karina-rules.json` — Karina's editable rules (Review rules page, `lib/rules/config.ts` = types + factory defaults). Never hard-code rule wording or lists in the engine; add them to the config. After engine changes, compare `npm run proofread -- <docs> --rules <file>` output before/after.
- `web/src/lib/learn/` — learning loop: a finished document (Mark as done, or an uploaded Word review) becomes a record in `web/.data/learning/` (student text, gitignored): her net edits on the original + kept/changed/undone per bot suggestion, placed like `training/eval.py`. `proposals.ts` turns records into rule/switch-off/AI-example proposals with thresholds (`LEARN`); nothing changes until she approves on Review rules → From your reviews. Switch-offs need the rule to be unhelpful in her newest documents too (her habits drift). Never learn from hold-out documents.
- `web/src/lib/score/` — document score (0–100, no AI). Calibrate with `scripts/score-docs.ts` on the training folder.
- `web/prompts/karina-style-guide.md` — her rulebook (anonymised), used by the AI layer in M2.

## Output rules
- Tracked changes and comments are authored `Karina Octavia`; no bot/AI trace in the docx or its metadata.
- Karina's notes to students are tracked inline insertions in parentheses, not Word comments.
