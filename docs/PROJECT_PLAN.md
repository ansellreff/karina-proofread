# Karina Proofread Bot — Project Plan

_Last updated: 2026-10-17 (M4: Vercel + Neon, no sign-in at Karina's request; code on GitHub; waiting for the Vercel/Neon setup)_

## What we are building

A private web app, usable from PC and phone, that proofreads students' enrollment documents for Taiwan
universities (study plans, autobiographies, CVs, personal statements, SOPs, essays, recommendation
letters, video scripts) **in Karina's own style**. The result looks exactly like Karina reviewed it herself:
Word tracked changes and notes, all authored "Karina Octavia", with no trace of a bot or AI.

The flow when it's finished:

1. Karina opens the web app (any PC or her phone) and uploads the student's Word or PDF file.
2. The bot proofreads in her style. Karina reviews everything in a Word-like editor: accept, reject, edit,
   highlight, comment, or restore the original.
3. She downloads the result: DOCX (with tracked changes, or clean) or PDF, and sends it to the student herself.

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
| PDF | Browser print view (clean or with markup) |
| Storage / sign-in | **Online:** Neon Postgres connected through Vercel (region Singapore), holding the documents, versions, rules, learning and usage, **no sign-in** (Karina's choice: the address is the only protection; the password sign-in is kept in history, commit c272e1c). **No OneDrive or Microsoft sign-in:** Microsoft refused her free Azure account, and Azure was required for that. She uploads and downloads files by hand. **Locally,** the app still runs on this PC without sign-in |
| Deploy | Private GitHub repository → Vercel. Before the first push, the whole git history is scanned for student names and keys. Afterwards, every push (only with her OK) redeploys |
| Hosting | Vercel Hobby (free: personal, unpaid use, as Karina confirmed). Functions run in Singapore |
| Rules | Karina's rules live in `web/prompts/karina-rules.json`, edited on the Review rules page; engine, AI and score all read it |
| Score | 0–100 without AI: grammar 35, clarity 15, formatting 20, structure 30. Karina's notes don't count; open bot fixes do |
| Learning | No AI, no cost. Proposals need repeated evidence (a fix 3+ times in 2+ documents and right 80%+ of the time; a rule undone 70%+ of the time, also in her newest documents). Nothing changes until she approves. The 6 test documents are never learned from |
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
| M3+ | Local improvements: jump to change, undo, **Review rules page**, **compare with original**, **score out of 100**, resizable/collapsible panel, drag-and-drop side-by-side, **PDF input** | ✅ Done (2026-10-16): 43/43 browser checks, waiting for Karina's review |
| M3++ | UI/UX round: **dark mode** (white or dark paper), documents search/filter/rename/delete+restore, review shortcuts, save status, view menu, tips, app icon | ✅ Done (2026-10-16): 52/52 browser checks, waiting for Karina's review |
| M3+++ | **Learning loop** (local): every finished document teaches the bot; proposals (new rules, rules to switch off, AI examples) wait for Karina's approval on Review rules → From your reviews | ✅ Done (2026-10-16): 57/57 browser checks, waiting for Karina's review |
| M4 | **Online on Vercel:** Neon database, AI costs page, phone install, `push.bat` with safety check and Vercel reminder (re-planned 2026-10-17 without OneDrive) | 🔄 Built and tested locally (online mode against Postgres: 15/15; local: 58/58). Next: Karina's GitHub and Vercel steps ([ONLINE_SETUP.md](ONLINE_SETUP.md)), then push, deploy and copy her data |
| M5 | Email intake (open: OneDrive is out; to be re-thought if still wanted) | ⏳ |

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
- The app on Vercel, opened from any PC or phone. No sign-in (Karina's decision); the password sign-in stays in git history (`c272e1c`).
- Documents, versions, rules, learning and usage in a Neon database (Singapore).
- Upload and download by hand. PDF through the print view.
- Install on the phone (Add to Home screen). AI costs page.
- Her local data copied online once.
- _Dropped:_ Microsoft sign-in and OneDrive. A personal account needs an Azure directory, and Microsoft refused her free Azure account.

### M5 — Automation
- Email intake: the earlier plan went through OneDrive, so it is open now. If she still wants it, it will be re-planned around the online app.
- ~~Learning loop~~ and ~~PDF/CV input~~: done locally ahead of time (M3+++ and M3+).

## What Karina provides, and when

| Item | Milestone |
|---|---|
| Anthropic API key (with spend limit) | M2 |
| GitHub private repository, Vercel account (Hobby) with a Neon database | M4 |
