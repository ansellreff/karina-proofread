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

## Local improvements before M4 (2026-10-16)

Karina asked to hold M4 and improve the local app first.

### 1. Review rules page (replaces "Style rulebook")
**Request:** a page to adjust her reviewing style and add her own rules and conditions. What she saves must change what the bot does, and the page must start with the rules we already had, not empty.

- All rules the bot used to have written in the code now live in one file, `web/prompts/karina-rules.json`.
  - The proofreading engine, the AI, the score and the command-line proofreader all read that file.
  - Saving on the page writes the file (the previous one is kept as a backup), and the next proofread follows it.
- The page has these tabs:
  - **Your rules:** "when … then …" rules. They can:
    - replace a phrase;
    - add a note after a phrase;
    - add a line to the end Note when the document mentions or doesn't mention something, or is longer or shorter than a number of words;
    - give the AI an instruction.

    Each rule can be limited to certain document types and switched on or off. It starts with the 5 conditional rules learned from her reviews: CV guidelines, the 1st/2nd year plan, "Why Taiwan?", the future plan, and "your university".
  - **Built-in checks:** each of her regular fixes and notes, with an on/off switch and editable wording. This covers degree names, colons, double spaces, hyphens, Indonesian names and acronyms, "Conclusion" headings, CV year and language notes, the header block, and the end Note checks (length limits per document type, essay word limits, paragraph balance, lists and tables, too many sections).
  - **Formatting:** her standard (font, size, alignment, spacing, margins, page number) and which document types are fixed automatically. The reminder students see is generated from these values, so it always matches what the bot enforces.
  - **Grammar checker:** for each kind of grammar check, choose Off, Your style, or Beyond your style (made but flagged in the app).
  - **Names & acronyms:** the lists of Indonesian university names, acronyms and Taiwan universities.
  - **Try it:** paste text and see what the rules would do, before saving. Free.
  - **AI rulebook:** the plain-text style guide the AI reads (the old page).
- **Proof that nothing changed:** before and after moving the rules into the file, the bot gave identical results on all 43 local documents.
- **New "beyond your style" suggestions:** a wrong preposition ("passionate in" → "passionate about") and a sentence not starting with a capital letter. On the 43 documents they add only 5 suggestions, all correct.

### 2. Compare with the original
**Request:** an "Original" button next to Suggesting/Editing/Viewing, a side-by-side view, and a scroll lock. Both views can be switched on and off.

- **Original** shows the student's file exactly as uploaded: read-only, no suggestions.
- **Side by side** (PC and tablet) puts the original on the left and the review on the right.
- **Scroll locked / Lock scroll** makes both sides scroll together, or each on its own. The review is longer because of the notes, so the two sides are matched by position: halfway down one is halfway down the other.
- The review editor is never reloaded while comparing, so unsaved edits are safe.
- **Fixed along the way:** in a half-width column the editor cut off the right edge of the page. The page now fits its column.

### 3. Score out of 100
**Request:** score the original document, with the score improving as she accepts suggestions and edits. Also suggest grammar and formatting fixes that fit each document type.

- **What the score measures** (no AI, no cost):
  - **Grammar & spelling, 35 points:** the offline checker, plus every bot fix not yet decided.
  - **Clarity, 15 points:** very long sentences and wordy phrases.
  - **Formatting, 20 points:** her standard for narrative documents; consistent font and size for CVs, letters and scripts.
  - **Structure & completeness, 30 points:**
    - narrative documents: header lines, length limit, paragraph balance, lists and tables, numbered sections, and her own "doesn't mention…" rules (such as "Why Taiwan?");
    - CVs: contact details, sections, years, language level, length.
- **Where it shows:**
  - a new **Score** tab with the score now, the original, and "all suggestions accepted";
  - a bar for each part, and every problem listed (click one to see it in the document);
  - the score in the top bar and in the document list.
- **How it updates:**
  - It changes a moment after every accept, reject, undo or edit.
  - Her notes to the student don't count: they are instructions, so the score rises when the student acts on them.
  - A rejected suggestion stops counting as a problem: she judged the text fine.
- **Calibration** on her 40 reviewed documents: the students' originals average **71**, her reviewed versions **87**.

### A mistake on my side, and what changed because of it
While cleaning up after a crashed test, I deleted every document in the local app except my three samples. That included a document Karina had uploaded and proofread herself (about US$0.10 of AI). It had no saved edits, and it can't be recovered. Her own file was not affected. To prevent this:
- Deleting a document now moves it to `web/.data/trash/` instead of erasing it.
- The test script removes only its own document, even when it crashes.
- The clean-up helper only removes the documents it is given by name; it no longer has a "delete everything" mode.

### Verified
- **34/34 end-to-end checks in a real browser.** New ones:
  - Original view, side by side fits, scroll lock, and the editor not reloading;
  - score shown, score rising after Accept all and returning after Undo;
  - a rule saved on the Review rules page reaching the engine. That test restores the rules file afterwards.
- 41 unit tests, lint, type check and the production build all pass.

## More review-screen improvements and PDF input (2026-10-16)

### Review panel
- **Collapse:** the panel button (top right of the panel) hides it to a slim rail. The rail still shows the number of open changes and the score; click either to open the panel again.
- **Resize:** hold and drag the panel’s left edge to make it wider or narrower (300–720 px). Double-click the edge to reset.
- Both settings are remembered in this browser.

