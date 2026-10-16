/** Reads and saves Karina's review rules (web/prompts/karina-rules.json). Server/CLI only. */
import { existsSync } from "node:fs";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateRules, withDefaults, type RuleConfig } from "./config";

function rulesFile(): string {
  const candidates = [path.join(process.cwd(), "prompts"), path.join(process.cwd(), "web", "prompts")];
  const dir = candidates.find((d) => existsSync(d)) ?? candidates[0];
  return path.join(dir, "karina-rules.json");
}

let cache: { mtime: number; rules: RuleConfig } | null = null;

/** The rules every proofread uses. Re-read whenever the file changes, so a save applies to the next run. */
export async function loadRules(): Promise<RuleConfig> {
  const file = rulesFile();
  let mtime = -1;
  try {
    mtime = (await stat(file)).mtimeMs;
  } catch {
    return withDefaults(null);
  }
  if (cache?.mtime === mtime) return structuredClone(cache.rules);
  const rules = withDefaults(JSON.parse(await readFile(file, "utf8")) as Partial<RuleConfig>);
  cache = { mtime, rules };
  return structuredClone(rules);
}

/** Validate, keep the previous file as a backup, and save. Returns the problems when it can't save. */
export async function saveRules(input: Partial<RuleConfig>): Promise<{ ok: true; rules: RuleConfig } | { ok: false; errors: string[] }> {
  const rules = withDefaults(input);
  const errors = validateRules(rules);
  if (errors.length) return { ok: false, errors };
  const file = rulesFile();
  if (existsSync(file)) await copyFile(file, file.replace(/\.json$/, ".backup.json"));
  await writeFile(file, JSON.stringify(rules, null, 2) + "\n");
  cache = null;
  return { ok: true, rules };
}
