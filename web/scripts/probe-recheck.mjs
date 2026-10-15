/** Dev probe: select a paragraph in the editor and run "Re-check selection" (real AI call on one paragraph). node scripts/probe-recheck.mjs <jobId> "<text in a paragraph>" */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const [id, phrase] = process.argv.slice(2);
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("console", (m) => m.type() === "error" && console.log("[error]", m.text().slice(0, 300)));
await page.goto(`http://localhost:3000/jobs/${id}`);
await page.waitForFunction(() => !!window.__superdoc, null, { timeout: 60000 });
await page.waitForTimeout(3000);
const count = async () => (await page.evaluate(async () => (await window.__superdoc.activeEditor.doc.trackChanges.list({ limit: 5000 })).total));
const before = await count();
await page.getByText(phrase, { exact: false }).first().click({ clickCount: 3 });
await page.waitForTimeout(500);
const sel = await page.evaluate(async () => (await window.__superdoc.activeEditor.doc.selection.current({ includeText: true }))?.text ?? "");
console.log("selected:", JSON.stringify(sel.slice(0, 120)), `(${sel.length} chars)`);
await page.getByRole("button", { name: /Re-check selection/ }).click();
await page.waitForSelector("[data-sonner-toast]", { timeout: 120000 });
console.log("toast:", await page.locator("[data-sonner-toast]").first().textContent());
const after = await count();
const mine = await page.evaluate(async () => (await window.__superdoc.activeEditor.doc.trackChanges.list({ limit: 5000 })).items.filter((i) => i.type !== "formatting").map((i) => `${i.author}: [${i.deletedText ?? ""}] -> [${i.insertedText ?? ""}]`));
console.log(`tracked: ${before} -> ${after}`);
console.log(mine.slice(-8).join("\n"));
await page.screenshot({ path: process.argv[4] ?? "recheck.png" });
await browser.close();
