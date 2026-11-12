// Frames of the Mark as done / Reopen animations from the "⋯" menu on the Documents page. The status change is
// intercepted in the browser (nothing on the server changes). Dev server must run; needs a "Ready to review" and a
// "Done" document in the list. Usage: node scripts/status-pop-shots.mjs <outDir>
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2] ?? "e2e-shots/status-pop";
mkdirSync(out, { recursive: true });
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
// answer the status change here, so no document is really marked as done or reopened
await page.route("**/api/jobs/*", (route) => {
  if (route.request().method() !== "PATCH") return route.continue();
  return route.fulfill({ json: { id: "x", status: JSON.parse(route.request().postData() ?? "{}").status } });
});
const problems = [];

async function run(tab, item, name) {
  await page.goto(`http://localhost:3000/?status=${tab}`);
  const row = page.locator("ul.divide-y > li").first();
  await row.waitFor();
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: item }).click();
  const start = Date.now();
  for (const ms of [250, 600, 1100, 1700]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - start)));
    if (ms === 1100 && !(await page.locator(`[data-status-pop="${name}"]`).count())) problems.push(`${name}: no animation on screen`);
    await page.screenshot({ path: path.join(out, `${name}-${ms}ms.png`) });
  }
}

await run("ready", "Mark as done", "done");
await run("done", "Reopen", "reopen");
await browser.close();
console.log(problems.length ? problems.join("\n") : "Both animations played.");
