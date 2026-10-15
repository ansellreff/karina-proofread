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

## Output rules
- Tracked changes and comments are authored `Karina Octavia`; no bot/AI trace in the docx or its metadata.
- Karina's notes to students are tracked inline insertions in parentheses, not Word comments.
