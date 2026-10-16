/**
 * Learn from reviews Karina did in Word (her tracked changes), like the "From your reviews" tab does.
 *
 *   npx tsx scripts/learn.ts <file.docx | folder> [--store <dir>] [--rules <file.json>] [--show] [--apply <out.json>]
 *
 *   --store  where learned records go (default: the app's web/.data/learning)
 *   --rules  rules to compare with (default: the saved ones, web/prompts/karina-rules.json)
 *   --show   print the before/after samples of each proposal (anonymised)
 *   --apply  write a copy of the rules with every rule proposal approved (for the accuracy test; never the saved file)
 *
 * The 6 test documents (training/holdout.txt) are always skipped.
 */
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { LearnError, learnSummary, recordFromReview } from "../src/lib/learn/learn";
import { redline, type Proposal } from "../src/lib/learn/proposals";
import { LearnStore } from "../src/lib/learn/store";
import { DOC_TYPES, withDefaults, type RuleConfig } from "../src/lib/rules/config";
import { switchOff } from "../src/lib/rules/names";
import { FsFiles } from "../src/lib/storage/fs-files";
import { localStores } from "../src/lib/storage/local";

const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))}%`;

function describe(p: Proposal): string {
  if (p.type === "replace") return `NEW RULE   ${p.rule.label.replace("Learned: ", "")} [${p.rule.docTypes.join(", ") || "all"}]: ${p.times}× in ${p.docs} docs, right ${p.right}/${p.matches} (${pct(p.right, p.matches)})`;
  if (p.type === "end-note") return `END NOTE   ${p.rule.docTypes[0]}: “${p.rule.text}” in ${p.docs}/${p.ofDocs} docs`;
  if (p.type === "switch-off") return `SWITCH OFF ${p.label}${p.docType ? ` for ${p.docType}` : ""}: kept ${p.kept}, changed ${p.changed}, undone ${p.rejected} of ${p.n}`;
  return `AI EXAMPLE ${p.example.docType} (${p.example.kind}): ${p.example.text}`;
}

export function applyAll(rules: RuleConfig, proposals: Proposal[]): RuleConfig {
  let next = structuredClone(rules);
  for (const p of proposals) {
    if (p.type === "replace" || p.type === "end-note") next.custom.push(p.rule);
    else if (p.type === "switch-off") next = switchOff(next, p.ruleId, p.docType, DOC_TYPES);
  }
  return next;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const valued = new Set(["--store", "--rules", "--apply"]);
  const inputs = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
  if (!inputs.length) {
    console.error("usage: npx tsx scripts/learn.ts <file.docx | folder> [--store <dir>] [--rules <file.json>] [--show] [--apply <out.json>]");
    process.exit(1);
  }
  const rulesFile = value("--rules");
  const local = localStores();
  const rules = rulesFile ? withDefaults(JSON.parse(await readFile(rulesFile, "utf8"))) : await local.config.loadRules();
  const store = value("--store") ? new LearnStore(new FsFiles(path.resolve(value("--store")!))) : local.learn;

  const files: string[] = [];
  for (const input of inputs) {
    const p = path.resolve(input);
    if ((await stat(p)).isDirectory()) {
      for (const f of await readdir(p)) if (f.toLowerCase().endsWith(".docx") && !f.startsWith("~$")) files.push(path.join(p, f));
    } else files.push(p);
  }
  let learned = 0;
  for (const file of files) {
    try {
      const rec = await recordFromReview(path.basename(file), await readFile(file), undefined, rules);
      await store.save(rec);
      learned++;
      console.log(`learned  [${rec.docType}] ${rec.edits.length} edits, ${rec.outcomes.length} bot suggestions`);
    } catch (e) {
      console.log(`skipped  ${e instanceof LearnError ? e.message : e instanceof Error ? e.message : e}`);
    }
  }

  const { stats, proposals } = await learnSummary(store, rules);
  const s = stats.suggestions;
  console.log(`\n${learned} learned now, ${stats.documents} in the store. Bot suggestions: ${s.n} (kept ${pct(s.kept, s.n)}, changed ${pct(s.changed, s.n)}, undone ${pct(s.rejected, s.n)}); her own edits: ${stats.ownEdits}`);
  console.log(`\n${"rule".padEnd(34)} ${"n".padStart(4)} ${"kept".padStart(5)} ${"chg".padStart(4)} ${"undone".padStart(6)}`);
  for (const r of stats.rules) console.log(`${r.label.slice(0, 34).padEnd(34)} ${String(r.n).padStart(4)} ${String(r.kept).padStart(5)} ${String(r.changed).padStart(4)} ${String(r.rejected).padStart(6)}`);
  console.log(`\n${proposals.length} proposals:`);
  for (const p of proposals) {
    console.log(`- ${describe(p)}`);
    if (args.includes("--show") && p.type !== "example") for (const x of p.samples) console.log(`      ${redline(x)}`);
  }
  const out = value("--apply");
  if (out) {
    await writeFile(out, JSON.stringify(applyAll(rules, proposals), null, 1));
    console.log(`\nRules with every rule proposal approved: ${out}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
