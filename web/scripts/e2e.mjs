/**
 * End-to-end check of the web app in a real browser (system Microsoft Edge via playwright-core; nothing is downloaded).
 *
 *   node scripts/e2e.mjs <sample.docx> [--out <screenshot dir>] [--base http://localhost:3000]
 *
 * Flow: upload -> proofread (rules only, free) -> open review editor -> accept one change -> save ->
 * inspect saved file (authors, metadata) -> restore original -> verify. Screenshots: desktop + phone.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import JSZip from "jszip";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const sample = args.find((a, i) => !a.startsWith("--") && !["--out", "--base", "--pdf"].includes(args[i - 1]));
const pdfSample = opt("--pdf", null); // optional: also check PDF upload, conversion, review and export
const base = opt("--base", "http://localhost:3000");
const out = path.resolve(opt("--out", "e2e-shots"));
if (!sample) throw new Error("usage: node scripts/e2e.mjs <sample.docx>");
await mkdir(out, { recursive: true });

const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// 1. upload + proofread through the API
const form = new FormData();
form.append("files", new Blob([await readFile(sample)]), path.basename(sample));
const up = await (await fetch(`${base}/api/jobs`, { method: "POST", body: form })).json();
const job = up.created?.[0];
check("upload .docx", !!job, up.errors?.join("; "));
/** Remove one of this test's own documents completely (to the trash, then erased), so "Recently deleted" stays clean. */
async function discard(id) {
  const res = await fetch(`${base}/api/jobs/${id}`, { method: "DELETE" }).catch(() => null);
  const trashed = res && (await res.json().catch(() => ({}))).trashed;
  if (trashed) await fetch(`${base}/api/trash/${encodeURIComponent(trashed)}`, { method: "DELETE" }).catch(() => {});
}
// if the run crashes, remove only this test's own document (never anything else in the app)
const cleanUp = async (e) => {
  console.error(e);
  if (job) await discard(job.id);
  if (job) await fetch(`${base}/api/learn/job-${job.id}`, { method: "DELETE" }).catch(() => {});
  process.exit(1);
};
process.on("uncaughtException", cleanUp);
process.on("unhandledRejection", cleanUp);
const pr = await fetch(`${base}/api/jobs/${job.id}/proofread`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai: false }) });
const lines = (await pr.text()).trim().split("\n").map((l) => JSON.parse(l));
const last = lines.at(-1);
check("proofread streams progress and finishes", !!last.done && lines.some((l) => l.stage === "writing"), last.error ?? `${last.job?.proofread?.changes.length} changes`);

const browser = await chromium.launch({ executablePath: edge, headless: true });
const consoleErrors = [];
const blocked = [];
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("requestfailed", (r) => blocked.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) blocked.push(`EXTERNAL ${r.url()}`);
  });
  return page;
}

// 2. inbox
const page = await newPage({ width: 1440, height: 900 });
await page.goto(`${base}/`);
await page.screenshot({ path: path.join(out, "01-inbox-desktop.png") });
check("inbox lists the document", await page.getByText(job.fileName).first().isVisible());