### Side-by-side view
- **Resize the two sides:** drag the bar between them (20–80%). Double-click resets to half and half.
- **Choose which side shows what:**
  - **Drag and drop:** drag a side by the handle in its title bar and drop it on the left or right half. While dragging, two drop zones cover the documents, so nothing can be dropped into the text by mistake.
  - **Swap button:** the ⇄ button in each title bar swaps the sides.
- **Change the view from either side:** each side’s title bar has its own picker (Original, Suggesting, Editing, Viewing).
  - On the review side, it switches the editing mode.
  - Choosing a review mode on the original’s side brings the review to that side (and the original moves across). Choosing Original on the review’s side does the same in reverse.
- The side, width and panel settings are remembered. The review editor is never reloaded by any of this, so unsaved edits are safe.

### PDF input
**Request:** students sometimes send a PDF, so review it and export it as Word and PDF.
- **Upload:** PDFs can now be uploaded like Word files. The app turns the PDF into a Word document, keeping:
  - the text and paragraphs;
  - fonts and sizes;
  - bold and italic;
  - alignment (justified, centred);
  - line spacing;
  - page size and margins.

  Page numbers and repeated headers or footers are left out. Pictures and table borders can’t be rebuilt; their text is kept.
- **Review:** from there, everything works as for a Word file: proofreading, review, score, versions, and export to Word (tracked or clean) and PDF.
- **The PDF as sent:** it is kept exactly as received. Open it with **Student’s PDF** in the top bar, or from the Export menu.
- **Scans:** a scanned PDF or a photo (no text) is refused with a clear message: ask the student for the Word file.
- **Tested on the local PDFs:**
  - The two narrative PDFs (a study plan and an autobiography) convert exactly paragraph for paragraph. The headings, header lines, justified text, Calibri 12 pt and 1.15 spacing all match, and the study plan has 3 pages in Word, as in the PDF.
  - CVs convert well: headings, company names, dates and bullets stay separate.
  - Slide-style PDFs and forms keep all their text but come out rougher (they are layouts, not documents).
  - Word opens the converted files without problems.
- **Small extra:** the student’s name is now also taken from a header line such as “Name: …”.

### Verified
- **43/43 end-to-end checks in a real browser.** New ones:
  - swap sides and pick views from either side;
  - resize the sides;
  - hide, show and resize the panel;
  - PDF upload and conversion, the PDF kept exactly as sent;
  - proofreading the converted PDF and opening it with tracked changes;
  - exporting it as Word and as PDF.
- **Fixed a timing problem in the test itself:** it sometimes read the score before the previous update had arrived.
- The proofreading results are still identical on all 43 local documents. 42 unit tests and lint pass.
- The two sample PDFs from “Enrollment Document_Not Checked” are in the app, not yet proofread, so you can try the AI estimate yourself.

### Fix: dragging a side didn’t work (Karina’s feedback)
- **Cause:** the first version used the browser’s built-in drag and drop. Edge cancels such a drag when the page changes at the moment the drag starts, which happened when the drop zones appeared. The automated test had faked the drag events instead of moving a real mouse, so it missed this.
- **Rebuilt with pointer events:**
  - Hold the title bar of either side (anywhere except its buttons) and move. A small live picture of that page lifts up and follows the cursor, slightly tilted.
  - The side it came from fades.
  - The half it will land on gets a dashed outline and a label (“Original on the right”).
  - On release, the picture glides into place and the sides swap.
  - Escape, or dropping on the same half, leaves everything as it was.
  - It works with a mouse, pen or touch screen.
- **Test:** the end-to-end test now drags with real mouse input and checks that the picture appears, the target half is shown, and the sides swap. **44/44 checks pass.**

## UI/UX round: dark mode and review-flow polish (2026-10-16)

**Request:** improve the UI and UX, add dark mode and any other improvements I recommend (planned and approved in plan mode).

### Dark mode
- **Switch:** the sun/moon button in the header offers Light, Dark, or Same as this computer. The same choice is under Settings → Appearance and is remembered.
- **Colours:** the dark palette is “indigo ink”. Every text colour meets the accessibility standard WCAG AA in both themes; the lowest contrast is 5.2:1 in light and 6.0:1 in dark, against a minimum of 4.5:1.
- **The Word-like editor** follows the theme: toolbar, menus, comment cards and the area around the pages.
- **Paper:** the page itself stays white paper by default, exactly as it prints. **Dark paper** is an option (header menu, View menu, or Settings): the page is inverted for night work, with the red/green tracked-change colours and pictures kept true.
- **Phone:** the reflowed document also sits on white (or dark) paper.
- **Printing:** the print/PDF view always switches to light, so nothing prints dark.

### Documents page
- **Tabs and search:** All, Waiting, Ready to review and Done, each with its count; a search by student, file or type; sorting by latest, A–Z or lowest score.
- **Row menu (⋯):**
  - **Open**;
  - **Rename student**: this name is used in the DONE_ file names, so you can use the name the student goes by;
  - **Mark as done / Reopen**;
  - **Download Word file**;
  - **Delete**: with an **Undo** in the message that appears.
- **Recently deleted** at the bottom: every deleted document can be restored. The app has no “erase forever”.
- **Fixes:** the column headings now line up with the rows; scores show as a coloured badge; PDF uploads show their PDF name.

### Review page
- **Rename:** click the student’s name at the top to correct it.
- **Save status:** “Unsaved changes”, “Saving…”, “Saved 2 min ago” or “Autosaved …”, next to the Save button.
- **View options (eye button):**
  - Original full screen;
  - Side by side;
  - Lock scroll;
  - Review panel;
  - paper colour;
  - Keyboard shortcuts.

  The scroll lock also sits as a round button on the bar between the two pages.
