# Karina Proofread Bot — Progress Log

A running record of what was built, what was found, and what was decided. Newest entries are at the bottom
of each milestone. Plan and milestones: [PROJECT_PLAN.md](PROJECT_PLAN.md).

---

## M0 — Isolated environment and project skeleton ✅
**2026-10-16**

**Goal:** a project setup that doesn't install anything on Windows.

What was done:
- **Portable Node.js v24.21.0 (LTS)** downloaded into `.tools/node/`. Its checksum was verified against nodejs.org.
  npm's cache, settings and "global" installs all live inside `.tools/`.
- **Python virtual environment** in `.venv/` with `python-docx`, `lxml` and `pdfplumber`.
- **`dev.ps1`**: run `. .\dev.ps1` in a PowerShell window to use these tools. It only affects that window.
- **Web app skeleton:** Next.js 16.3.8 + Tailwind + shadcn/ui in `web/`.
- **Git** repository with a `.gitignore` that keeps student documents, tools and secrets out.

Checked:
- `node.exe` is not on the Windows system or user PATH.
- The app builds and runs (HTTP 200, title "Karina Proofread").
- No student files are tracked in git.

---

## M1 — Style learning, Word engine, Karina Rules Engine ✅
**2026-10-16**

**Goal:** learn Karina's style from her 40 reviewed documents and build a bot that proofreads without AI,
then measure honestly how close it gets.

### 1. Studying Karina's style
- Extracted every tracked change from the training documents: **604 edits**, plus ~1,900 formatting changes.
  All are authored "Karina Octavia", and there are **0 Word comments**: her notes are typed into the text in parentheses.
- **6 of the newest documents were set aside as a test set.** The bot never learns from them, so they give an honest score.
- Read all 34 training documents' changes and wrote **Karina's style rulebook**
  ([web/prompts/karina-style-guide.md](../web/prompts/karina-style-guide.md)): header block, formatting standard,
  typical fixes, her note voice, and her end-of-document "Note:" block.
- Key findings:
  - **Formatting.** In her newest reviews she fixes formatting directly: Times New Roman, 12 pt, justified, 1.5 spacing. Earlier she only wrote a note.
  - **End "Note:" block.** Almost every review ends with one: format reminder, page/word limits, paragraph balance, and guiding questions (Why Taiwan? 1st/2nd-year plan? Why this university?).
  - **Header block.** Title, applicant's name, program applied for, university.
  - **Indonesian names.** She asks for the official Indonesian names of universities and writes out Indonesian acronyms ("UIN (Universitas Islam Negeri)").
  - **British spelling is kept.** She does *not* change "programme" or "behaviour", so that rule was dropped.
  - **Commas before "and"/"but"** are removed only rarely (6 of 72), so there is no rule for them.

### 2. The Word engine
- Writes real Word tracked changes: insertions, deletions, formatting changes, new paragraphs and whole-paragraph deletions.
- Matches how Word records Karina's edits:
  - author "Karina Octavia", her Microsoft account entry and her UTC+8 clock;
  - Track Changes switched on;
  - "last modified by" set to Karina Octavia;
  - the same file layout as a Word-saved file.
- Can accept or reject all changes. **Reject-all always gives back the exact original**, which is the base for the "restore original" feature in M3.
- **12 unit tests** cover run splitting, edits across runs, Chinese text, tables, header and end blocks, and formatting.

### 3. Karina Rules Engine (no AI)
- Rules are kept only when they matched Karina's behaviour in her files. Examples:
  - degree names in lower case: 19 of 20 in training;
  - no space before a colon: 10 of 12;
  - official Indonesian university names: 6 of 8.
- **Harper**, an offline grammar checker, is kept only for the checks that match her: redundancy 3/3, grammar 1/2.
  Dictionary spelling fixes are off, because they changed "prebiotic" to "probiotic" in an academic essay.
- **9 unit tests** for the rules.

### 4. Accuracy on the 6 test documents (rules only, no AI)
| | Result |
|---|---|
| Karina's edits the bot also made | **35%** |
| Bot edits Karina also made | **79%** |
| Header block | 82% |
| End "Note:" block | 90% (every bot note matched one of hers) |
| Formatting agreement | 21 of 24 |
| Word-level fixes and inline notes | ~8% (needs the AI layer) |

All outputs open cleanly in desktop Word, with every revision by Karina Octavia.

### Decisions from Karina's M1 review
- **Degree names:** keep lower-casing on, except at the start of a sentence after a full stop. After a colon it's lower case.
- **Notes may use casual Indonesian words** ("ya", "nak", "samakan"), following her style.
- **New feature for M3, "restore original":** undo any bot deletion, or return the whole document to the
  original at any time, with version history.

---

## M2 — Claude layer, accuracy test, cost estimate 🔄
**2026-10-16**

### Before starting M2 (from the M1 review)
- Degree rule refined: lower case after a colon too; capitals stay only at a sentence start after a full stop. Covered by a new test.
- The rulebook now tells the AI to use casual Indonesian words in short notes ("ya", "nak", "samakan"), the way Karina does.
- Created `docs/PROJECT_PLAN.md` and this progress log.
- Added the **restore original** feature to the M3 plan: undo any bot deletion, restore the whole document, version history.

### Built so far
- **Claude layer** (`web/src/lib/ai/`):
  - Claude gets the document as numbered paragraphs, plus a list of what the rules engine already did, so the two never clash.
  - It answers in a fixed JSON format: word fixes, inline notes, paragraph cuts, "Suggestion:" paragraphs and extra end-note points.
    Each edit carries a private reason for the review panel (never written into the file) and a "beyond usual style" flag.
  - Answers become Karina's tracked changes at **word level**, the way she marks them: "Initially … crew" → "At first … a crew member"
    gives two small changes, not one sentence replacement.
  - Settings: model Claude Opus 5.5, effort "high". Karina's rulebook and examples are cached between runs to cut cost.
    If a safety filter declines, the request is retried automatically on a suitable model.
- **Anonymised examples** of Karina's edits: `web/prompts/karina-examples.md`.
- **Cost:** a pre-run estimate (free token-count call) and the actual cost after each run, at Opus 5.5 prices
  ($4 per million input tokens, $0.20 cached, $20 output).
- **CLI:** `npm run proofread -- <file> --ai`, and `--estimate` for the cost only.
- **Tests:** 27 unit tests, including a full run with a simulated Claude answer. AI edits come out as Karina's tracked changes,
  nothing in the file mentions AI/bot/Claude, and **reject-all still restores the exact original**.

### Issue found: API key
- The first key was pasted into `web/.env.example`, a file that is committed to git. It was moved to `web/.env.local`
  (never committed) before any commit, and the template was blanked.
- The key is user-level and not attached to a workspace, so the API asked for a workspace ID. Fix options:
  create a key inside a workspace (recommended, and that's where the spend limit is set), or add `ANTHROPIC_WORKSPACE_ID`.
  Waiting for this before running the accuracy test.
