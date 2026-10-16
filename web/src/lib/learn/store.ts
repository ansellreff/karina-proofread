/**
 * Learning data (student text: a local folder or Karina's OneDrive, never committed).
 *   records/<id>.json  one per learned document
 *   state.json         dismissed proposals and the approved AI examples
 */
import { readJson, writeJson, type AppFiles } from "../storage/files";
import type { LearnState } from "./proposals";
import type { LearnedRecord } from "./record";

const EMPTY: LearnState = { dismissed: [], examples: [] };
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export class LearnStore {
  constructor(private files: AppFiles) {}

  private recordPath(id: string): string {
    if (!SAFE_ID.test(id)) throw new Error("Invalid record id");
    return `records/${id}.json`;
  }

  async list(): Promise<LearnedRecord[]> {
    const names = (await this.files.list("records")).filter((f) => !f.folder && f.name.endsWith(".json")).map((f) => f.name);
    // a half-written file is skipped
    const recs = await Promise.all(names.map((n) => readJson<LearnedRecord>(this.files, `records/${n}`)));
    return recs.filter((r): r is LearnedRecord => !!r).sort((a, b) => b.learnedAt.localeCompare(a.learnedAt));
  }

  async save(rec: LearnedRecord): Promise<void> {
    await writeJson(this.files, this.recordPath(rec.id), rec);
  }

  /** Forget one learned document. Returns false when it didn't exist. */
  async remove(id: string): Promise<boolean> {
    return this.files.remove(this.recordPath(id));
  }

  async state(): Promise<LearnState> {
    return { ...EMPTY, ...((await readJson<Partial<LearnState>>(this.files, "state.json")) ?? {}) };
  }

  async saveState(s: LearnState): Promise<void> {
    await writeJson(this.files, "state.json", s);
  }
}