- **Keyboard shortcuts** (press **?** for the list). They work when the cursor is not in the document text, so typing is never taken over; Ctrl+S works everywhere.

  | Key | Action |
  |---|---|
  | J / K | Next / previous open change |
  | A / R | Accept / reject it, then go to the next |
  | U | Undo |
  | Ctrl+S | Save |
  | \ | Panel |
  | O | Original |
  | S | Side by side |
  | L | Lock scroll |
  | Esc | Back to the review |

- **Quick tips** card the first time (dismiss with “Got it”).
- **Tooltips:** buttons show what they do and their shortcut.

### App polish
- An app icon (an indigo “K” with a highlighter stroke) in the browser tab, and the same mark in the header.
- **Tab titles:** “<Student> – <Type> | Karina Proofread”, “Documents”, “Review rules”, “Settings”.
- The unused Next.js sample images were removed.

### Verified
- **52/52 end-to-end checks in a real browser.** New ones:
  - dark mode in the app and editor, with white or dark paper, and the print view staying light;
  - search, delete then Undo, and delete then Recently deleted then Restore;
  - J/A/U/? shortcuts, and typing a letter in the document staying text;
  - renaming from the review page;
  - the save status.
- 47 unit tests, lint, type check and the production build pass.
- **The test now gives its own document a unique name** before it touches the Documents page. In one run it had matched one of your sample documents with the same file name; nothing was lost (your 5 documents are unchanged), but it can no longer happen. Its leftover copies in Recently deleted were erased, so the list is empty.

## Learning loop: the bot learns from every document you finish (2026-10-16)

**Request:** Karina chose the learning loop as the next round (planned and approved in plan mode). M4 stays on hold.

### How it works
- **Two ways in:**
  - **Mark as done:** every document you mark as done is compared, without AI, in two ways:
    - the student’s original against what you send (the document with your edits, and with every suggestion you left open counted as sent);
    - what the bot had suggested against what you did with each suggestion.
  - **Learn from a review you did in Word:** upload a .docx with your tracked changes on the new tab. The app rebuilds the student’s original and runs the rules engine on it to see what the bot would have suggested.
- **For every bot suggestion it records one of three outcomes:**
  - **kept** as suggested;
  - **your own fix** in the same place;
  - **undone**.
- **It also records your own edits:** fixes, notes, header lines, end-note lines and cuts.
- **Edits are placed and compared exactly as in the accuracy test** (training/eval.py), so the numbers mean the same thing.

### New tab: Review rules → From your reviews
- **Numbers:** how many documents it learned from, and what share of the bot’s suggestions you kept, fixed yourself or undid, overall and for each rule.
- **Suggestions for your rules** (each with its evidence and up to 3 before/after examples):
  - **New rules:** a fix you made 3+ times in 2+ documents. It is only suggested if, wherever that text appears in the documents you finished, you changed it at least 80% of the time. Also, an end-note line you keep writing for one document type.
  - **Rules you often undo:** a rule whose suggestions you undid 70%+ of the time. It must be just as unhelpful in your newest documents (see the finding below).
  - **Approving:**
    - Add this rule puts it in Your rules, opened, for you to check before you press Save rules.
    - Switch it off changes the rule on the page; it also waits for Save rules.
    - Try it fills the Try it tab with an example sentence.
  - **Dismiss:** it is never suggested again, and Undo brings it back.
- **Examples for the AI:** your own notes and rewrites (with the student’s name removed). The ones you approve are sent with every AI proofread, up to 30. They cost almost nothing extra because that part of the prompt is cached.
- **Documents it learned from:** each can be forgotten; your document itself is untouched.
- **Badge:** the tab shows how many rule suggestions are waiting. Mark as done says what it learned (“Learned from this review: 2 suggestions for your rules”) with a link to the tab.
- **Privacy:** the learned data stays in the local app folder like your documents (never committed). The 6 test documents are refused, so the accuracy test stays honest.

### Tested on your 32 older reviews (the training folder, without the 6 test documents)
- **Numbers:** the bot’s suggestions were kept 36%, replaced by your own fix 36%, undone 29%. You made 252 edits of your own.
- **New rules: none qualified.** Your own word fixes rarely repeat: the same fix 3+ times in 2+ documents is rare. The precision check stopped the weak candidates; for example, “remove ‘the’” would have been right 4 times out of 755. This is the intended behaviour: suggestions appear as you finish more documents in the app.
- **Finding: your style changes over time.** The first version proposed switching off the header lines, because in 16 of 22 older reviews you didn’t add them. Approving that on the 6 test documents (your newest) lowered the bot’s accuracy from 39% to 31% recall, because there you do add them. So a rule is now only proposed for switch-off if it is also unhelpful in the newest half of your documents. The review date comes from the dates on your tracked changes. With that check, approving every proposal leaves the accuracy unchanged instead of lowering it.
- **The edits it reads match the ones the Python training scripts mined:** all 329 of your edits on these documents are found.
- **AI examples: 15 were suggested.** Their effect on accuracy can only be measured with AI runs (about US$0.50 for the 6 test documents), which was not done without your OK.
- **Side finding:** in some older documents, the header already had “Program:” and “University:” lines in its own format, and the bot still added “Applied for:” lines. Recognising those formats is a small rules-engine fix for later.

