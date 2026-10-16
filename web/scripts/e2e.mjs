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
const sample = args.find((a, i) => !a.startsWith("--") && !["--out", "--base"].includes(args[i - 1]));
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
// if the run crashes, remove only this test's own document (never anything else in the app)
const cleanUp = async (e) => {
  console.error(e);
  if (job) await fetch(`${base}/api/jobs/${job.id}`, { method: "DELETE" }).catch(() => {});
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
await page.waitForTimeout(2500); // let the score settle after the earlier accept/reject
const score0 = await scoreNow();
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
await page.getByRole("button", { name: /Side by side/ }).click();
await page.waitForTimeout(500);
check("comparing never reloads the review editor (unsaved edits are safe)", (await editorKept()) && (await page.locator('[data-pane="original"]').count()) === 0);

// 5. save as a new version
await page.getByRole("button", { name: /^Save$/ }).click();
await page.waitForTimeout(2500);
const saved = await (await fetch(`${base}/api/jobs/${job.id}`)).json();
check("save creates a new version", saved.versions.length === 3, saved.versions.map((v) => v.label).join(" | "));

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

check("no requests leave the app (privacy)", !blocked.some((b) => b.startsWith("EXTERNAL")), blocked.filter((b) => b.startsWith("EXTERNAL")).slice(0, 3).join("; "));
console.log(`\nconsole errors (${consoleErrors.length}):`, consoleErrors.slice(0, 8));
await browser.close();
await fetch(`${base}/api/jobs/${job.id}`, { method: "DELETE" });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${out}`);
process.exit(failed ? 1 : 0);
