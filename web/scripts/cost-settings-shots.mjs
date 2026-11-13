// Settings → AI cost on a SCRATCH app (never Karina's): sets a budget, warnings, a per-run limit and a currency,
// adds a top-up, and checks the Proofread window shows them (the free token-count estimate only: no AI run).
// Usage: node scripts/cost-settings-shots.mjs <made-up .docx> <outDir> --base http://localhost:3100
// The scratch app needs ANTHROPIC_API_KEY in its environment for the estimate.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [doc, out = "e2e-shots/cost-settings"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const base = process.argv[process.argv.indexOf("--base") + 1];
if (!doc || !process.argv.includes("--base") || /:3000\b/.test(base)) {
  console.error("Usage: node scripts/cost-settings-shots.mjs <made-up .docx> <outDir> --base http://localhost:3100 (a scratch app, not port 3000)");
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const problems = [];
const check = (ok, what) => ok || problems.push(what);

const form = new FormData();
form.append("files", new Blob([readFileSync(doc)]), path.basename(doc));
const job = (await (await fetch(`${base}/api/jobs`, { method: "POST", body: form })).json()).created[0];
const password = readFileSync(new URL("../src/lib/ai/ai-password.ts", import.meta.url), "utf8").match(/AI_PASSWORD\s*=\s*"([^"]*)"/)[1];

const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath: edge, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(`${base}/settings`);
await page.getByRole("heading", { name: "AI cost" }).waitFor();

// the AI cost options
await page.getByLabel("Your API balance").fill("1");
await page.getByLabel("Monthly budget").fill("5");
await page.getByRole("radio", { name: "Pause AI runs" }).click();
const turnOn = async (name) => {
  const sw = page.getByRole("switch", { name });
  if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
};
await turnOn("Ask before a costly run");
await page.locator("#ask").fill("0.01");
await turnOn("Show costs in my currency too");
await page.locator("#rate").fill("16300");
await page.getByRole("radio", { name: "Low" }).click();
check(await page.getByText(/changes that aren’t saved/).isVisible(), "no unsaved-changes note");
await page.keyboard.press("Control+s");
check(await page.getByText("Settings saved").waitFor({ timeout: 5000 }).then(() => true, () => false), "Ctrl+S didn't save");
await page.reload();
await page.getByRole("heading", { name: "AI cost" }).waitFor();
check((await page.getByLabel("Monthly budget").inputValue()) === "5", "budget not kept");
check((await page.locator("#rate").inputValue()) === "16300", "exchange rate not kept");
check(await page.getByRole("radio", { name: "Low" }).getAttribute("aria-checked").then((v) => v === "true"), "thoroughness Low not kept");

// a top-up goes on top of what's left
await page.getByLabel("Add a top-up").fill("10");
await page.getByRole("button", { name: "Add to balance" }).click();
check(await page.getByText(/balance is now US\$11\.00/).waitFor({ timeout: 5000 }).then(() => true, () => false), "top-up didn't add to the balance");
await page.waitForTimeout(400);
check(!(await page.getByText(/changes that aren’t saved/).isVisible()), "a top-up left the form showing unsaved changes");
await page.locator("#ai-cost").screenshot({ path: path.join(out, "settings-ai-cost.png") });
await page.screenshot({ path: path.join(out, "settings-full.png"), fullPage: true });

// AI costs page shows the budget
await page.goto(`${base}/costs`);
check(await page.getByText(/Monthly budget:/).isVisible(), "AI costs page: no budget bar");
await page.screenshot({ path: path.join(out, "costs.png"), fullPage: true });

// the Proofread window: unlock, estimate in both currencies, the "run it anyway" question
await page.goto(`${base}/jobs/${job.id}`);
await page.getByRole("button", { name: /Proofread this document/ }).first().click();
const dialog = page.getByRole("dialog");
if (await dialog.getByPlaceholder("AI password").isVisible().catch(() => false)) {
  await dialog.getByPlaceholder("AI password").fill(password);
  await dialog.getByRole("button", { name: "Unlock", exact: true }).click();
}
await dialog.getByText(/Estimated cost/).waitFor({ timeout: 60000 });
check(await dialog.getByText(/IDR/).first().isVisible(), "estimate not shown in IDR");
const go = dialog.getByRole("button", { name: "Proofread with AI" });
check(await go.isDisabled(), "costly run not held back before confirming");
await dialog.getByText("Run it anyway").click();
check(await go.isEnabled(), "Run it anyway didn't allow the run");
await dialog.screenshot({ path: path.join(out, "proofread-dialog.png") });
await page.keyboard.press("Escape");

// dark and phone
await page.emulateMedia({ colorScheme: "dark" });
await page.goto(`${base}/settings#ai-cost`);
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.waitForTimeout(600);
await page.locator("#ai-cost").screenshot({ path: path.join(out, "settings-ai-cost-dark.png") });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/settings`);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, "settings-phone.png"), fullPage: true });

await fetch(`${base}/api/jobs/${job.id}`, { method: "DELETE" });
await browser.close();
console.log(problems.length ? problems.join("\n") : "AI cost settings, top-up, costs page and Proofread window all work.");