### Verified
- **57/57 end-to-end checks in a real browser.** New ones:
  - Mark as done learns what was kept, undone and added;
  - two uploaded reviews give a learned rule with its numbers;
  - approving it opens it in Your rules, and once saved the engine uses it;
  - a dismissed suggestion stays dismissed after a reload;
  - Forget removes only that document.

  The test removes everything it created (its documents, learned records and rule) by id; your 5 documents and rules were untouched.
- 61 unit tests (14 new), lint, type check and the production build pass.

### Follow-up (Karina’s go-ahead)
- **Your 32 older reviews are now loaded** in the app (Review rules → From your reviews). Each can be removed with Forget.
- **AI test with the 15 suggested examples.** Two fresh AI runs on the 6 test documents, same rules, without and then with the examples. Cost US$1.22 in total (US$0.59 + US$0.63).

  | | Your edits found (recall) | Bot edits you also made (precision) | Same wording |
  |---|---|---|---|
  | AI, no examples | 59% | 55% | 18 of 129 |
  | AI + 15 examples | 64% | 53% | 21 of 129 |

  - **Word fixes are where it moved:** the bot found 43% of your fixes, against 36% without examples. Your inline notes went from 1 to 2 of 5.
  - **Caution:** this is one run each on 6 documents. 5 points is about 6 of your 129 edits, and the AI doesn’t answer exactly the same way twice, so this is a small gain within the noise, not a proven one. It doesn’t make the bot worse.
  - **Cost:** the examples add about 1,060 tokens, cached, so less than one US cent per document.
  - **Not approved for you:** each example is your own edit, and you decide which ones the AI should copy. Approve the ones that really are your style.
- For tests only: `KP_LEARN_DIR` points the AI prompt at another learning folder (never set in the app).

## M4 Phase A: ready to go online, built and tested without accounts (2026-10-16)

**Decisions (Karina):**
- personal Microsoft account (OneDrive Personal);
- code on a private GitHub repository linked to Vercel;
- copy her local documents to OneDrive only after she has set up the project folder.

### What changed for the app
- **One way to keep files, two places:**
  - **Locally** (no sign-in, as now), everything stays in `web/.data` on this computer.
  - **Online**, everything goes to her **OneDrive project folder**: documents with every version, Recently deleted, settings, AI usage, rules, AI rulebook and learning data. No other service keeps any of it.
  - The local copy works exactly as before.
- **Sign in with Microsoft** (only her account is let in).
  - The sign-in is kept in an encrypted cookie and renews itself.
  - There is a Sign out button.
  - The first visit asks for the **project folder**; the app creates **Inbox**, **Done** and **App data** inside it.
- **OneDrive in the app:**
  - The **Documents page** lists files waiting in **Inbox** with an **Import** button. Imported files move to **Inbox/Imported**. M5's email intake will drop files there.
  - **Mark as done** also saves the `DONE_…docx` (tracked) to **Done**.
  - **The Export menu:**
    - **Save to OneDrive (Done folder):** Word with tracked changes, clean Word, PDF;
    - **PDF, clean:** made by OneDrive itself (the same rendering as Word for the web); the print view stays the fallback and is used for "PDF with markup".
  - **Settings → OneDrive:**
    - the signed-in account;
    - **Change the project folder**;
    - **Copy this computer's data to OneDrive** (one click, when she's ready; nothing in OneDrive is overwritten and the local copy stays as a backup);
    - **Sign out**.
- **AI costs page** (new, in the header):
  - this month, the average cost of one AI run, and the balance left with how many runs it still covers;
  - a bar per month for the last 12 months, plus the table;
  - cost per document.
- **Phone install:** an app icon and the information phones need for **Add to Home screen**. The app opens full screen.

### Safety
- **Student data never leaves through the build.** The build was set up to bundle the rules, rulebook and PDF tools. A check found it would also have bundled the local `web/.data` folder (student documents) when built on this computer, because the app reads that folder at runtime. That is now explicitly excluded, and verified: no student file in any server bundle.
- **The 6 test documents** are now recognised by a fingerprint of their content instead of their file names, so the guard also works online and the code contains no names.
- **Pages and the API both require the sign-in** online; local mode stays unchanged for development and the tests.
- **A proofread cut off by the server** (online functions have a time limit) no longer leaves a document stuck on "proofreading"; after 6 minutes it shows as not proofread, so it can be run again.

### Verified
- **81 unit tests** (22 new):
  - the document store, run the same way on memory and on a simulated OneDrive (create, versions, delete and restore, the list, monthly usage);
  - large uploads in chunks and OneDrive throttling;
  - Done, PDF and folder setup;
  - sign-in: allowed versus other accounts, cookie encryption and splitting, token renewal;
  - the page guard (proxy);
  - the cost totals.
- **57/57 end-to-end checks** in local mode. The test now waits for delete/undo instead of a fixed second; renaming a folder on Windows takes about 0.8 seconds.
- Lint, type check and the production build pass. Proofreading output is unchanged.
- Karina's 5 documents, the 32 learned reviews and her rules were untouched throughout.

### Next: her steps
**Next: her steps** ([ONLINE_SETUP.md](ONLINE_SETUP.md)):
1. A free Azure account, which is needed for a personal account to register an app.
2. The app registration (about 10 minutes).
3. Her OneDrive project folder.
4. Later: GitHub and Vercel.

Then Phase B (OneDrive locally with her account) and Phase C (deploy, test on her phone).

