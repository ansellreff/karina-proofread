/**
 * The Proofread record: one small entry per document Karina has worked on, kept for good (deleting the document,
 * Recently deleted, the 7-day cleanup and "Delete all documents" never touch it). Lives in proofread-record/<id>.json.
 *
 * A document is counted ONCE, when it is first proofread: by the bot (with AI, or without) or by hand
 * (she chose "Proofread it myself" and saved her first edits). Mark as done sets `finishedAt` (and counts a document
 * not counted yet as manual); reopening clears it. Entries keep the first name only, never the full name or text.
 */
import { readJson, writeJson, type AppFiles } from "../storage/files";
import type { Job } from "../store/types";
import { levelOf } from "./levels";

export type RecordMethod = "ai" | "rules" | "manual";

export interface RecordEntry {
  /** The document's id (the document itself may be deleted since). */
  id: string;
  firstName: string | null;
  docType: string;
  method: RecordMethod;
  countedAt: string;
  finishedAt?: string;
}

export interface RecordSummary {
  worked: number;
  finished: number;
  /** Different students (by first name) among finished documents. */
  students: number;
  byMethod: Record<RecordMethod, number>;
  byType: { docType: string; worked: number; finished: number }[];
  /** The last 12 months, oldest first ("2026-10"). */
  byMonth: { month: string; worked: number; finished: number }[];
  level: ReturnType<typeof levelOf>;
}

const ID = /^[a-f0-9-]{36}$/;
const firstNameOf = (job: Pick<Job, "studentName">) => job.studentName?.trim().split(/\s+/)[0]?.slice(0, 40) || null;

export class RecordStore {
  constructor(readonly files: AppFiles) {}

  private path(id: string) {
    if (!ID.test(id)) throw new Error("invalid document id");
    return `${id}.json`;
  }

  async get(id: string): Promise<RecordEntry | null> {
    return ID.test(id) ? readJson<RecordEntry>(this.files, this.path(id)) : null;
  }

  async list(): Promise<RecordEntry[]> {
    const names = (await this.files.list("")).filter((f) => !f.folder && f.name.endsWith(".json")).map((f) => f.name.slice(0, -5));
    const entries = await Promise.all(names.filter((n) => ID.test(n)).map((n) => readJson<RecordEntry>(this.files, `${n}.json`)));
    return entries.filter((e): e is RecordEntry => !!e).sort((a, b) => b.countedAt.localeCompare(a.countedAt));
  }

  /**
   * Count a document when it is first proofread. Returns its number on the record (#n) when this call counted it,
   * null when it was counted before.
   */
  async count(job: Job, method: RecordMethod, now = new Date()): Promise<number | null> {
    if (await this.get(job.id)) return null;
    const entry: RecordEntry = { id: job.id, firstName: firstNameOf(job), docType: job.docType, method, countedAt: now.toISOString() };
    await writeJson(this.files, this.path(job.id), entry);
    return (await this.list()).length;
  }

  /** Mark as done: the finished tick (a document not counted yet is counted now, as manual). Returns #n when newly counted. */
  async markDone(job: Job, now = new Date()): Promise<number | null> {
    const counted = await this.count(job, "manual", now);
    const entry = (await this.get(job.id))!;
    const fresh = { ...entry, firstName: firstNameOf(job) ?? entry.firstName, docType: job.docType || entry.docType };
    if (!entry.finishedAt) await writeJson(this.files, this.path(job.id), { ...fresh, finishedAt: now.toISOString() });
    return counted;
  }

  /** Reopened: not finished any more (still counted as worked on). */
  async unfinish(id: string): Promise<void> {
    const entry = await this.get(id);
    if (entry?.finishedAt) {
      delete entry.finishedAt;
      await writeJson(this.files, this.path(id), entry);
    }
  }

  /** Remove from record (a document added only to try something out). */
  async remove(id: string): Promise<boolean> {
    return ID.test(id) ? this.files.remove(this.path(id)) : false;
  }

  /**
   * The safety net: an UNFINISHED document that is no longer in the app (deleted forever, or never restored from
   * Recently deleted) leaves the record, so Worked on only counts work that can still be finished. Finished entries
   * stay for good. `active`: documents in the app; `inTrash`: documents in Recently deleted (they come back if
   * restored, so their entries are kept but not counted). Returns how many entries were removed.
   */
  async prune(active: Set<string>, inTrash: Set<string>): Promise<number> {
    let n = 0;
    for (const e of await this.list()) {
      if (!e.finishedAt && !active.has(e.id) && !inTrash.has(e.id) && (await this.remove(e.id))) n++;
    }
    return n;
  }

  /** The summary; with `active`, unfinished documents not in the app (in Recently deleted) are not counted. */
  async summary(now = new Date(), active?: Set<string>): Promise<RecordSummary> {
    return summarize(await this.list(), now, active);
  }
}

/** Whether an entry counts: finished ones always; unfinished ones only while their document is in the app. */
export const counts = (e: RecordEntry, active?: Set<string>) => !!e.finishedAt || !active || active.has(e.id);

export function summarize(all: RecordEntry[], now = new Date(), active?: Set<string>): RecordSummary {
  const entries = all.filter((e) => counts(e, active));
  const finished = entries.filter((e) => e.finishedAt);
  const byMethod: Record<RecordMethod, number> = { ai: 0, rules: 0, manual: 0 };
  for (const e of entries) byMethod[e.method]++;
  const types = new Map<string, { worked: number; finished: number }>();
  for (const e of entries) {
    const t = types.get(e.docType) ?? { worked: 0, finished: 0 };
    t.worked++;
    if (e.finishedAt) t.finished++;
    types.set(e.docType, t);
  }
  const months: RecordSummary["byMonth"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      month,
      worked: entries.filter((e) => e.countedAt.slice(0, 7) === month).length,
      finished: finished.filter((e) => e.finishedAt!.slice(0, 7) === month).length,
    });
  }
  return {
    worked: entries.length,
    finished: finished.length,
    students: new Set(finished.map((e) => e.firstName?.toLowerCase()).filter(Boolean)).size,
    byMethod,
    byType: [...types].map(([docType, t]) => ({ docType, ...t })).sort((a, b) => b.worked - a.worked),
    byMonth: months,
    level: levelOf(finished.length),
  };
}
