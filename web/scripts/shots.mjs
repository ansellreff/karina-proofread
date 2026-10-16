/**
 * Screenshots of every screen in light and dark mode (design review).
 *   node scripts/shots.mjs <jobId> <outDir> [--dark-only] [--paper dark]
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const [id, out] = args;
const themes = args.includes("--dark-only") ? ["dark"] : ["light", "dark"];
const paper = args.includes("--paper") ? args[args.indexOf("--paper") + 1] : "white";
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath: edge, headless: true });
for (const theme of themes) {
  for (const [device, viewport] of [["desk", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, colorScheme: theme });
    await ctx.addInitScript(([t, p]) => {
      localStorage.setItem("theme", t);
      localStorage.setItem("kp:paper", JSON.stringify(p));
    }, [theme, paper]);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && console.log(`[${theme}/${device}]`, m.text().slice(0, 160)));
    const shot = async (name) => page.screenshot({ path: path.join(out, `${theme}-${device}-${name}.png`) });
    for (const [name, url] of [["documents", "/"], ["rules", "/rules"], ["settings", "/settings"]]) {
      await page.goto(`http://localhost:3000${url}`);
      await page.waitForTimeout(1200);
      await shot(name);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`${theme}/${device}/${name}: horizontal overflow`);
    }
    await page.goto(`http://localhost:3000/jobs/${id}`);
    await page.waitForFunction(() => !!window.__superdoc, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    await shot("review");
    if (device === "desk") {
      await page.getByRole("button", { name: /Side by side/ }).click().catch(() => {});
      await page.waitForTimeout(2500);
      await shot("review-split");
      await page.goto(`http://localhost:3000/jobs/${id}/print?v=1&markup=1`);
      await page.waitForTimeout(3500);
      await shot("print");
    }
    await ctx.close();
  }
}
await browser.close();