## Decision: how the online app reaches OneDrive (2026-10-16)
- **Karina's question:** is there a way without Azure?
- **Alternatives looked at:**
  - The app on this PC using the synced OneDrive folder (`C:\Users\…\OneDrive`), with no hosting at all.
  - Vercel with a password login, plus a small helper on her PCs that copies files between the OneDrive folder and the app.
- **Why they fall short:** a website on Vercel can only open OneDrive itself with Microsoft's permission. That means an app registration, which for a personal account lives in a free Azure directory. Without it, OneDrive is only reachable through a PC that is switched on.
- **Decision:** Karina needs the app online **24/7 from any device**, so she will do the one-time registration ([ONLINE_SETUP.md](ONLINE_SETUP.md), Part 1). The plan is unchanged.

## Zoom in each document pane (2026-10-16)

**Request:** pages are sometimes too small to read (especially side by side). She asked for a zoom slider like Word's in each panel. Then, while it was being built: it must not cover the document, so it should be a small icon that opens on hover.

- **Where it is:** a small, faint magnifier icon in the bottom-right corner of each pane, outside the page. Hovering it (or tapping or tabbing to it) opens Word's zoom bar:
  - **−** and **+**: move by 10%;
  - a **slider**, from 20% to 200%;
  - the **percentage** (click it to go back to 100%);
  - **fit page width**.
  - The bar folds away again when the mouse leaves.
- **Ctrl + mouse wheel** over a page zooms too, as in Word.
- **Each side keeps its own zoom** (review and original), remembered in this browser. A zoom she chose stays when the panes are resized; "fit page width" follows the column again.
- **Phones:** the text already reflows to the screen there, so the control isn't shown.
- **Checks:** a new end-to-end check covers the folded icon, +, slider, Ctrl+wheel, folding again and fit width (**58/58**).
  - The test now hides the development server's own corner bubble, which had been sitting over the pane's corner.
  - The fitted page in a narrow side-by-side column was only 33%: that is what the zoom is for.

## M4 re-planned: online on Vercel with a password, no OneDrive (2026-10-17)

**Why:** Microsoft said Karina isn't eligible for a free Azure account, and Azure is required for a personal account to let a website reach OneDrive. **Her decision:** put the bot and AI online on Vercel, reachable from any PC or phone; she uploads and downloads files by hand; no OneDrive sync. Vercel's free Hobby plan fits, since this is personal, unpaid use (she confirmed).

### What changed
- **Storage online:** a private **Neon** database, connected through Vercel, in Singapore (closest to Indonesia and Taiwan; the app's server runs there too).
  - It holds everything the app keeps: documents with every version, Recently deleted, settings, rules, AI rulebook, learning data, AI usage.
  - It is stored the same way as on this computer, so copying her data over is file for file.
  - A save is visible straight away. A storage option that could briefly serve an older copy of a file was ruled out for that reason.
- **Sign-in:** one password, no account.
  - Only a scrambled form of the password (scrypt) is kept in Vercel's settings; the password itself is never stored.
  - A device stays signed in for 30 days through an encrypted cookie. **Settings → Sign out** ends it.
  - After 5 wrong tries from one connection, sign-in waits 15 minutes for that connection.
  - Every page and every API call checks the sign-in. Online, the app refuses to run if a setting is missing, rather than opening unprotected.
- **Removed:** Microsoft sign-in and everything OneDrive (Inbox, Save to OneDrive, OneDrive PDF, the folder setup). It stays in the project history (`6bda307`) in case it is ever wanted again. PDF export is the print view again.
- **Kept from the earlier work:** the AI costs page, phone install, and the bundling safety: no student files in the build, as checked again.
- **Her data:** `scripts/copy-to-online.ts` copies everything from this computer once, skips what is already there, and checks that every file arrived.
- **Setup guide** ([ONLINE_SETUP.md](ONLINE_SETUP.md)): now GitHub, Vercel, Neon and the password, about 15 minutes and free.

### Verified
- **Unit tests: 79** (the document store now also runs on a real Postgres engine, plus the password, lockout, cookie and page guard).
- **Online mode, run on this computer** against Postgres, as the production build: **15/15 checks**.
  - sign-in required for pages and the API;
  - wrong password refused;
  - lockout after 5 tries;
  - sign-in and the cookie's protections;
  - upload, proofread, save, export (`DONE_…` name);
  - every page;
  - sign out.
- **The data copy** tried against a test database: 57 of 57 files (0.9 MB) copied and checked; running it again copies nothing.
- **Local mode** unchanged: **58/58** end-to-end checks.
- Lint, type check and build pass. Her 5 documents, rules and 32 learned reviews were untouched.

### Next
- Karina creates the GitHub repository (name `karina-proofread`) and sends its address.
- I scan the whole history for student names and keys, then push.
- She sets up Vercel and Neon and makes her password (guide, part 2), then I copy her data online.

## Code on GitHub; password removed; push.bat (2026-10-17)

### GitHub
- **Where:** the project is on Karina's private repository https://github.com/ansellreff/karina-proofread.
- **Before the first push**, all 18 commits were checked:
  - no student names: the names in the document folders' file names and the 17 names the app had detected inside the documents;
  - no keys, passwords or database addresses;
  - no student documents or app data.

### The online app showed only "Internal Server Error"
- **Diagnosis:** the address answered, but every page returned error 500, while the static app icon loaded.
- **Most likely cause:** the app refusing to start because a Vercel setting it needed was missing or not yet applied. The usual reasons are no Redeploy after adding a setting, or a setting not added for Production.
- **Why it wasn't visible:** the error message was hidden.
- **Fix:** the app now shows a page naming what's missing, instead of a bare 500. A new address, `/api/version`, reports which version is running and whether the database is connected.

### Password: built, then removed at Karina's request
- **What was built** (saved in history as commit **`c272e1c`**, to bring back any time):
  - sign-in with one password;
  - **Settings → Change password**, which signs other devices out;
  - a **forgotten password** reset by putting a new hash in Vercel and redeploying;
  - a 15-minute lock after 5 wrong tries.
- **Karina decided she doesn't need it,** so it was removed. The online app is now open to anyone with its address. The risks were explained:
  - students' documents can be seen;
  - AI runs can use her Anthropic credit;
  - rules and documents can be changed.
- **What protects it now:** keeping the address private and the Anthropic spend limit.
- **A finding while testing:** she had pasted `APP_PASSWORD_HASH` and `AUTH_SECRET` into `web\.env.local` as well. They aren't used any more, and both can be deleted there and in Vercel.

### `push.bat`: send updates, with a safety check and a Vercel reminder
- Double-click `push.bat` in the project folder.
- It shows the changes and asks for a short description.
- It runs a **safety check** first, `web/scripts/prepush-check.mjs`. It stops the push if anything not yet on GitHub contains:
  - a student's name (taken from the document folders and the app's own data on this computer);
  - a student document or the app's data folder;
  - an API key or database address.
  - Tested: it stopped on a real student name and on a fake key.
