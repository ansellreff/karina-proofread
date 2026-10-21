/**
 * The Proofread record as the page shows it: the safety net applied first (unfinished documents that are no longer
 * in the app leave the record), then what counts. Server only.
 */
import type { Stores } from "../storage/local";
import { summarize, type RecordEntry } from "./store";

/** Where an entry's document is: in the app, in Recently deleted (unfinished: not counted unless restored), or gone. */
export type DocState = "active" | "trash" | "deleted";
export type RecordRow = RecordEntry & { doc: DocState };

export async function recordState(s: Stores, now = new Date()) {
  const [jobs, trash] = await Promise.all([s.jobs.list(), s.jobs.listTrash(now.getTime())]); // listTrash also runs the 7-day cleanup
  const active = new Set(jobs.map((j) => j.id));
  const inTrash = new Set(trash.map((t) => t.job.id));
  await s.record.prune(active, inTrash);
  const entries = await s.record.list();
  const rows: RecordRow[] = entries.map((e) => ({ ...e, doc: active.has(e.id) ? "active" : inTrash.has(e.id) ? "trash" : "deleted" }));
  return { rows, summary: summarize(entries, now, active) };
}

/** The number a just-counted document has on the record (#n = Worked on now), for the toast. */
export async function countedNumber(s: Stores, counted: number | null): Promise<number | null> {
  if (!counted) return null;
  return (await recordState(s)).summary.worked;
}
