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

## M2 — Claude layer, accuracy test, cost estimate ✅
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
  Karina fixed the key; the free token count then confirmed it works.

### Accuracy test (6 test documents, compared with Karina's real edits)
**First attempt (prompt v1):** found 70% of Karina's edits, but only 38% of the bot's edits matched hers. Claude was editing
**2.7× as much as Karina**: it polished sentences she would leave alone and added many more inline notes.

**What Karina actually does:** the median across her reviews is only **4 word fixes and 4 inline notes per document**
(about 1 fix per 200 words). She edits heavily only when the English is genuinely weak. Most of her feedback goes into the end note.

**Prompt v2:** Claude first rates the English (good / average / weak), then keeps to Karina's edit budget for that level,
fixes only clear errors, and saves broader feedback for the end note. v2 was tuned on 6 *training* documents, so the
test documents were used only for the final score. (Caveat: the v1 test result is what showed the volume problem.)

| | Rules only | Claude v1 | **Claude v2 (final)** |
|---|---|---|---|
| Karina's edits the bot also made | 35% | 70% | **56%** |
| Bot edits Karina also made | 79% | 38% | **58%** |
| Balance (F1) | 48% | 49% | **57%** (best) |
| Same wording as Karina | 6% | 16% | 15% |
| Whole-paragraph cuts found | 40% | 100% | 80% |
| End "Note:" block | 90% | 100% | 100% |
| Cost per document | free | US$0.16 | **US$0.09** |

Notes on the numbers:
- Word-level agreement stays modest (15% identical wording), because there are many valid ways to fix the same sentence.
  The M3 review editor keeps Karina in control of every change.
- The cost estimate shown before a run (e.g. US$0.08–0.25) correctly brackets the real cost (US$0.07–0.18).
- Prompt caching works: after the first document, Karina's rulebook is read from cache at a tenth of the price.
- Total API spend for all M2 testing: about **US$2.40**.

### New sample documents (from "Enrollment Document_Not Checked")
- The 3 Word files (an essay, an SOP and a study plan) were proofread with rules + Claude v2 for Karina's review.
  Cost US$0.08–0.10 each.
- The 2 PDFs are kept for M5 (PDF input).
- Found and fixed: a file named `StatementofPurpose_…` (words joined, no spaces) wasn't recognised as an SOP. Detection now handles joined words.
- All outputs open cleanly in desktop Word. Every change is by Karina Octavia, and nothing in the files mentions AI/bot/Claude.

**Review files:** `training/output/review/M2_AI_*.docx`

---

## M3 — Web app (local): inbox, review editor, restore original, export ✅
**2026-10-16**

**Goal:** a web app where Karina uploads a document, runs the bot, reviews every change in a Word-like editor,
can undo anything (including returning to the original), and exports DOCX or PDF. It works on PC and phone.

### What was built
- **Documents inbox** (`/`):
  - drag and drop or "Choose files" (.docx);
  - a list showing student name, document type, status (New / Proofreading / Ready to review / Done) and last update.
- **Proofread dialog:**
  - AI on/off switch;
  - a **cost estimate before running** (tokens and US$), plus the balance left if Karina entered one;
  - live progress (reading → your rules → AI → writing tracked changes).
- **Review editor** (`/jobs/[id]`), built on SuperDoc v2, a Word editor that runs in the browser:
  - Suggesting / Editing / Viewing modes. In Suggesting mode, Karina's own edits are also tracked as Karina Octavia.
  - Word toolbar: fonts, highlight, comments, lists, undo/redo.
  - **"What changed" panel:**
    - every bot change as a mini redline (red strikethrough, green insertion) with its private reason;
    - filters: All, Fixes, Notes, Removed text, Beyond your style;
    - accept or reject one change; Accept all / Reject all;
    - the bot's formatting changes grouped as one item.
  - **Comments** tab: real Word comments by Karina Octavia.
  - **Re-check selection:** select a passage and the AI looks at just that part again. Its fixes appear as new tracked changes
    in the editor (one paragraph cost US$0.017).