- Then it commits (as Karina Octavia) and pushes.
- **Vercel reminder** (`web/scripts/vercel-check.mjs`): after the push it waits up to 5 minutes for the online app to run the new version (through `/api/version`). If it doesn't, it prints a clear reminder: Vercel → Deployments → Redeploy, or what to look for if the deploy failed.

### Verified
- 74 unit tests, lint, type check and build pass.
- Online mode against Postgres on this computer: **8/8**. The database is connected; upload, proofread, save, export, every page and the rules all work.
- Local app: **58/58**. Her 5 documents, rules and 32 learned reviews were untouched.

## Security check, and an AI password (2026-10-17)

### Is the Claude API key safe?
- **Never in git:** it is only in `web\.env.local` (ignored by git, never committed) and in Vercel's settings. All commits were checked: the key appears in none.
- **Never sent to the browser:** the app's browser code only ever learns *whether* a key is set (yes/no). The built app was searched for the key: it is in 0 files that go to browsers.
- **Never shown:** it isn't written in logs or error messages; the server only uses it to call Claude.
- **The real risk was use, not leak:** with the app public, anyone with the address could have run AI proofreads on her key. That is what the new AI password stops.
- **Advice:** in Vercel, mark `ANTHROPIC_API_KEY` as **Sensitive**, and keep a monthly spend limit on the Anthropic workspace.

### Other findings, fixed
- **The PDF reader** (pdf.js) had a known flaw: a malicious PDF could run code. The app reads uploaded PDFs and is public, so this mattered.
  - Upgraded to the fixed version (6.3.289), also inside the Word editor (SuperDoc), which carried its own older copy.
  - The PDF converter needed a one-line change for the new version. Both sample PDFs still convert (1 page → 9 paragraphs, 3 pages → 25).
- **A design tool used only while building the app** (shadcn) brought 7 more flagged packages. It moved to the build-only tools, so none of them ship with the app.
- **Result:** the dependency audit of what the app runs on is at **0 known vulnerabilities**.
- **Accessibility:** on the phone, the Proofread button showed only an icon and had no name for screen readers. It has one now.

### Still true (Karina's choices)
- The app has no sign-in: anyone with the address can see and change documents. The password sign-in is kept at `c272e1c`.
- The AI password is a short number. It stops casual use, together with the wait after 5 wrong tries; the spend limit is the safety net.

### AI password
**Request:** using the AI needs a simple password that she can change in one file; to begin with, `991009`. It should be easy to use.

- **Where it's set:** `web/src/lib/ai/ai-password.ts`, one clearly marked line. To change it: edit, save, run `push.bat`. Every device unlocked with the old password must enter the new one.
- **The password stays on the server:** it is in 0 files sent to browsers (checked after building). A device that unlocks gets a signed cookie, not the password.
- **Proofread dialog:** with "Use AI" on and the AI locked, a card says *"The AI is locked: enter the AI password to use it; rules-only proofreading works without it."*
  - It has one password field with show/hide, **Remember on this device for 30 days** (on by default; otherwise until the browser closes), and **Unlock**.
  - While locked, the button reads **Unlock the AI first**. After unlocking, the cost estimate appears and the button becomes **Proofread with AI**.
- **Wrong password:** the field clears and says *"That password isn't right. 4 tries left."* After 5 wrong tries in 15 minutes from one connection: *"Try again in 15 minutes."*
- **Re-check selection:** if locked, a small unlock dialog opens, and the re-check continues by itself after unlocking.
- **Settings → AI password:** *"AI unlocked on this device until …"* with **Lock AI on this device**, or the unlock card. It also says where to change the password.
- **On the server:** the cost estimate, AI proofread and re-check all refuse until the device is unlocked, so the lock can't be skipped by calling the app directly.
- **When there's no key online,** the message now says where to add it (Vercel → Environment Variables → `ANTHROPIC_API_KEY` → Redeploy) instead of pointing to `web/.env.local`.

### Verified
- 77 unit tests (3 new for the lock), lint, type check and build pass.
- In the browser, on desktop and phone:
  - the lock card appears and the AI can't run until unlocked;
  - a wrong password says how many tries are left;
  - the right one unlocks and shows the cost estimate;
  - Settings shows the unlock and can lock again.
