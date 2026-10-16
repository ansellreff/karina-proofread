/**
 * Karina's review rules and AI rulebook. Locally they are the files in web/prompts (edited in place, as before);
 * online they live in her OneDrive (App data/settings) and the bundled web/prompts files are the defaults.
 * Server/CLI only.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { readText, type AppFiles } from "../storage/files";
import { FsFiles } from "../storage/fs-files";
import { validateRules, withDefaults, type RuleConfig } from "./config";

const RULES = "karina-rules.json";
const GUIDE = "karina-style-guide.md";
const EXAMPLES = "karina-examples.md";

/** web/prompts (read-only on Vercel, where it is bundled with the app). */
export function promptsDir(): string {
  const candidates = [path.join(process.cwd(), "prompts"), path.join(process.cwd(), "web", "prompts")];
  return candidates.find((d) => existsSync(path.join(d, GUIDE))) ?? candidates[0];
}

export class ConfigStore {
  /**
   * @param files    where Karina's own copies are saved
   * @param defaults the bundled files, used for anything not saved yet
   */
  constructor(
    private files: AppFiles,
    private defaults: AppFiles = new FsFiles(promptsDir()),
  ) {}

  private async text(name: string): Promise<string | null> {
    return (await readText(this.files, name)) ?? (await readText(this.defaults, name));
  }

  /** The rules every proofread uses (read each time, so a save applies to the next run on every server). */
  async loadRules(): Promise<RuleConfig> {
    const text = await this.text(RULES);
    return withDefaults(text ? (JSON.parse(text) as Partial<RuleConfig>) : null);
  }

  /** Validate, keep the previous file as a backup, and save. Returns the problems when it can't save. */
  async saveRules(input: Partial<RuleConfig>): Promise<{ ok: true; rules: RuleConfig } | { ok: false; errors: string[] }> {
    const rules = withDefaults(input);
    const errors = validateRules(rules);
    if (errors.length) return { ok: false, errors };
    const before = await readText(this.files, RULES);
    if (before !== null) await this.files.write(RULES.replace(/\.json$/, ".backup.json"), before);
    await this.files.write(RULES, JSON.stringify(rules, null, 2) + "\n");
    return { ok: true, rules };
  }

  /** Karina's style rulebook (what the AI follows). */
  async styleGuide(): Promise<string> {
    const text = await this.text(GUIDE);
    if (text === null) throw new Error(`${GUIDE} not found`);
    return text;
  }

  async saveStyleGuide(markdown: string): Promise<void> {
    const before = await readText(this.files, GUIDE);
    if (before !== null) await this.files.write(GUIDE.replace(/\.md$/, ".backup.md"), before);
    await this.files.write(GUIDE, markdown.replace(/\r\n/g, "\n"));
  }

  /** Anonymised examples of her edits (bundled, not edited in the app). */
  async examples(): Promise<string> {
    return (await readText(this.defaults, EXAMPLES)) ?? "";
  }
}
