/**
 * Learning data, kept next to the jobs in web/.data/learning/ (gitignored: it holds student text).
 *   records/<id>.json  one per learned document
 *   state.json         dismissed proposals and the approved AI examples
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LearnState } from "./proposals";
import type { LearnedRecord } from "./record";

const EMPTY: LearnState = { dismissed: [], examples: [] };
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export class LearnStore {
  constructor(private root = path.join(process.cwd(), ".data", "learning")) {}

  private recordPath(id: string): string {
    if (!SAFE_ID.test(id)) throw new Error("Invalid record id");
    return path.join(this.root, "records", `${id}.json`);
  }

  async list(): Promise<LearnedRecord[]> {
    const dir = path.join(this.root, "records");
    let names: string[] = [];
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
    } catch {
      return [];
    }
    const out: LearnedRecord[] = [];
    for (const n of names) {
      try {
        out.push(JSON.parse(await readFile(path.join(dir, n), "utf8")));
      } catch {
        // a half-written file: skip it
      }
    }
    return out.sort((a, b) => b.learnedAt.localeCompare(a.learnedAt));
  }

  async save(rec: LearnedRecord): Promise<void> {
    await mkdir(path.join(this.root, "records"), { recursive: true });
    await writeFile(this.recordPath(rec.id), JSON.stringify(rec));
  }

  /** Forget one learned document. Returns false when it didn't exist. */
  async remove(id: string): Promise<boolean> {
    const p = this.recordPath(id);
    if (!existsSync(p)) return false;
    await rm(p);
    return true;
  }

  async state(): Promise<LearnState> {
    try {
      return { ...EMPTY, ...JSON.parse(await readFile(path.join(this.root, "state.json"), "utf8")) };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  async saveState(s: LearnState): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, "state.json"), JSON.stringify(s, null, 1));
  }

  /** The approved AI examples, read synchronously for the (cached) system prompt. */
  examplesSync(): LearnState["examples"] {
    try {
      return (JSON.parse(readFileSync(path.join(this.root, "state.json"), "utf8")) as LearnState).examples ?? [];
    } catch {
      return [];
    }
  }
}

let store: LearnStore | null = null;
export function getLearnStore(): LearnStore {
  // KP_LEARN_DIR: another learning folder (accuracy tests with or without AI examples; never set in the app)
  store ??= new LearnStore(process.env.KP_LEARN_DIR || undefined);
  return store;
}
