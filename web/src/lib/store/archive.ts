import type { Job } from "./types";

/** Days after Mark as done before a document moves to Archived on the Documents page. */
export const ARCHIVE_DAYS = 14;
const DAY = 86_400_000;

/**
 * When the document was marked as done (null when it isn't done). Documents finished before `doneAt` existed use
 * the Proofread record's finished time, then the last update.
 */
export function doneSince(job: Pick<Job, "status" | "doneAt" | "updatedAt">, finishedAt?: string): string | null {
  if (job.status !== "done") return null;
  return job.doneAt ?? finishedAt ?? job.updatedAt;
}

/** Only a document marked as done is ever archived: new and ongoing reviews never are. */
export function isArchived(job: Pick<Job, "status" | "doneAt" | "updatedAt">, now: number): boolean {
  const since = doneSince(job);
  return since !== null && now - Date.parse(since) >= ARCHIVE_DAYS * DAY;
}

/** "moves to Archived in 3 days" / "tomorrow" / "today" (for a done document that isn't archived yet). */
export function archivesIn(job: Pick<Job, "status" | "doneAt" | "updatedAt">, now: number): string | null {
  const since = doneSince(job);
  if (since === null || isArchived(job, now)) return null;
  const days = Math.ceil((Date.parse(since) + ARCHIVE_DAYS * DAY - now) / DAY);
  return days <= 0 ? "moves to Archived today" : days === 1 ? "moves to Archived tomorrow" : `moves to Archived in ${days} days`;
}