- **Restore original (Karina's request):**
  - **"Restore removed text":** puts back everything the bot deleted, in one click or change by change.
  - **"Restore the original document":** the student's file comes back byte-for-byte as received.
  - **Versions** tab: Original → Bot proofread → your edits → … Open or restore any version. Nothing is ever overwritten.
  - **Autosave** every 90 seconds into one rolling "Your edits (autosaved)" version, plus a warning before leaving with unsaved edits.
- **Export:**
  - Word with tracked changes;
  - clean Word (all changes accepted, comments removed);
  - PDF clean or PDF with markup (through the print dialog; OneDrive conversion comes in M4);
  - files named `DONE_<Name>_<DocType>_<YYYYMMDD>`.
- **Style rulebook page:** view and edit what the AI follows (a backup is kept on every save).
- **Settings:** AI default on/off, model (Opus / Sonnet), thoroughness, author name, API balance, and this month's AI cost.
- **Phone:**
  - text reflows to the screen (web layout) instead of a shrunken page;
  - the review panel opens as a bottom sheet;
  - no sideways scrolling.

### Found and fixed during testing
- **SuperDoc telemetry was on by default.** It sends a "document opened" event (document ID, creation date, browser info,
  no content) to SuperDoc's server. It is now off, and the browser security policy only allows connections to the
  app itself, so even a library cannot send data out. Tested: no request leaves the app.
- **A wrong display setting made the editor show and save the "original" view.** Saving would have silently dropped
  all of the bot's tracked changes. Fixed (the value is now type-checked) and covered by a test that saves and
  re-opens the file.
- SuperDoc's document API is asynchronous in v2. The panel was adapted.
- The toolbar overlapped the review panel, and change bubbles crowded the page. Both now fit their own column.
- Saved files are cleaned the same way as bot output: Word as the application, "last modified by" = Karina Octavia,
  Track Changes on, and no editor traces.

### Verified
- **20/20 end-to-end checks in a real browser** (Microsoft Edge driven by a test script, `web/scripts/e2e.mjs`):
  upload, proofread, tracked changes shown and authored by Karina Octavia, accept/reject from the panel, save,
  saved-file metadata, clean export, file naming, PDF view, restore original (byte-identical), phone layout,
  and no external requests.
- The editor-saved file opens cleanly in desktop Word: all revisions by Karina Octavia, Track Changes on.
- 28 unit tests, lint, type check and the production build all pass.

### Notes / limitations for review
- The file name uses the student's first name from the document. Karina sometimes uses the name the student goes by
  (e.g. a middle name). Editing the name in the app is a small follow-up.
- PDF goes through the browser's "Save as PDF" until M4 adds OneDrive's Word-quality conversion.
- Everything is local for now (files are kept in `web/.data`, gitignored). OneDrive, sign-in and Vercel come in M4.

## M3 review feedback (2026-10-16)

Karina's requests after trying the review screen:

1. **"Each change in the What changed panel should take me to its place in the document."**
   - Clicking a card now scrolls the document to that change and highlights it. Previous/next arrows step through the
     list (following the current filter), with a "3/12" position counter.
   - It works both ways: clicking a change inside the document highlights its card in the panel.
   - Changes that were already accepted or rejected are found by their remaining text.
   - Phone: tapping a card closes the panel so the change is visible, and ↑/↓ arrows next to the "changes" button
     step through changes without opening the panel.
   - Cause of the old behaviour: the editor call the panel used ("scroll to element") silently did nothing for tracked
     changes. It now uses SuperDoc's dedicated tracked-change navigation.
2. **"After I reject a change I cannot undo it; it should be undoable in case of a misclick."**
   - Every accept/reject from the panel shows a message with an **Undo** button.
   - The greyed-out card itself shows **Undo reject** / **Undo accept** where the Accept/Reject buttons were, and says
     whether it was accepted or rejected. If later decisions were made after it, the card says so ("also undoes 1
     later decision"), because undo goes back in order.
   - An **Undo** button at the top of the panel steps back one decision at a time, including "Accept all",
     "Reject all" and "Restore removed text".
   - Safety: if Karina has typed in the document since that decision, the app does not undo (that would remove her
     typing first) and points to Ctrl+Z instead.

### Found and fixed along the way
- **Phone: the review panel could not scroll.** It grew taller than the screen, so changes lower in the list could not
  be reached. Fixed (the panel is now 75% of the screen height and scrolls).
- **Phone: tracked changes had no colours.** In the phone (reflowed) layout, inserted and deleted text looked like
  normal text because the editor only styles its page layout. Added the same blue (inserted) and red struck-through
  (deleted) markup, plus an outline on the active change.

### Verified
- End-to-end browser check extended to **26/26**: the new checks cover undo from the message, undo on the rejected
  card, undo of "Accept all", jump to a change, the next arrow, and clicking a change in the document.
- Phone layout checked separately: tap a card → panel closes, the document scrolls to the change, which is outlined.
- 28 unit tests, lint and type check pass.