- The AI routes refuse without unlocking (403).
- Full end-to-end test: **59/59** (new check: AI re-check and estimate refuse until unlocked; a wrong password is refused).

## Side by side: the lock now links the zoom too
**Request:** when the two sides are locked to scroll together, they should also keep the same zoom, so the pages can be compared at the same size.

- **One lock for both:** the existing lock (the button on the divider, **View → Lock scroll and zoom (side by side)**, or the `L` key) now locks scrolling *and* zoom. Its labels say so.
- **Turning the lock on** gives the original the review's current zoom.
- **While locked,** any zoom change on either side (the − / + buttons, the slider, *Back to 100%*, Ctrl + mouse wheel, *Fit page width*) is copied to the other side at once.
- **Unlocked,** each side keeps its own zoom, as before.

### Verified
- 77 unit tests, lint and type check pass.
- Full end-to-end test (Word sample, no PDF): **54/54**. New check: locking makes both sides the same zoom; a zoom of 120% on the review goes to the original, and a + on the original brings the review to 130%. The existing check still confirms that unlocked sides zoom on their own.

## Red suggestions on screen, and the export file name in Settings
**Request:** suggestions in the web app should look like they do in Word (red text), and the export file name should be adjustable in Settings.

### Suggestions in red
- **What she saw:** in the web app, a suggestion was black text in a blue (added) or red (removed) box. In Word, the same suggestion is red underlined (added) or red struck through (removed).
- **Why they differed:** the red in Word isn't saved in the file. Word colours tracked changes by who made them, and on her PC it uses red for "Karina Octavia". The exported file has no red text: once the student accepts the changes, the text is black. Word on the student's computer may use a different colour.
- **Now:** in the web app, added and removed text is **red** (a dark red, close to Word's). It keeps its own **bold and italic**. The boxes, backgrounds, the highlight on the selected change and the cards are unchanged, as she asked.
- **Only the screen changes;** the exported Word file is exactly as before. This also applies on the phone and in "PDF with markup". "Viewing" (no markup) stays black, like Word's "No Markup".

### Export file name (Settings → Export file name)
- **Blocks:** the name is a row of blocks:
  - **your text** (for example DONE, REVISED);
  - **first name**;
  - **full name**;
  - **document type**;
  - **date**;
  - **original file name**.
- **Editing:** add a block, remove it with ×, move it by dragging (or Move left / Move right), and choose what goes **between blocks**: _ , - , a space, or nothing.
- **Options per block:**
  - date format (20261017, 2026-10-17, 17-10-2026, 17102026);
  - names and the original file name can be shortened to the first N letters.
- **Preview:** a live preview with a made-up student (Anna) underlines the selected block.
- **Reset:** **Back to DONE_Name_Type_Date** restores her convention.
- **Saving:** a bar now sticks to the bottom of Settings with **Save settings** whenever something isn't saved yet.
- **Safety:** characters Windows can't use in file names are left out. A name always keeps at least one block, with at most 10.
- **Where it's used:** Word, clean Word and PDF downloads, on this PC and online.
- **Clean copy:** it no longer gets `_clean` at the end (her choice). The clean Word file and the Word file with changes now have the same name, so if both go into one folder the browser adds "(1)" to the second.
- The default is unchanged: `DONE_<first name>_<type>_<YYYYMMDD>`.

### Verified
- 80 unit tests (3 new for file names: the default as before, any blocks/order/separator/date/length, unsafe input), lint and type check pass.
- Full end-to-end test (Word sample): **56/56**. New checks:
  - added and removed text is red, with the box and background unchanged;
  - in Settings: remove a block, change the date format, add text (an unsafe "?" is left out), choose the dash, drag a block to the front, then save; the download is then named that way.
  - Her own setting is put back after the test.
- Screenshots of the new section checked on desktop (light) and phone (dark).

## Review bar for tracked changes, file-name fix, resizable document
**Request:**
- tracked changes were hard to navigate and edit;
- a file named `Study Plan_<name>_<submission date>` exported with the date in place of the name;
- the default name should be `DONE_<type>_<name>_<date>`;
- the document panel couldn't be resized.

### Tracked changes
- **Review bar** above the document (desktop and tablet), like Word's Review tab:
  - **‹ Change 3 of 12 ›** steps through every open change in document order: the bot's, hers, and any already in the file. J/K do the same.
  - The bar shows a short line for the highlighted change, for example "Fix: my self → myself".
  - **Accept / Reject** decide the highlighted change, then move to the next one. The panel's Undo and the A/R keys still work, and Accept all / Reject all are in the small menu next to them.
  - **Track my edits** switches between Suggesting (on) and Editing (off).
- **Formatting marks hidden by default:**
  - The bot's font/size/spacing changes had put a gold underline on almost every line. The bar's **Formatting marks** button (with the count) shows them again, and the choice is remembered.
  - While hidden, the bar skips them. They stay in the file and in the panel's Formatting card.
- **Her own edits in "What changed":**
  - Every tracked change she makes in Suggesting mode is now a card, **Your edit** (or "Edit by …" for someone else's), with the old and new text, **Accept / Reject**, and click-to-jump. The **Your edits** filter shows only those.
  - The panel says "2 of 4 bot changes still open, plus 1 of your edits", and Accept all / Reject all include them.
- **Found and fixed:** stepping back to a replaced word (old text struck, new text added) sometimes left the highlight on the previous change.

### Export file name
- **The cause:** for a file name that starts with the document type, the app took the *last* part as the name, which was the submission date (`Study Plan_Ruddy_20261005` → "20261005").
- **Now:** dates and numbers (`20261005`, `2026-10-05`, `05.10.2026`) and words like DONE, FINAL, REVISED or V2 are skipped, so the example gives **Ruddy**. A name written in the document itself ("My name is…", "Name: …") still comes first.
- **Documents already in the app** whose saved name is only a date get the name again from the file name.
- **New default `DONE_<type>_<name>_<date>`,** for example `DONE_Study Plan_Ruddy_20261021.docx`. Her saved setting was still the old default, so it switched automatically (on this PC, and online the first time it's read). A name format she customises is kept. The Settings reset button reads "Back to DONE_Type_Name_Date".

### Resizable document
- **Visible handle:** the edge between the document and the review panel now always shows a grip, with a wider area to grab. It drags the document wider or narrower; the panel can go from 260 px up to 70% of the screen. Double-click resets.
- **The page follows:**
  - The page now grows with the document, up to 200%, instead of stopping at 100% and leaving grey space.
  - **Found and fixed:** the editor measured the page instead of the column, so the page could only shrink and sat flush left. It now fills the column and is centred.
  - A zoom she picks with the zoom icon is kept. **Fit page width** goes back to following the handle.
- **Found and fixed:**
  - side by side, the drag stopped after a few pixels (the editor next to it took the mouse over); it now follows the mouse until released;
  - each automatic re-fit was saved as if she had chosen a zoom, which froze the page size.

### Verified
- 83 unit tests (new: her file-name example, dates/numbers skipped, old names corrected, the settings switch), lint and type check pass.
- Full end-to-end test (Word sample): **62/62**. New checks:
  - formatting marks hidden by default and shown by the bar;
  - Next/Previous with "x of y";
  - Accept from the bar, and Undo;
  - her own edit shown as a card and rejected from it;
  - Track my edits;
  - the visible grip makes the page wider when dragged;
  - the new default export name.
- Screenshots checked in light and dark, desktop, side by side and phone.
- Only test documents made by the tests were removed; her 6 documents are unchanged.

## Word-style balloons
**Request:** a way to see the tracked-change balloons, with a switch to show or hide them, like Word.

- **Before:** a change's balloon only opened when you clicked the change (it still does that when balloons are off).
- **Review bar → Balloons** (on by default, remembered): every change and comment gets a balloon in a column beside the page, as in Word's "All Markup". The balloons show who made the change, what changed ("Replaced 'my self' with 'myself'", "Added …"), ✓ / ✗ to accept or reject, and a reply box. The page makes room for the column.
- **Narrow space:** when the document is too narrow for balloons beside the page (side by side, or a very wide review panel), they turn back into a balloon that opens on click, and come back when there is room again.
- **Formatting balloons follow the Formatting marks button:** while the marks are hidden, the dozens of "Formatted: …" balloons are left out, so the wording changes sit next to their text.
- **Switching** reopens the document view, because the editor only reads this setting when it opens. Unsaved edits are saved first (as the autosave draft), so nothing is lost; the undo history of earlier decisions starts fresh.
- **Found and fixed:** a balloon could hang over the review bar and block its buttons. The document area now clips its content.

### Verified
- 83 unit tests, lint and type check pass.
- Full end-to-end test: **63/63**, twice in a row. New check: balloons are shown beside the page (never over it), with no formatting balloons while their marks are hidden; the switch hides them and brings them back; no extra version is made when nothing was unsaved.
- **Test fixes only:**
  - typing checks now type at the start of the document and read the result from the editor;
  - they wait for the shortcuts dialog to close, and for the editor to take the focus after an undo.
- **The app now holds the jump target briefly:** after a jump (review bar, panel, J/K), the editor's own "active change" report is ignored for about a second, so the highlight no longer jumps back.

## New logo, and resizable balloons
**Request:** use the logo in the `weblogo` folder; make the edge between the page and the balloons adjustable too.

### Logo
- **Where it shows:**
  - the header (instead of the "K" box), on a light round ground so its navy outlines show in dark mode too;
  - the browser tab;
  - the phone home-screen icons (Android and iPhone).
- **What changed in the image:**
  - **Small copies:** made from the 2000 px PNG (4–69 KB each instead of 2.4 MB) by `web/scripts/make-icons.mjs`.
  - **Figure only:** the PNG has the words "KARINA PROOFREAD BOT" in black under the figure. They can't be read at icon size and vanish on dark backgrounds, so the icons show the figure only. The header writes "Karina Proofread" next to it anyway.
- **The old "K" icon** is removed (still in git history).

### Resizable balloons
- **The handle:** with balloons shown, the edge between the page and the balloons column has the same grip as the panel edge. Drag it to make the balloons wider (the page gets smaller) or narrower (the page gets bigger), between 240 and 640 px, always leaving the page at least 320 px. Double-click goes back to 320 px. The width is remembered.
- **The cards fill the column**, so long changes need fewer lines when it is wide.
- **Found and fixed:** the page didn't refit when only the balloons changed width (or other things beside the page). The editor ignored a refit made within one moment; it now takes two frames.

### Verified
- 83 unit tests, lint and type check pass.
- Full end-to-end test: **65/65**. New checks:
  - dragging the balloons edge widens the column, the page makes room, and double-click resets it;
  - the logo loads in the header on its light ground in dark mode, and serves as the browser-tab icon.
- Screenshots checked in light and dark.
