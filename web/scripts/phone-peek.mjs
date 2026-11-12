// Phone-size screenshots of one page section by section (design review). Dev server must run.
// Usage: node scripts/phone-peek.mjs <url path> <outDir> [screens=3]
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [route = "/", out = "e2e-shots/phone", screens = "3"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
await page.goto(`http://localhost:3000${route}`);
await page.waitForTimeout(1500);
for (let i = 0; i < Number(screens); i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * 760);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `screen-${i + 1}.png`) });
}
await browser.close();
