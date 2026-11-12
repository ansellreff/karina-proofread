// Screenshots of the Proofread record page with made-up entries (dev only: /record?preview=<n>) and of the
// Documents page tabs, light and dark, desktop and phone: for checking the look. Writes to <outDir>.
// Usage (dev server running): node scripts/record-shots.mjs <outDir> [finished=30]
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [out = "e2e-shots/record", finished = "30"] = process.argv.slice(2);
const base = "http://localhost:3000";
mkdirSync(out, { recursive: true });
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath: edge, headless: true });
const errors = [];

for (const scheme of ["light", "dark"]) {
  for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme });
    await ctx.addInitScript((t) => localStorage.setItem("theme", t), scheme);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${scheme}/${name}: ${e.message}`));
    await page.goto(`${base}/record?preview=${finished}`);
    await page.waitForSelector("[data-trophy]");
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(out, `record-${scheme}-${name}.png`), fullPage: name === "phone" });
    // pick another trophy in the cabinet: the spotlight swaps
    await page.locator('[data-badge="bronze"] button').click();
    await page.waitForTimeout(250);
    if (name === "desktop" && scheme === "light") await page.screenshot({ path: path.join(out, "record-swapping.png") });
    await page.waitForTimeout(900);
    const shown = await page.locator("[data-trophy]").getAttribute("data-trophy");
    if (shown !== "bronze") errors.push(`${scheme}/${name}: spotlight shows ${shown} after picking bronze`);
    // a locked one
    await page.locator('[data-badge="platinum"] button').click();
    await page.waitForTimeout(1000);
    if (name === "desktop") await page.locator("[data-trophy]").screenshot({ path: path.join(out, `record-locked-${scheme}.png`) });
    // the big trophy celebrates when clicked (back on the current one)
    await page.getByRole("button", { name: /Back to your trophy now/ }).click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /click to celebrate/ }).click();
    await page.waitForTimeout(300);
    const confetti = await page.locator("[data-confetti]").count();
    if (!confetti) errors.push(`${scheme}/${name}: no confetti after clicking the trophy`);
    // keyboard: arrows move through the trophies
    await page.getByRole("button", { name: "Next trophy" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    if (name === "desktop" && scheme === "light") await page.screenshot({ path: path.join(out, "record-next.png") });

    // Documents page: the Archived tab
    await page.goto(`${base}/?status=archived`);
    await page.waitForSelector('[role="tab"]');
    await page.screenshot({ path: path.join(out, `documents-archived-${scheme}-${name}.png`) });
    await ctx.close();
  }
}
await browser.close();
console.log(errors.length ? `Problems:\n${errors.join("\n")}` : "All checks passed.");