// 3. review workspace
await page.goto(`${base}/jobs/${job.id}`);
await page.waitForFunction(() => !!window.__superdoc, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const listTracked = () => page.evaluate(async () => (await window.__superdoc?.activeEditor?.doc?.trackChanges?.list?.({ limit: 5000 })) ?? null);
const tl = await listTracked();
const trackedCount = tl?.total ?? tl?.items?.length ?? -1;
check("editor shows Karina's tracked changes", trackedCount > 0, `${trackedCount} tracked changes`);
const authors = [...new Set((tl?.items ?? []).map((i) => i.author))];
check("tracked changes authored by Karina Octavia", authors.length === 1 && authors[0] === "Karina Octavia", JSON.stringify(authors));
const sample0 = JSON.stringify((tl?.items ?? []).slice(0, 3).map((i) => ({ id: i.id, type: i.type, sourceIds: i.sourceIds, ins: i.insertedText, del: i.deletedText })));
console.log("   sample tracked items:", sample0.slice(0, 600));
const openText = await page.getByText(/bot changes still open/).first().textContent().catch(() => null);
check("changes panel links bot changes to the editor", !!openText && !/^0 of/.test(openText), openText ?? "panel text missing");
await page.screenshot({ path: path.join(out, "02-review-desktop.png") });

// 4. accept one change from the panel
const before = openText;
const panel = page.locator("aside");
const openLine = () => panel.getByText(/bot changes still open/).first().textContent();
const waitChange = async (prev) => {
  for (let i = 0; i < 40; i++) {
    const now = await openLine();
    if (now !== prev) return now;
    await page.waitForTimeout(250);
  }
  return prev;
};
await page.waitForTimeout(1500); // let the editor settle
const accept = panel.getByRole("button", { name: "Accept", exact: true }).nth(1); // first is the formatting group
await accept.click({ force: true });
const after = await waitChange(before);
check("accept from the panel resolves a change", after !== before, `${before} -> ${after}`);
const reject = panel.getByRole("button", { name: "Reject", exact: true }).first(); // the formatting group (not "Reject all")
await reject.click({ force: true });
const after2 = await waitChange(after);
check("reject one item resolves only that item", after2 !== after && !/^0 of/.test(after2 ?? ""), `${after} -> ${after2}`);
await page.screenshot({ path: path.join(out, "02b-after-accept-reject.png") });

// 4b. undo a panel decision (misclick safety)
const trackedBeforeMisclick = (await listTracked())?.total;
await panel.getByRole("button", { name: "Reject", exact: true }).first().click({ force: true });
const afterMisclick = await waitChange(after2);
await page.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" }).first().click();
const afterToastUndo = await waitChange(afterMisclick);
check("undo from the toast brings a rejected change back", afterMisclick !== after2 && afterToastUndo === after2 && (await listTracked())?.total === trackedBeforeMisclick, `${after2} -> ${afterMisclick} -> ${afterToastUndo}`);
await panel.getByRole("button", { name: "Reject", exact: true }).first().click({ force: true });
const afterReject2 = await waitChange(afterToastUndo);
// the earlier rejected formatting card also offers "Undo reject" (and says it would undo this later one too)
const cardUndo = panel.locator("li").filter({ hasNotText: "also undoes" }).getByRole("button", { name: "Undo reject" });
const cardUndoShown = (await cardUndo.count()) === 1 && (await panel.getByText(/also undoes 1 later decision/).count()) === 1;
await cardUndo.first().click();
const afterCardUndo = await waitChange(afterReject2);
check("rejected card shows its own Undo button that brings it back", cardUndoShown && afterReject2 !== afterToastUndo && afterCardUndo === afterToastUndo, `${afterToastUndo} -> ${afterReject2} -> ${afterCardUndo}`);
// live score: read it, Accept all, read again, Undo, read again
const scoreNow = () => panel.locator("[data-testid=score-now]").first().textContent().then(Number).catch(() => NaN);
const scoreAfter = async (prev) => {
  for (let i = 0; i < 60; i++) {
    const s = await scoreNow();
    if (!Number.isNaN(s) && s !== prev) return s;
    await page.waitForTimeout(500);
  }
  return scoreNow();
};
await panel.getByRole("tab", { name: /^Score/ }).click();
await panel.locator("[data-testid=score-now]").waitFor({ timeout: 60000 }).catch(() => {});
// let the score settle after the earlier accept/reject: no update running and the same value for 3 s
let score0 = await scoreNow();
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const busy = await panel.getByLabel("Updating the score").count();
  const s = await scoreNow();
  if (!busy && s === score0) break;
  score0 = s;
}
check("score out of 100 is shown after proofreading", score0 > 0 && score0 <= 100, `${score0}`);
await panel.getByRole("tab", { name: /What changed/ }).click();
await panel.getByRole("button", { name: "Accept all" }).click();
const afterAll = await waitChange(afterToastUndo);
await panel.getByRole("tab", { name: /^Score/ }).click();
const score1 = await scoreAfter(score0);
check("accepting the suggestions raises the score", score1 > score0, `${score0} -> ${score1}`);
await page.screenshot({ path: path.join(out, "02f-score.png") });
await panel.getByRole("tab", { name: /What changed/ }).click();
await panel.getByRole("button", { name: "Undo", exact: true }).click();
const afterAllUndo = await waitChange(afterAll);
check("undo in the panel reverses Accept all", /^0 of/.test(afterAll ?? "") && afterAllUndo === after2, `${afterAll} -> ${afterAllUndo}`);
await panel.getByRole("tab", { name: /^Score/ }).click();
const score2 = await scoreAfter(score1);
check("undoing brings the score back", score2 === score0, `${score1} -> ${score2}`);
await panel.getByRole("tab", { name: /What changed/ }).click();

// 4c. click a change in the panel -> the document scrolls to it
const docScroll = () => page.evaluate(() => document.querySelector(".superdoc__sub-document")?.scrollTop ?? -1);
await page.evaluate(() => { const s = document.querySelector(".superdoc__sub-document"); if (s) s.scrollTop = 0; });
const cards = panel.locator("li[data-change-key]");
const lastCard = cards.nth((await cards.count()) - 1);
await lastCard.locator("button").first().click();
await page.waitForTimeout(1200);
const jumped = await docScroll();
check("clicking a change scrolls the document to it", jumped > 300 && (await lastCard.getAttribute("aria-current")) === "true", `scrollTop ${jumped}`);
const lastKey = await lastCard.getAttribute("data-change-key");
await panel.getByRole("button", { name: "Next change" }).click();
await page.waitForTimeout(1000);
const firstActive = await panel.locator("li[aria-current]").getAttribute("data-change-key").catch(() => null);
const counter = (await panel.getByText(/^\d+\/\d+$/).first().textContent().catch(() => "")) ?? "";
check("Next change wraps to the first change", !!firstActive && firstActive !== lastKey && counter.startsWith("1/"), `active ${firstActive}, ${counter}`);
// clicking tracked text in the document highlights its card (go to the last change, then click inserted text on screen)
await lastCard.locator("button").first().click();
await page.waitForTimeout(1200);
const insert = page.locator(".superdoc-page .track-insert-dec").filter({ hasText: /\w{4}/ }).last();
const snippet = ((await insert.textContent().catch(() => "")) ?? "").trim().slice(0, 15);
await panel.getByRole("button", { name: "Next change" }).click(); // move the highlight away first
await page.waitForTimeout(1000);
await insert.click();
await page.waitForTimeout(1000);
const activeText = (await panel.locator("li[aria-current]").textContent().catch(() => "")) ?? "";
check("clicking a change in the document highlights it in the panel", !!snippet && activeText.includes(snippet), `clicked "${snippet}", active card: "${activeText.slice(0, 60)}"`);
await page.screenshot({ path: path.join(out, "02d-jump-to-change.png") });

