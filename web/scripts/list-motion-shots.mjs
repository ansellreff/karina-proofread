// Documents list check on a SCRATCH app (never Karina's): uploads made-up documents, then checks the upload
// times, the queue numbers, the Priority list (star, drag to reorder, keys) and the tab shuffle, with screenshots.
// Usage: node scripts/list-motion-shots.mjs <folder of .docx> <outDir> --base http://localhost:3100
// (start the scratch app with DATABASE_URL=pglite:<empty folder>; see CLAUDE.md "Trying online mode on this PC")
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [docs, out = "e2e-shots/list-motion"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const base = process.argv[process.argv.indexOf("--base") + 1];
if (!docs || !process.argv.includes("--base") || /:3000\b/.test(base)) {
  console.error("Usage: node scripts/list-motion-shots.mjs <folder of .docx> <outDir> --base http://localhost:3100 (a scratch app, not port 3000)");
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const problems = [];
const check = (ok, what) => ok || problems.push(what);

// ---- made-up documents, uploaded one by one (so their upload times differ) ----
const jobs = [];
for (const f of readdirSync(docs).filter((n) => n.endsWith(".docx"))) {
  const form = new FormData();
  form.append("files", new Blob([readFileSync(path.join(docs, f))]), f);
  const res = await fetch(`${base}/api/jobs`, { method: "POST", body: form });
  jobs.push((await res.json()).created?.[0]);
  await new Promise((r) => setTimeout(r, 1100));
}
check(jobs.length >= 5 && jobs.every((j) => j?.id), "upload failed");
for (const j of jobs.slice(0, 3)) await fetch(`${base}/api/jobs/${j.id}/proofread`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai: false }) });
// the proofreads finish in the background: wait, so marking one as done isn't overwritten
for (let t = 0; t < 60; t++) {
  const list = await (await fetch(`${base}/api/jobs`)).json();
  if (jobs.slice(0, 3).every((j) => list.find((x) => x.id === j.id)?.status === "ready")) break;
  await new Promise((r) => setTimeout(r, 500));
}
await fetch(`${base}/api/jobs/${jobs[0].id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });

const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const rows = page.locator("ul.divide-y > li[data-flip]");
await page.goto(base);
await rows.first().waitFor();

// both times on every row, and queue numbers for the open documents (the done one has none)
check((await page.getByText(/^Uploaded/).count()) >= jobs.length, "upload time missing");
check((await page.getByText(/#1 in queue/).count()) === 1, "queue number 1 missing");
await page.getByLabel("Sort").selectOption("queue");
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(out, "sort-queue-mid.png") });
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(out, "sort-queue.png") });
check((await rows.first().innerText()).includes("#1 in queue") || (await rows.first().innerText()).includes("Done"), "upload order: oldest not first");

// star three documents; the Priority tab lists them 1, 2, 3
for (let n = 0; n < 3; n++) {
  await page.getByRole("button", { name: new RegExp(`Add .* to the Priority list`) }).first().click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: path.join(out, "starred.png") });
await page.getByRole("tab", { name: /Priority/ }).click();
for (const ms of [120, 300, 650]) {
  await page.waitForTimeout(ms === 120 ? 120 : ms - 120);
  await page.screenshot({ path: path.join(out, `tab-priority-${ms}ms.png`) });
}
await page.waitForTimeout(500);
check((await rows.count()) === 3, `Priority tab shows ${await rows.count()} documents, expected 3`);
const names = async () => (await rows.allInnerTexts()).map((t) => t.split("\n").find((l) => l.trim() && !/^\d+$/.test(l.trim())));
const before = await names();

// drag the third to the top
const grip = (i) => rows.nth(i).locator(".drag-grip");
const from = await grip(2).boundingBox();
const to = await grip(0).boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
for (let s = 1; s <= 12; s++) await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - ((from.y - to.y + 20) * s) / 12);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, "dragging.png") });
await page.mouse.up();
await page.waitForTimeout(1500);
const afterDrag = await names();
check(afterDrag[0] === before[2], `drag: expected ${before[2]} first, got ${afterDrag.join(", ")}`);
await page.reload();
await rows.first().waitFor();
check((await names())[0] === before[2], "drag: order not saved");

// keys: the first one down by one
await grip(0).focus();
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(1500);
check((await names())[1] === before[2], "arrow key didn't move it down");
await page.screenshot({ path: path.join(out, "priority.png") });

// shuffle between tabs: frames mid-way
await page.getByRole("tab", { name: /^All/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, "tab-all-200ms.png") });
await page.getByRole("tab", { name: /Waiting/ }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, "tab-waiting-200ms.png") });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, "tab-waiting.png") });

// marking a starred one as done takes it off the list
const id = jobs[1].id;
await fetch(`${base}/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
await page.goto(`${base}/?status=priority`);
await rows.first().waitFor();
check((await rows.count()) === 2, "done document still on the Priority list");

// dark theme and phone
await page.emulateMedia({ colorScheme: "dark" });
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.goto(`${base}/?status=priority`);
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, "priority-dark.png") });
await page.goto(base);
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, "all-dark.png") });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/?status=priority`);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(out, "priority-phone.png"), fullPage: true });
await page.emulateMedia({ colorScheme: "light" });
await page.goto(base);
await page.evaluate(() => document.documentElement.classList.remove("dark"));
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(out, "all-phone.png"), fullPage: true });

await browser.close();
console.log(problems.length ? problems.join("\n") : "Upload times, queue, Priority list and tab shuffle all work.");
