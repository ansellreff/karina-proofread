import type { Job } from "./types";

/** Days after Mark as done before a document moves to Archived on the Documents page. */
export const ARCHIVE_DAYS = 14;
const DAY = 86_400_000;

type ArchiveFields = Pick<Job, "status" | "doneAt" | "updatedAt" | "archivedAt">;

/**
 * When the document was marked as done (null when it isn't done). Documents finished before `doneAt` existed use
 * the Proofread record's finished time, then the last update.
 */
export function doneSince(job: Omit<ArchiveFields, "archivedAt">, finishedAt?: string): string | null {
  if (job.status !== "done") return null;
  return job.doneAt ?? finishedAt ?? job.updatedAt;
}

/**
 * In Archived: added there by hand ("Add to Archive", any status), or marked as done ARCHIVE_DAYS ago. Nothing else
 * is ever archived by itself: new and ongoing reviews stay where they are.
 */
export function isArchived(job: ArchiveFields, now: number): boolean {
  if (job.archivedAt) return true;
  const since = doneSince(job);
  return since !== null && now - Date.parse(since) >= ARCHIVE_DAYS * DAY;
}

/** When it went to Archived (by hand, or ARCHIVE_DAYS after Mark as done); null when it isn't archived. */
export function archivedSince(job: ArchiveFields, now: number): string | null {
  if (!isArchived(job, now)) return null;
  if (job.archivedAt) return job.archivedAt;
  return new Date(Date.parse(doneSince(job)!) + ARCHIVE_DAYS * DAY).toISOString();
}

/** "moves to Archived in 3 days" / "tomorrow" / "today" (for a done document that isn't archived yet). */
export function archivesIn(job: ArchiveFields, now: number): string | null {
  const since = doneSince(job);
  if (since === null || isArchived(job, now)) return null;
  const days = Math.ceil((Date.parse(since) + ARCHIVE_DAYS * DAY - now) / DAY);
  return days <= 0 ? "moves to Archived today" : days === 1 ? "moves to Archived tomorrow" : `moves to Archived in ${days} days`;
}
