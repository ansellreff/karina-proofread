/**
 * Proofread .docx files in Karina's style from the command line.
 *
 *   npm run proofread -- <file.docx | folder> [--out <folder>] [--no-grammar] [--json]
 *
 * Output: <out>/<original name> with Karina's tracked changes (default out: ../training/output/bot).
 */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { proofreadDocx } from "../src/lib/pipeline";

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const inputs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
  if (!inputs.length) {
    console.error("usage: npm run proofread -- <file.docx | folder> [--out <folder>] [--grammar] [--json]");
    process.exit(1);
  }
  const outDir = path.resolve(value("--out") ?? path.join(__dirname, "..", "..", "training", "output", "bot"));
  await mkdir(outDir, { recursive: true });

  const files: string[] = [];
  for (const input of inputs) {
    const p = path.resolve(input);
    if ((await stat(p)).isDirectory()) {
      for (const f of await readdir(p)) if (f.toLowerCase().endsWith(".docx") && !f.startsWith("~$")) files.push(path.join(p, f));
    } else files.push(p);
  }

  const summaries = [];
  for (const file of files) {
    const name = path.basename(file);
    const result = await proofreadDocx(await readFile(file), { fileName: name, grammar: !flag("--no-grammar") });
    await writeFile(path.join(outDir, name), result.output);
    await writeFile(path.join(outDir, name.replace(/\.docx$/i, ".changes.json")), JSON.stringify(result.changes, null, 1));
    const byRule: Record<string, number> = {};
    for (const c of result.changes) byRule[c.rule] = (byRule[c.rule] ?? 0) + 1;
    summaries.push({ file: name, docType: result.docType, formatting: result.formatting, changes: result.changes.length, byRule });
    if (!flag("--json")) {
      console.log(`\n${name}  [${result.docType}]`);
      console.log(`  formatting: ${result.formatting.deviated ? `normalized (${result.formatting.runs} runs, ${result.formatting.paragraphs} paragraphs)` : "already standard"}`);
      for (const c of result.changes) {
        const before = c.before ? `"${c.before}" -> ` : "";
        console.log(`  [${c.rule}] ${before}"${c.after.length > 110 ? c.after.slice(0, 110) + "…" : c.after}"`);
      }
    }
  }
  if (flag("--json")) console.log(JSON.stringify(summaries, null, 1));
  else console.log(`\n${files.length} file(s) written to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
