/**
 * The Update log (the "Update log" tab): every release of Karina Proofread Bot, newest first, in plain language.
 *
 * Numbering: a MAJOR version (x.0) is a new way of working or a whole new area of the app; a MINOR version (x.y)
 * improves or fixes within it. Every update adds a release here and sets web/package.json "version" to match.
 * `commits` are the short git hashes of the release; the newest release's commit is filled in by the next update
 * (until then, "running now" treats an unknown deployed commit as the newest release). No student names.
 */

export type PointKind = "new" | "improved" | "fixed";

export interface ReleasePoint {
  kind: PointKind;
  text: string;
  /** Where to find it in the app. */
  href?: string;
  where?: string;
}

export interface Release {
  /** "5.4" */
  version: string;
  /** ISO date */
  date: string;
  kind: "major" | "minor";
  title: string;
  summary: string;
  points: ReleasePoint[];
  commits: string[];
  /** A note on how it came about (e.g. something tried and replaced). */
  note?: string;
}

export const APP_NAME = "Karina Proofread Bot";

export const RELEASES: Release[] = [
  {
    version: "5.4",
    date: "2026-10-21",
    kind: "minor",
    title: "Update log",
    summary: "A new tab that lists every version of the bot, so you can see what changed and when.",
    points: [
      { kind: "new", text: "The Update log tab: every version from the very first one, newest first, marked Major or Minor." },
      { kind: "new", text: "The version you are using is shown next to the logo; a dot on the tab tells you when there is a version you haven’t read about yet." },
      { kind: "new", text: "Each version shows whether it is the one running online, so you can see at a glance if the website has the latest update." },
      { kind: "new", text: "Each version shows a short code. To go back to a version, ask Claude: “go back to V.x.y”." },
    ],
    commits: [],
  },
  {
    version: "5.3",
    date: "2026-10-21",
    kind: "minor",
    title: "Recently deleted for 7 days, backup and restore",
    summary: "Deleted documents are kept 7 days, and you can save everything to your computer and put it back later.",
    points: [
      { kind: "new", text: "Recently deleted keeps a document for 7 days, then deletes it forever. Each one shows how many days are left.", href: "/", where: "Documents → Recently deleted" },
      { kind: "new", text: "Delete forever (one document) and Empty Recently deleted (all), each with a confirmation." },
      { kind: "new", text: "Download backup: one file with every document, your rules, rulebook, what the bot learned and your settings.", href: "/settings", where: "Settings → Backup and storage" },
      { kind: "new", text: "Restore by dropping the backup file on the page. It only adds what is missing; it never overwrites newer work." },
      { kind: "new", text: "See how much is stored, and free up space by deleting all documents (after typing DELETE). Rules, learning and settings stay." },
    ],
    commits: ["878d746"],
  },
  {
    version: "5.2",
    date: "2026-10-21",
    kind: "minor",
    title: "Your logo, adjustable balloons",
    summary: "The app shows your logo, and the balloons beside the page can be made wider or narrower.",
    points: [
      { kind: "new", text: "Your logo in the header, on the browser tab and as the phone home-screen icon." },
      { kind: "new", text: "Drag the edge between the page and the balloons to make the balloons wider or narrower. Double-click resets." },
      { kind: "fixed", text: "The page now always refits when the space beside it changes." },
    ],
    commits: ["567811e"],
  },
  {
    version: "5.1",
    date: "2026-10-21",
    kind: "minor",
    title: "Word-style balloons",
    summary: "Every change and comment can be shown in a balloon beside the page, like Word’s All Markup.",
    points: [
      { kind: "new", text: "Balloons button in the review bar: each change and comment in a balloon beside the page, with accept, reject and reply. On by default; turn it off to have a balloon open when you click a change." },
      { kind: "improved", text: "When the page is narrow (side by side), balloons open on click instead, and come back when there is room." },
      { kind: "improved", text: "Formatting balloons follow the Formatting marks button, so wording changes stay next to their text." },
      { kind: "fixed", text: "A balloon no longer covers the review bar; after jumping to a change, the highlight stays on it." },
    ],
    commits: ["a5966c4"],
  },
  {
    version: "5.0",
    date: "2026-10-21",
    kind: "major",
    title: "Word-style reviewing",
    summary: "A review bar like Word’s Review tab, your own edits listed with the bot’s, and a cleaner page.",
    points: [
      { kind: "new", text: "Review bar above the page: Change 3 of 12, Previous and Next through every open change in page order, Accept and Reject, Accept all and Reject all." },
      { kind: "new", text: "Track my edits switch (Suggesting on, Editing off)." },
      { kind: "new", text: "Your own suggestions appear in What changed as “Your edit” cards with Accept and Reject, with their own filter." },
      { kind: "improved", text: "Formatting marks (the gold underlines) are hidden by default, so wording changes stand out; one button shows them again." },
      { kind: "improved", text: "The edge between the document and the review panel has a visible grip, and the page grows and shrinks with it." },
      { kind: "fixed", text: "Export names: the student’s name no longer gets mixed up with the submission date; the default name is now DONE_type_name_date.", href: "/settings", where: "Settings → Export file name" },
    ],
    commits: ["3cb0c81"],
  },
  {
    version: "4.3",
    date: "2026-10-17",
    kind: "minor",
    title: "Red suggestions, export file name",
    summary: "Suggestions look like Word’s, and you choose how exported files are named.",
    points: [
      { kind: "improved", text: "Added and removed text is red on screen, like Word; the exported Word file is unchanged." },
      { kind: "new", text: "Export file name builder: add, remove and drag the parts of the name, choose the separator and date format.", href: "/settings", where: "Settings → Export file name" },
      { kind: "improved", text: "The clean copy keeps the same name, without “_clean”." },
    ],
    commits: ["bcf949d"],
  },
  {
    version: "4.2",
    date: "2026-10-17",
    kind: "minor",
    title: "Zoom locked with scroll",
    summary: "Side by side, the lock now keeps both pages at the same zoom as well as the same place.",
    points: [{ kind: "improved", text: "With the scroll lock on, zooming either side zooms both, so the pages stay the same size to compare." }],
    commits: ["d13a3d9"],
  },
  {
    version: "4.1",
    date: "2026-10-17",
    kind: "minor",
    title: "Security check, AI password",
    summary: "The Claude API key is checked safe, and using the AI asks for a password.",
    points: [
      { kind: "new", text: "AI password: proofreading with AI (which uses your Anthropic credit) asks for a password first; rules-only proofreading works without it.", href: "/settings", where: "Settings → AI password" },
      { kind: "improved", text: "Security check: the API key never leaves the server; the PDF reader was updated to fix a known security problem." },
    ],
    commits: ["febc0aa"],
  },
  {
    version: "4.0",
    date: "2026-10-17",
    kind: "major",
    title: "Online on Vercel",
    summary: "The bot is a website you can use from any computer or phone.",
    points: [
      { kind: "new", text: "The app runs online (Vercel), with your documents and rules in an online database." },
      { kind: "new", text: "The code is saved on your GitHub; push.bat sends updates safely (it checks that no student files go along) and reminds you when Vercel needs a redeploy." },
      { kind: "new", text: "Add to Home screen on your phone opens it like an app. AI costs page with a monthly chart.", href: "/costs", where: "AI costs" },
    ],
    note: "A OneDrive version was built first and replaced, because Microsoft’s Azure sign-up wasn’t available. A sign-in password was added and then removed at your request (kept in the history).",
    commits: ["6bda307", "4a654a8", "7a6df60", "d4fe28b", "c272e1c", "1604230"],
  },
  {
    version: "3.1",
    date: "2026-10-16",
    kind: "minor",
    title: "Zoom",
    summary: "Each document pane has a Word-style zoom.",
    points: [{ kind: "new", text: "A small magnifier in the corner of each page opens a zoom bar (−, slider, +, fit page width); Ctrl + mouse wheel zooms too." }],
    commits: ["6bb0c50"],
  },
  {
    version: "3.0",
    date: "2026-10-16",
    kind: "major",
    title: "The bot learns from you",
    summary: "Every document you finish teaches the bot, and it suggests rule changes for you to approve.",
    points: [
      { kind: "new", text: "Mark as done records what you kept, changed and undid; uploading your own reviewed Word files does the same." },
      { kind: "new", text: "From your reviews: suggested new rules, rules to switch off and AI examples, each with its evidence; nothing changes until you approve.", href: "/rules?tab=learned", where: "Review rules → From your reviews" },
      { kind: "improved", text: "Your 32 older reviews were loaded, and the AI examples were measured on the test documents." },
    ],
    commits: ["d6a4487", "4f3a4ac"],
  },
  {
    version: "2.6",
    date: "2026-10-16",
    kind: "minor",
    title: "Dark mode and polish",
    summary: "Dark mode, a better documents page and keyboard shortcuts.",
    points: [
      { kind: "new", text: "Dark mode (with white or dark paper), switched from the header." },
      { kind: "improved", text: "Documents page: search, tabs, sorting, delete with Undo and Recently deleted." },
      { kind: "new", text: "Keyboard shortcuts while reviewing: J and K step, A accepts, R rejects, U undoes, ? lists them." },
    ],
    commits: ["02b150a"],
  },
  {
    version: "2.5",
    date: "2026-10-16",
    kind: "minor",
    title: "Layout and PDF",
    summary: "More control over the review screen, and students can send PDFs.",
    points: [
      { kind: "new", text: "Upload a PDF: it is turned into a Word document to review, and the PDF is kept as sent." },
      { kind: "improved", text: "Resize and hide the review panel; drag a page by its title bar to swap sides." },
    ],
    commits: ["c29b610", "04f59e0"],
  },
  {
    version: "2.4",
    date: "2026-10-16",
    kind: "minor",
    title: "Score out of 100",
    summary: "Each document gets a score that updates while you review.",
    points: [
      { kind: "new", text: "A score out of 100 for the student’s original and for your review, updated as you accept and reject; click an item to find it in the text." },
      { kind: "improved", text: "Deleting a document moves it to Recently deleted instead of removing it." },
    ],
    commits: ["07c8276"],
  },
  {
    version: "2.3",
    date: "2026-10-16",
    kind: "minor",
    title: "Compare with the original",
    summary: "See the student’s file next to your review.",
    points: [{ kind: "new", text: "Original view, and side by side with a scroll lock so both pages move together." }],
    commits: ["73696e2"],
  },
  {
    version: "2.2",
    date: "2026-10-16",
    kind: "minor",
    title: "Review rules page",
    summary: "Your rules in one place you can edit.",
    points: [{ kind: "new", text: "Review rules: switch rules on and off, edit word lists and notes, add your own rules and try them on a sample.", href: "/rules", where: "Review rules" }],
    commits: ["8b2b624"],
  },
  {
    version: "2.1",
    date: "2026-10-16",
    kind: "minor",
    title: "After your first review",
    summary: "Fixes and additions from your first look at the web app.",
    points: [
      { kind: "new", text: "Click a change in the panel to jump to it in the document." },
      { kind: "new", text: "Undo for accept and reject." },
      { kind: "fixed", text: "Phone layout fixes." },
    ],
    commits: ["b20edd3"],
  },
  {
    version: "2.0",
    date: "2026-10-16",
    kind: "major",
    title: "The web app",
    summary: "The bot gets its own app: upload, proofread, review like in Word, export.",
    points: [
      { kind: "new", text: "Documents page: drop a student’s file to add it." },
      { kind: "new", text: "Word-like review editor with Suggesting, Editing and Viewing, and a panel to accept or reject each change." },
      { kind: "new", text: "Versions of every document, and Restore original." },
      { kind: "new", text: "Export the Word file with tracked changes, a clean copy, or a PDF." },
    ],
    commits: ["71faa5c"],
  },
  {
    version: "1.2",
    date: "2026-10-16",
    kind: "minor",
    title: "AI tuned to your style",
    summary: "The AI suggests about as much as you would, not more.",
    points: [
      { kind: "improved", text: "The AI follows your edit budget and was tuned on a separate set of your documents." },
      { kind: "fixed", text: "Some document types were recognised wrongly." },
    ],
    commits: ["5a5dca6"],
  },
  {
    version: "1.1",
    date: "2026-10-16",
    kind: "minor",
    title: "AI layer",
    summary: "Claude adds the suggestions rules can’t make, with a cost estimate first.",
    points: [
      { kind: "new", text: "Proofreading with AI (Claude), following your style rulebook." },
      { kind: "new", text: "A cost estimate before every AI run." },
    ],
    commits: ["8c78e33"],
  },
  {
    version: "1.0",
    date: "2026-10-16",
    kind: "major",
    title: "The first bot",
    summary: "The bot learned your style and proofreads Word documents the way you do.",
    points: [
      { kind: "new", text: "Your style learned from your reviewed documents: what you change, how often, and how you write your notes." },
      { kind: "new", text: "A Word engine that writes tracked changes and notes as “Karina Octavia”, exactly like Word, with no trace of a bot." },
      { kind: "new", text: "The Karina Rules Engine: your fixes as rules, each one checked against your real edits." },
      { kind: "new", text: "Set up so nothing is installed on Windows, and student documents never leave your computer’s project folder." },
    ],
    commits: ["82049c4", "3b62a64"],
  },
];

export const CURRENT_VERSION = RELEASES[0].version;
export const versionName = (v: string) => `${APP_NAME} V.${v}`;

/** The release a deployed commit belongs to; a commit not listed yet is newer than all, so it is the newest release. */
export function releaseOfCommit(sha: string | null | undefined): Release | null {
  if (!sha) return null;
  return RELEASES.find((r) => r.commits.some((c) => sha.startsWith(c))) ?? RELEASES[0];
}
