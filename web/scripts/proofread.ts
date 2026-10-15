/**
 * Proofread .docx files in Karina's style from the command line.
 *
 *   npm run proofread -- <file.docx | folder> [--out <folder>] [--no-grammar] [--json]
 *                        [--ai] [--model claude-opus-5-5] [--effort high] [--estimate]
 *
 *   --ai        add the Claude layer (needs ANTHROPIC_API_KEY in web/.env.local)
 *   --estimate  only print the token and cost estimate for the Claude layer (no proofreading, no charge)
 *
 * Output: <out>/<original name> with Karina's tracked changes (default out: ../training/output/bot),
 * plus <name>.changes.json listing every change (used by training/eval.py).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Effort } from "../src/lib/ai/claude";
import { usd } from "../src/lib/ai/cost";
import { DEFAULT_MODEL, estimateAiCost, proofreadDocx, type AiOptions } from "../src/lib/pipeline";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const valued = new Set(["--out", "--model", "--effort"]);
  const inputs = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
  if (!inputs.length) {
    console.error("usage: npm run proofread -- <file.docx | folder> [--out <folder>] [--ai] [--estimate] [--json]");
    process.exit(1);
  }
  const useAi = flag("--ai") || flag("--estimate");
  if (useAi && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to web/.env.local (see web/.env.example).");
    process.exit(1);
  }
  const ai: AiOptions | false = useAi ? { model: value("--model") ?? DEFAULT_MODEL, effort: (value("--effort") ?? "high") as Effort } : false;
  const outDir = path.resolve(value("--out") ?? path.join(process.cwd(), "..", "training", "output", "bot"));
  await mkdir(outDir, { recursive: true });

  const files: string[] = [];
  for (const input of inputs) {
    const p = path.resolve(input);
    if ((await stat(p)).isDirectory()) {
      for (const f of await readdir(p)) if (f.toLowerCase().endsWith(".docx") && !f.startsWith("~$")) files.push(path.join(p, f));
    } else files.push(p);
  }

  const summaries = [];
  let totalCost = 0;
  for (const file of files) {
    const name = path.basename(file);
    const data = await readFile(file);
    const opts = { fileName: name, grammar: !flag("--no-grammar"), ai };

    if (ai) {
      const est = await estimateAiCost(data, opts);
      console.log(`\n${name}: Claude estimate ~${est.inputTokens.toLocaleString()} input tokens (${est.cachedTokens.toLocaleString()} cacheable), ` +
        `${est.outputTokensLow.toLocaleString()}-${est.outputTokensHigh.toLocaleString()} output tokens -> ${usd(est.usdLow)}-${usd(est.usdHigh)}`);
      if (flag("--estimate")) continue;
    }

    const result = await proofreadDocx(data, opts);
    await writeFile(path.join(outDir, name), result.output);
    await writeFile(path.join(outDir, name.replace(/\.docx$/i, ".changes.json")), JSON.stringify(result.changes, null, 1));
    const byRule: Record<string, number> = {};
    for (const c of result.changes) byRule[c.rule] = (byRule[c.rule] ?? 0) + 1;
    if (result.ai) totalCost += result.ai.costUsd;
    summaries.push({ file: name, docType: result.docType, formatting: result.formatting, changes: result.changes.length, byRule, ai: result.ai });
    if (!flag("--json")) {
      console.log(`\n${name}  [${result.docType}]`);
      console.log(`  formatting: ${result.formatting.deviated ? `normalized (${result.formatting.runs} runs, ${result.formatting.paragraphs} paragraphs)` : "already standard"}`);
      for (const c of result.changes) {
        const before = c.before ? `"${c.before.length > 60 ? c.before.slice(0, 60) + "…" : c.before}" -> ` : "";
        const flagText = c.beyondStyle ? " [beyond usual style]" : "";
        console.log(`  [${c.rule}]${flagText} ${before}"${c.after.length > 110 ? c.after.slice(0, 110) + "…" : c.after}"`);
      }
      if (result.ai) {
        const u = result.ai.usage;
        console.log(`  Claude (${result.ai.model}): ${u.input_tokens} in + ${u.cache_read_input_tokens ?? 0} cache-read + ${u.cache_creation_input_tokens ?? 0} cache-write, ${u.output_tokens} out -> ${usd(result.ai.costUsd)}`);
        for (const d of result.ai.dropped) console.log(`  (dropped: ${d.what} - ${d.why})`);
      }
    }
  }
  if (flag("--json")) console.log(JSON.stringify(summaries, null, 1));
  else if (!flag("--estimate")) console.log(`\n${files.length} file(s) written to ${outDir}${ai ? `; Claude cost ${usd(totalCost)}` : ""}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