// 4d. compare with the original: Original view, side by side, scroll lock (the review editor must never reload)
await page.evaluate(() => (window.__superdoc.__e2eMarker = true));
const editorKept = () => page.evaluate(() => window.__superdoc?.__e2eMarker === true);
const paneScroll = (p) => page.evaluate((x) => document.querySelector(`[data-pane="${x}"] .superdoc__sub-document`)?.scrollTop ?? -1, p);
await page.getByRole("radio", { name: "Original" }).click();
await page.waitForSelector('[data-pane="original"] .superdoc__sub-document', { timeout: 30000 });
await page.waitForTimeout(1200);
const originalMarks = await page.evaluate(() => document.querySelectorAll('[data-pane="original"] .track-insert-dec, [data-pane="original"] .track-delete-dec').length);
const reviewHidden = await page.evaluate(() => getComputedStyle(document.querySelector('[data-pane="review"]')).visibility === "hidden");
check("Original shows the uploaded file without any suggestions", originalMarks === 0 && reviewHidden, `${originalMarks} tracked marks`);
await page.getByRole("radio", { name: "Suggesting" }).click();
await page.getByRole("button", { name: /Side by side/ }).click();
await page.waitForSelector('[data-pane="original"] .superdoc__sub-document', { timeout: 30000 });
await page.waitForTimeout(1500);
const fits = await page.evaluate(() => ["original", "review"].every((p) => {
  const pane = document.querySelector(`[data-pane="${p}"]`).getBoundingClientRect();
  const pg = document.querySelector(`[data-pane="${p}"] .superdoc-page`)?.getBoundingClientRect();
  return pg && pg.left >= pane.left - 1 && pg.right <= pane.right + 1;
}));
check("side by side: both pages fit their column", fits);
await page.evaluate(() => (document.querySelector('[data-pane="review"] .superdoc__sub-document').scrollTop = 900));
await page.waitForTimeout(600);
const lockedTop = await paneScroll("original");
await page.getByRole("button", { name: /Scroll locked/ }).click();
await page.evaluate(() => (document.querySelector('[data-pane="review"] .superdoc__sub-document').scrollTop = 1800));
await page.waitForTimeout(600);
const unlockedTop = await paneScroll("original");
check("scroll lock moves both sides; unlocked they move alone", lockedTop > 100 && unlockedTop === lockedTop, `locked ${lockedTop}, after unlocking ${unlockedTop}`);
await page.screenshot({ path: path.join(out, "02e-side-by-side.png") });
// swap sides, pick a view on the original's side (the sides swap), resize, hide and resize the panel
const sideOf = (p) => page.locator(`[data-pane="${p}"]`).getAttribute("data-side");
const paneWidth = (p) => page.locator(`[data-pane="${p}"]`).evaluate((e) => Math.round(e.getBoundingClientRect().width));
await page.locator('[data-pane-header="original"]').getByRole("button", { name: "Swap sides" }).click();
await page.waitForTimeout(500);
const swappedSide = await sideOf("original");
await page.locator('[data-pane-header="original"]').getByRole("radio", { name: "Viewing" }).click();
await page.waitForTimeout(500);
const reviewMode = await page.locator('[data-pane-header="review"] [aria-checked="true"]').textContent();
check("split view: swap sides, and pick the review's mode from either side", swappedSide === "right" && (await sideOf("original")) === "left" && reviewMode === "Viewing" && (await editorKept()), `${swappedSide}, then ${await sideOf("original")}, review in ${reviewMode}`);
await page.locator('[data-pane-header="review"]').getByRole("radio", { name: "Suggesting" }).click();
// drag the original's title bar (real mouse input) to the other half: a picture of the page follows the cursor
const sideBeforeDrag = await sideOf("original");
const titleBar = await page.locator('[data-pane-header="original"]').boundingBox();
const splitArea = await page.locator("[data-split]").boundingBox();
const targetX = sideBeforeDrag === "left" ? splitArea.x + splitArea.width * 0.75 : splitArea.x + splitArea.width * 0.25;
await page.mouse.move(titleBar.x + titleBar.width - 60, titleBar.y + titleBar.height / 2);
await page.mouse.down();
await page.mouse.move(targetX, splitArea.y + splitArea.height / 2, { steps: 15 });
const ghostShown = (await page.locator("[data-drag-ghost]").count()) === 1;
const zoneShown = await page.getByText(/^Original on the (left|right)$/).isVisible();
await page.mouse.up();
await page.waitForTimeout(500);
const sideAfterDrag = await sideOf("original");
check("split view: drag a side by its title bar to the other side (picture follows the cursor)", ghostShown && zoneShown && sideAfterDrag !== sideBeforeDrag && (await page.locator("[data-drag-ghost]").count()) === 0 && (await editorKept()), `${sideBeforeDrag} -> ${sideAfterDrag}, ghost ${ghostShown}, drop zone ${zoneShown}`);
const leftPane = (await sideOf("original")) === "left" ? "original" : "review";
const w0 = await paneWidth(leftPane);
const sep = await page.getByRole("separator", { name: "Resize the two sides" }).boundingBox();
await page.mouse.move(sep.x + sep.width / 2, sep.y + 200);
await page.mouse.down();
await page.mouse.move(sep.x - 200, sep.y + 200, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(800);
const w1 = await paneWidth(leftPane);
check("split view: the two sides can be resized by dragging the divider", w1 < w0 - 150, `${w0}px -> ${w1}px`);
await page.getByRole("button", { name: "Hide the review panel" }).click();
await page.waitForTimeout(600);
const hidden = await page.getByRole("button", { name: "Show the review panel" }).isVisible();
await page.getByRole("button", { name: "Show the review panel" }).click();
await page.waitForTimeout(600);
const edgeBox = await page.getByRole("separator", { name: "Resize the review panel" }).boundingBox();
await page.mouse.move(edgeBox.x + edgeBox.width / 2, 500);
await page.mouse.down();
await page.mouse.move(edgeBox.x - 120, 500, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(600);
const asideW = await page.locator("aside").first().evaluate((e) => Math.round(e.getBoundingClientRect().width));
check("review panel: can be hidden, shown again and resized", hidden && asideW > 450 && (await editorKept()), `panel ${asideW}px`);
await page.getByRole("button", { name: /Side by side/ }).click();
await page.waitForTimeout(500);
check("comparing never reloads the review editor (unsaved edits are safe)", (await editorKept()) && (await page.locator('[data-pane="original"]').count()) === 0);

// 4e. keyboard shortcuts (cursor outside the document text) and the "?" list
await page.locator("aside").getByText(/bot changes still open/).first().click(); // focus out of the document
const activeKeyNow = () => page.locator("aside li[aria-current]").first().getAttribute("data-change-key").catch(() => null);
const k0 = await activeKeyNow();
await page.keyboard.press("j");
await page.waitForTimeout(800);
const k1 = await activeKeyNow();
const openBefore = await openLine();
await page.keyboard.press("j"); // a change with tracked text (the first item may be the formatting group)
await page.waitForTimeout(800);
const openAtJ = await openLine();
await page.keyboard.press("a");
const openAfterA = await waitChange(openAtJ);
await page.keyboard.press("u");
const openAfterU = await waitChange(openAfterA);
await page.keyboard.press("?");
const helpShown = await page.getByRole("dialog", { name: "Keyboard shortcuts" }).isVisible().catch(() => false);
await page.keyboard.press("Escape");
check("shortcuts: J moves to a change, A accepts, U undoes, ? lists them", k1 !== k0 && openAfterA !== openAtJ && openAfterU === openAtJ && helpShown, `${k0} -> ${k1}; ${openBefore} / ${openAfterA} / ${openAfterU}; help ${helpShown}`);
// typing "j" inside the document is text, not a shortcut
await page.locator(".superdoc-page").first().click({ position: { x: 300, y: 400 } });
const kBefore = await activeKeyNow();
await page.keyboard.press("Escape");
await page.locator(".superdoc-page").first().click({ position: { x: 300, y: 400 } });
const textBefore = await page.evaluate(() => document.querySelector(".superdoc-page")?.textContent?.length ?? 0);
await page.keyboard.type("j");
await page.waitForTimeout(600);
const textAfter = await page.evaluate(() => document.querySelector(".superdoc-page")?.textContent?.length ?? 0);
await page.keyboard.press("Backspace");
check("shortcuts: typing a letter in the document stays text", textAfter === textBefore + 1 && (await activeKeyNow()) === kBefore, `${textBefore} -> ${textAfter}`);

// 4f. rename the student from the review page (used in the exported file names)
await page.getByRole("button", { name: /Rename the student/ }).or(page.getByTitle(/Rename the student/)).first().click();
await page.getByRole("textbox", { name: "Student’s name" }).fill("Ereview Tester");
await Promise.all([
  page.waitForResponse((r) => r.url().endsWith(`/api/jobs/${job.id}`) && r.request().method() === "PATCH", { timeout: 30000 }),
  page.getByRole("button", { name: "Save name" }).click(),
]);
await page.waitForTimeout(300);
const renamed = await (await fetch(`${base}/api/jobs/${job.id}`)).json();
check("rename the student from the review page", renamed.studentName === "Ereview Tester" && (await page.locator("h1").first().textContent())?.includes("Ereview Tester"), renamed.studentName);
await fetch(`${base}/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentName: job.studentName }) });

// 5. save as a new version
await page.getByRole("button", { name: /^Save$/ }).click();
await page.waitForTimeout(2500);
const saved = await (await fetch(`${base}/api/jobs/${job.id}`)).json();
check("save creates a new version", saved.versions.length === 3, saved.versions.map((v) => v.label).join(" | "));
const saveStatus = await page.getByText(/^Saved (just now|\d+ min ago)$/).first().isVisible().catch(() => false);
check("save status shows when it was saved", saveStatus);

// 5b. Mark as done teaches the bot (a learned record of this test's own document, removed at the end)
await page.getByRole("button", { name: /Export/ }).first().click();
await page.getByRole("menuitem", { name: "Mark as done" }).click();
await page.getByText("Marked as done").first().waitFor({ timeout: 30000 });
const learnedToast = await page.getByText(/The bot learned from this review|Learned from this review/).first().isVisible().catch(() => false);
const jobRecord = (await (await fetch(`${base}/api/learn`)).json()).records.find((r) => r.id === `job-${job.id}`);
check("mark as done: the bot learns what was kept, undone and added", learnedToast && !!jobRecord && jobRecord.suggestions.n > 0 && jobRecord.suggestions.kept > 0 && jobRecord.edits > 0, jobRecord ? `${jobRecord.edits} edits, ${JSON.stringify(jobRecord.suggestions)}` : "no record");
await fetch(`${base}/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ready" }) });

// 6. inspect the saved file
const savedFile = new Uint8Array(await (await fetch(`${base}/api/jobs/${job.id}/file?v=${saved.current}`)).arrayBuffer());
await writeFile(path.join(out, "saved.docx"), savedFile);
const zip = await JSZip.loadAsync(savedFile);
const docXml = await zip.file("word/document.xml").async("string");
const app = (await zip.file("docProps/app.xml")?.async("string")) ?? "";
const core = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
const revAuthors = [...new Set([...docXml.matchAll(/<w:(?:ins|del|rPrChange|pPrChange)\b[^>]*w:author="([^"]*)"/g)].map((m) => m[1]))];
check("saved file: all revisions by Karina Octavia", revAuthors.length === 1 && revAuthors[0] === "Karina Octavia", JSON.stringify(revAuthors));
check("saved file: application is Word", /<Application>Microsoft Office Word<\/Application>/.test(app), (app.match(/<Application>[^<]*/) ?? ["none"])[0]);
check("saved file: last modified by Karina", /lastModifiedBy>Karina Octavia</.test(core));
const traces = [...new Set(zip.file(/./).map((f) => f.name).filter((n) => /superdoc|harbour/i.test(n)))];
const xmlTrace = /superdoc|harbour/i.test(docXml + app + core);
check("saved file: no editor traces", traces.length === 0 && !xmlTrace, traces.join(", "));

// 6b. exports: clean Word file and PDF print view
const cleanRes = await fetch(`${base}/api/jobs/${job.id}/file?v=${saved.current}&download=clean`);
const cleanZip = await JSZip.loadAsync(new Uint8Array(await cleanRes.arrayBuffer()));
const cleanXml = await cleanZip.file("word/document.xml").async("string");
const disposition = cleanRes.headers.get("content-disposition") ?? "";
check("clean export: no tracked changes or comments", !/<w:(ins|del|rPrChange|pPrChange|commentReference)\b/.test(cleanXml) && !cleanZip.file("word/comments.xml"));
check("export uses Karina's file naming", /DONE_[^_]+_Study Plan_\d{8}_clean\.docx/.test(decodeURIComponent(disposition)), disposition);
const printPage = await newPage({ width: 1200, height: 900 });
await printPage.addInitScript(() => { window.print = () => { window.__printed = true; }; });
await printPage.goto(`${base}/jobs/${job.id}/print?v=${saved.current}&markup=0`);
await printPage.waitForFunction(() => window.__printed === true, null, { timeout: 60000 }).catch(() => {});
check("PDF view opens the print dialog when ready", await printPage.evaluate(() => window.__printed === true));
await printPage.screenshot({ path: path.join(out, "02c-print-view.png") });
await printPage.close();

// 7. restore original
await page.getByRole("tab", { name: /Versions/ }).click();
await page.getByRole("button", { name: "Restore the original document" }).click();
await page.getByRole("button", { name: "Restore", exact: true }).click();
await page.waitForTimeout(1500);
await page.waitForFunction(() => !!window.__superdoc, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const restored = await (await fetch(`${base}/api/jobs/${job.id}`)).json();
const restoredList = await listTracked();
const restoredCount = restoredList?.total ?? restoredList?.items?.length ?? -1;
const origBytes = await readFile(sample);
const restoredBytes = new Uint8Array(await (await fetch(`${base}/api/jobs/${job.id}/file?v=${restored.current}`)).arrayBuffer());
check("restore original: new version, identical to the uploaded file", restored.versions.at(-1).kind === "restore" && Buffer.compare(Buffer.from(origBytes), Buffer.from(restoredBytes)) === 0);
check("restore original: editor shows no tracked changes", restoredCount === 0, `${restoredCount}`);
await page.screenshot({ path: path.join(out, "03-restored-desktop.png") });

// 7b. Review rules page: a rule added and saved on the page reaches the rules engine (the saved file is restored after)
const savedRules = await (await fetch(`${base}/api/rules`)).json();
try {
  const rp = await newPage({ width: 1280, height: 900 });
  await rp.goto(`${base}/rules`);
  await rp.getByRole("button", { name: "Add a rule" }).click();
  const form = rp.locator("li[data-rule-id]").last();
  await form.getByRole("textbox", { name: "Name" }).fill("e2e: wordy phrase");
  await form.getByRole("textbox", { name: "Look for" }).fill("in order to");
  await form.getByRole("textbox", { name: "Replace with" }).fill("to");
  await rp.getByRole("button", { name: "Save rules" }).click();
  await rp.getByText("Rules saved").waitFor({ timeout: 15000 });
  const now = await (await fetch(`${base}/api/rules`)).json();
  const added = now.rules.custom.find((r) => r.label === "e2e: wordy phrase");
  const preview = await (await fetch(`${base}/api/rules/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "I study hard in order to reach my dream of becoming an engineer in the future.", docType: "Study Plan", rules: now.rules }),
  })).json();
  check("Review rules page: a saved rule is in the rules file and used by the engine", !!added && preview.changes?.some((c) => c.before === "in order to" && c.after === "to"));
  await rp.close();
} finally {
  await fetch(`${base}/api/rules`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: savedRules.rules }) });
}

// 7d. Review rules -> From your reviews: upload reviews done in Word, approve a learned rule, dismiss, forget.
// Uses two small made-up reviews; every learned record this test creates is removed by id afterwards.
const stamp = Date.now().toString(36);
const madeUp = async (n) => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const run = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const edit = (i) => `<w:p><w:del w:id="${2 * i}" w:author="Karina Octavia" w:date="2026-09-30T10:00:00Z"><w:r><w:delText xml:space="preserve">In order to</w:delText></w:r></w:del><w:ins w:id="${2 * i + 1}" w:author="Karina Octavia" w:date="2026-09-30T10:00:00Z"><w:r><w:t>To</w:t></w:r></w:ins>${run(` reach goal ${n}${i}, I practise every week with my friends at the campus.`)}</w:p>`;
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body><w:p>${run("I graduated from a university in Indonesia with a degree in computer science and worked there for two years.")}</w:p>${edit(1)}${edit(2)}<w:sectPr/></w:body></w:document>`);
  return Buffer.from(await z.generateAsync({ type: "uint8array" }));
};
const learnBefore = await (await fetch(`${base}/api/learn`)).json();
const rulesBeforeLearn = await (await fetch(`${base}/api/rules`)).json();
const e2eRecords = async () => (await (await fetch(`${base}/api/learn`)).json()).records.filter((r) => r.fileName.includes(`E2E learn ${stamp}`));
try {
  const lp = await newPage({ width: 1280, height: 900 });
  await lp.goto(`${base}/rules?tab=learned`);
  const input = lp.locator('input[aria-label="Word file with your tracked changes"]');
  for (const n of ["A", "B"]) {
    await input.setInputFiles({ name: `E2E learn ${stamp} ${n}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await madeUp(n) });
    await lp.getByText(`Learned from “E2E learn ${stamp} ${n}.docx”`).waitFor({ timeout: 30000 });
  }
  const mine = await e2eRecords();
  const card = lp.locator("li[data-proposal]").filter({ hasText: "Replace “In order to” with “To”" });
  const cardShown = await card.first().isVisible().catch(() => false);
  check("From your reviews: two uploaded reviews give a learned rule with its evidence", mine.length === 2 && cardShown && /changed it 4 of \d+ times/.test((await card.first().textContent()) ?? ""), `${mine.length} records, card ${cardShown}`);

  await card.first().getByRole("button", { name: "Add this rule" }).click();
  const ruleItem = lp.locator('li[data-rule-id^="r-learned-"]').filter({ hasText: "In order to" });
  const opened = await ruleItem.getByRole("textbox", { name: "Look for" }).isVisible().catch(() => false);
  await lp.getByRole("button", { name: "Save rules" }).click();
  await lp.getByText("Rules saved").waitFor({ timeout: 15000 });
  const learnedRules = await (await fetch(`${base}/api/rules`)).json();
  const preview = await (await fetch(`${base}/api/rules/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "In order to win, I trained every single day with my team at the club.", docType: "Study Plan", rules: learnedRules.rules }),
  })).json();
  check("approving a learned rule opens it in Your rules, and once saved the engine uses it", opened && learnedRules.rules.custom.some((r) => r.id.startsWith("r-learned-") && r.find === "In order to") && preview.changes?.some((c) => c.before === "In order to" && c.after === "To"));

  await lp.goto(`${base}/rules?tab=learned`);
  const ex = lp.locator("li[data-proposal^='ex:']").filter({ hasText: /goal [AB]/ }).first();
  const exKey = await ex.getAttribute("data-proposal");
  await ex.getByRole("button", { name: "Dismiss" }).click();
  await lp.getByText("Dismissed. It won’t be suggested again.").waitFor({ timeout: 10000 });
  await lp.reload();
  await lp.getByText(/Learned from \d+ document/).waitFor({ timeout: 20000 });
  const stillThere = await lp.locator(`li[data-proposal="${exKey}"]`).count();
  await fetch(`${base}/api/learn/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undismiss", key: exKey }) });
  check("a dismissed suggestion stays dismissed after a reload", !!exKey && stillThere === 0, exKey ?? "no example card");

  await lp.getByRole("button", { name: /Documents it learned from/ }).click();
  await lp.locator(`li[data-record="${mine[0].id}"]`).getByRole("button", { name: "Forget" }).click();
  await lp.getByText(/The bot forgot/).waitFor({ timeout: 10000 });
  const left = await e2eRecords();
  const othersKept = (await (await fetch(`${base}/api/learn`)).json()).records.filter((r) => !r.fileName.includes(`E2E learn ${stamp}`)).length === learnBefore.records.length;
  check("Forget removes only that learned document", left.length === 1 && left[0].id === mine[1].id && othersKept, `${left.length} left`);
  await lp.screenshot({ path: path.join(out, "05-learned.png"), fullPage: true });
  await lp.close();
} finally {
  for (const r of await e2eRecords()) await fetch(`${base}/api/learn/${encodeURIComponent(r.id)}`, { method: "DELETE" });
  await fetch(`${base}/api/rules`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: rulesBeforeLearn.rules }) });
}

// 7c. documents page: search, delete with Undo, Recently deleted -> Restore (only this test's own document)
{
  // give this test's document a unique name first, so search and delete can only ever touch it
  const name = `E2E Test ${Date.now().toString(36)}`;
  await fetch(`${base}/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentName: name }) });
  const dp = await newPage({ width: 1280, height: 900 });
  await dp.goto(`${base}/`);
  await dp.getByRole("searchbox", { name: "Search documents" }).fill(name);
  await dp.waitForTimeout(300);
  const rows = dp.locator('section[aria-label="Documents"] li');
  const found = (await rows.count()) === 1 && (await rows.filter({ hasText: name }).count()) === 1;
  await dp.getByRole("searchbox", { name: "Search documents" }).fill("zzzz-no-such-document");
  const empty = await dp.getByText(/Nothing matches/).isVisible();
  check("documents page: search finds the document and says when nothing matches", found && empty);
  await dp.getByRole("searchbox", { name: "Search documents" }).fill(name);
  const actions = () => dp.getByRole("button", { name: `Actions for ${name}`, exact: true });
  await actions().click();
  await dp.getByRole("menuitem", { name: "Delete" }).click();
  await dp.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" }).first().click();
  await dp.waitForTimeout(1200);
  const backAfterUndo = !!(await (await fetch(`${base}/api/jobs/${job.id}`)).json()).id;
  await actions().click();
  await dp.getByRole("menuitem", { name: "Delete" }).click();
  await dp.waitForTimeout(800);
  const goneAfterDelete = (await fetch(`${base}/api/jobs/${job.id}`)).status === 404;
  await dp.getByRole("button", { name: "Recently deleted" }).click();
  const trashRow = dp.locator('section[aria-label="Recently deleted"] li').filter({ hasText: name }).first();
  await trashRow.getByRole("button", { name: "Restore" }).click();
  await dp.waitForTimeout(1200);
  const restoredBack = (await fetch(`${base}/api/jobs/${job.id}`)).ok;
  check("documents page: delete can be undone, and restored from Recently deleted", backAfterUndo && goneAfterDelete && restoredBack, `undo ${backAfterUndo}, deleted ${goneAfterDelete}, restored ${restoredBack}`);
  await dp.close();
  await fetch(`${base}/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentName: job.studentName }) });
}

// 7d. dark mode: app and editor chrome go dark, the page stays white paper (or inverts on request), printing stays light
{
  const tp = await newPage({ width: 1440, height: 900 });
  await tp.goto(`${base}/jobs/${job.id}`);
  await tp.waitForFunction(() => !!window.__superdoc, null, { timeout: 60000 });
  await tp.getByRole("button", { name: /Appearance/ }).click();
  await tp.getByRole("menuitem", { name: "Dark", exact: true }).click();
  await tp.waitForTimeout(800);
  const look = () => tp.evaluate(() => {
    const page = document.querySelector(".superdoc-page");
    return {
      dark: document.documentElement.classList.contains("dark"),
      body: getComputedStyle(document.body).backgroundColor,
      paper: page ? getComputedStyle(page).backgroundColor : null,
      filter: page ? getComputedStyle(page).filter : null,
      toolbar: getComputedStyle(document.documentElement).getPropertyValue("--sd-ui-toolbar-bg").trim(),
    };
  });
  const d = await look();
  await tp.screenshot({ path: path.join(out, "08-dark-review.png") });
  await tp.getByRole("button", { name: /Appearance/ }).click();
  await tp.getByRole("menuitem", { name: /Dark paper/ }).click();
  await tp.waitForTimeout(500);
  const dp2 = await look();
  check("dark mode: app and editor toolbar dark, page stays white; dark paper inverts the page", d.dark && d.body === "rgb(17, 20, 27)" && d.paper === "rgb(255, 255, 255)" && d.toolbar === "#191d26" && d.filter === "none" && dp2.filter.includes("invert"), JSON.stringify({ ...d, darkPaper: dp2.filter }));
  await tp.goto(`${base}/jobs/${job.id}/print?v=1&markup=0`);
  await tp.waitForTimeout(1500);
  const printLight = await tp.evaluate(() => !document.documentElement.classList.contains("dark"));
  check("dark mode: the print view stays light", printLight);
  await tp.close();
}

// 8. phone layout
const phone = await newPage({ width: 390, height: 844 });
await phone.goto(`${base}/`);
await phone.screenshot({ path: path.join(out, "04-inbox-phone.png") });
await phone.goto(`${base}/jobs/${job.id}`);
await phone.waitForFunction(() => !!window.__superdoc, null, { timeout: 60000 });
await phone.waitForTimeout(2000);
await phone.screenshot({ path: path.join(out, "05-review-phone.png") });
await phone.getByRole("button", { name: /changes|Review panel/ }).last().click();
await phone.waitForTimeout(600);
await phone.screenshot({ path: path.join(out, "06-review-phone-sheet.png") });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("phone: no horizontal page scroll", !overflow);

// 9. PDF from a student: converted to Word, reviewed and exported like any document
if (pdfSample) {
  const pf = new FormData();
  const pdfBytes = await readFile(pdfSample);
  pf.append("files", new Blob([pdfBytes]), path.basename(pdfSample));
  const pup = await (await fetch(`${base}/api/jobs`, { method: "POST", body: pf })).json();
  const pjob = pup.created?.[0];
  check("PDF upload is converted to a Word document", !!pjob && pjob.fileName.endsWith(".docx") && pjob.sourceFile?.kind === "pdf", pup.errors?.join("; ") ?? pjob?.fileName);
  if (pjob) {
    try {
      const src = await fetch(`${base}/api/jobs/${pjob.id}/file?source=1`);
      check("the student's PDF is kept exactly as sent", src.headers.get("content-type") === "application/pdf" && Buffer.compare(Buffer.from(await src.arrayBuffer()), Buffer.from(pdfBytes)) === 0);
      const ppr = await fetch(`${base}/api/jobs/${pjob.id}/proofread`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai: false }) });
      const plast = (await ppr.text()).trim().split("\n").map((l) => JSON.parse(l)).at(-1);
      check("the converted PDF is proofread", !!plast.done && plast.job.proofread.changes.length > 0, plast.error ?? `${plast.job?.proofread?.changes.length} changes`);
      const pp = await newPage({ width: 1440, height: 900 });
      await pp.goto(`${base}/jobs/${pjob.id}`);
      await pp.waitForFunction(() => !!window.__superdoc, null, { timeout: 60000 });
      await pp.waitForTimeout(2000);
      const ptracked = await pp.evaluate(async () => (await window.__superdoc.activeEditor.doc.trackChanges.list({ limit: 5000 })).total);
      check("the converted PDF opens in the review editor with tracked changes", ptracked > 0, `${ptracked} tracked changes`);
      await pp.screenshot({ path: path.join(out, "07-pdf-review.png") });
      await pp.close();
      const cleanPdf = await fetch(`${base}/api/jobs/${pjob.id}/file?v=current&download=clean`);
      const czip = await JSZip.loadAsync(new Uint8Array(await cleanPdf.arrayBuffer()));
      check("a reviewed PDF exports as a Word file", !!czip.file("word/document.xml") && /DONE_.+_clean\.docx/.test(decodeURIComponent(cleanPdf.headers.get("content-disposition") ?? "")), cleanPdf.headers.get("content-disposition") ?? "");
      const ppv = await newPage({ width: 1200, height: 900 });
      await ppv.addInitScript(() => { window.print = () => { window.__printed = true; }; });
      await ppv.goto(`${base}/jobs/${pjob.id}/print?v=${plast.job.current}&markup=0`);
      await ppv.waitForFunction(() => window.__printed === true, null, { timeout: 60000 }).catch(() => {});
      check("a reviewed PDF exports as PDF (print view)", await ppv.evaluate(() => window.__printed === true));
      await ppv.close();
    } finally {
      await discard(pjob.id);
    }
  }
}

check("no requests leave the app (privacy)", !blocked.some((b) => b.startsWith("EXTERNAL")), blocked.filter((b) => b.startsWith("EXTERNAL")).slice(0, 3).join("; "));
console.log(`\nconsole errors (${consoleErrors.length}):`, consoleErrors.slice(0, 8));
await browser.close();
await discard(job.id);
await fetch(`${base}/api/learn/job-${job.id}`, { method: "DELETE" }).catch(() => {}); // what it learned from this test's document
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${out}`);
process.exit(failed ? 1 : 0);
