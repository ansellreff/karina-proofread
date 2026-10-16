# Karina Proofread Bot — Project Plan

_Last updated: 2026-10-16 (M4 on hold at Karina's request; local improvements first)_

## What we are building

A private web app, usable from PC and phone, that proofreads students' enrollment documents for Taiwan
universities (study plans, autobiographies, CVs, personal statements, SOPs, essays, recommendation
letters, video scripts) **in Karina's own style**. The result looks exactly like Karina reviewed it herself:
Word tracked changes and notes, all authored "Karina Octavia", with no trace of a bot or AI.

The flow when it's finished:

1. A student emails a document with a keyword in the subject. It lands automatically in OneDrive → `Karina Proofread/Inbox`.
2. Karina opens the web app (PC or phone), picks the file, and runs the bot.
3. The bot proofreads in her style. Karina reviews everything in a Word-like editor: accept, reject, edit,
   highlight, comment, or restore the original.
4. She exports DOCX (with tracked changes, or clean) or PDF, saved to OneDrive → `Done`.

## How the proofreading works

| Layer | What it does | Cost |
|---|---|---|
| **Karina Rules Engine** (no AI, always on) | Formatting (Times New Roman 12, justified, 1.5 spacing), header block, end "Note:" block, small fixes Karina makes consistently, offline grammar checks that match her habits | Free |
| **Claude layer** (AI, on/off switch) | Content-level edits in her voice: grammar in context, rewrites, cuts, inline notes, guiding questions | ~US$0.07–0.18 per document, measured (estimate shown before each run) |

Every rule is checked against Karina's real edits on 6 test documents that the bot never learns from.

## Key decisions

| Area | Decision |
|---|---|
| Identity in files | Tracked changes and comments authored **Karina Octavia**; Word-identical metadata; no bot trace. "Beyond usual style" flags appear only inside the app |
| Engine | Hybrid: rules engine plus optional Claude layer |
| AI model | Claude Opus 5.5 via the Anthropic API (a Claude subscription can't power a web app) |
| Notes voice | Short, direct notes in parentheses. Casual Indonesian words allowed ("ya", "nak", "samakan"), as Karina writes them |
| Degree names | Lower case ("bachelor's degree in chemistry") unless at the start of a sentence after a full stop |
| Spelling | British spellings are kept ("programme", "behaviour"), because Karina doesn't change them |
| Review editor | SuperDoc (works directly on the Word file), with "Open in Word for the web" as a fallback |
| PDF | Microsoft Graph conversion, with browser print as a fallback |
| Storage / sign-in | Personal OneDrive through Microsoft Graph; Microsoft sign-in limited to Karina |
| Email intake | Google Apps Script; check interval and keyword editable in the app's Settings |
| Hosting | Vercel Hobby (free, personal use) |
| Rules | Karina's rules live in `web/prompts/karina-rules.json`, edited on the Review rules page; engine, AI and score all read it |
| Score | 0–100 without AI: grammar 35, clarity 15, formatting 20, structure 30. Karina's notes don't count; open bot fixes do |
| Isolation | Portable Node in `.tools/`, Python in `.venv/`. Nothing is installed on Windows |
| Privacy | Student documents are never committed or deployed; examples are anonymised |

## Milestones

Each milestone ends with a review by Karina before the next one starts.

| # | Milestone | Status |
|---|---|---|
| M0 | Isolated environment and project skeleton | ✅ Done (2026-10-16) |
| M1 | Style learning, Word tracked-changes engine, Karina Rules Engine | ✅ Done (2026-10-16) |
| M2 | Claude layer, accuracy test (rules vs. rules + AI), token/cost estimate | ✅ Done (2026-10-16): 56% recall / 58% precision, US$0.09 per doc |
| M3 | Web app (local): inbox, proofreading, Word-like review editor, **restore original**, export | ✅ Done (2026-10-16): 20/20 browser checks |
| M3+ | Local improvements: jump to change, undo, **Review rules page**, **compare with original**, **score out of 100** | ✅ Done (2026-10-16): 34/34 browser checks, waiting for Karina's review |
| M4 | OneDrive, Microsoft sign-in, PDF export, deploy to Vercel, phone install, cost tracker | ⏳ |
| M5 | Gmail auto-intake, learning loop, PDF/CV input | ⏳ |

### M2 — Claude layer
- Claude proofreads in Karina's voice, following [web/prompts/karina-style-guide.md](../web/prompts/karina-style-guide.md) and anonymised examples.
- It receives the rules engine's edits so the two never conflict. AI edits are converted into the same Word tracked changes.
- **Before running:** estimated tokens and cost in USD. **After running:** actual tokens and cost.
- The accuracy test compares rules-only with rules + Claude on the 6 test documents (overlap with Karina's edits, false edits, cost).
- Needs: an Anthropic API key with a spend limit.

### M3 — Web app (local)
- Inbox with drag-and-drop upload and status chips.
- AI switch with the token/cost estimate; live progress while proofreading.
- **Review editor:**
  - "What the bot changed" panel: accept or reject one change or all of them, a filter, and keyboard shortcuts.
  - Comments panel; suggesting/editing/viewing modes; highlighter; word count.
  - Re-check a selected paragraph.
- **Restore original (Karina's request, 2026-10-16):**
  - The untouched original is always kept next to every proofread version.
  - **Restore deleted text:** a filter that shows only the bot's deletions, each with a one-click "restore" (reject).
  - **Restore original document:** one click goes back to the student's file exactly as received, even after edits and saves.
  - **Version history:** Original → Bot proofread → your edits. Open, compare or restore any version at any time.
- Export: DOCX with tracked changes, clean DOCX, PDF (browser print until M4).
- Style rulebook page (view and edit the rules) and a Settings page.

### M4 — Online
- Microsoft sign-in, OneDrive browse/pick/save, autosave to `In Review/`, export to `Done/`.
- PDF through Microsoft Graph. Deploy on Vercel. Install as an app on the phone. Cost tracker page.

### M5 — Automation and learning
- Gmail → OneDrive intake with an adjustable interval (every 1/5/10/15/30 minutes or every 1–12 hours) and keyword.
- Learning loop: Karina's final DONE_ files teach the bot new examples, and she approves what it learned.
- PDF/CV input.

## What Karina provides, and when

| Item | Milestone |
|---|---|
| Anthropic API key (with spend limit) | M2 |
| Microsoft Entra app registration, GitHub private repo, Vercel account | M4 |
| Paste the Apps Script into Google Apps Script and authorise it once | M5 |
