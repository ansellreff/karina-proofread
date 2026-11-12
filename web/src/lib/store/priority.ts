import { isArchived } from "./archive";
import type { Job } from "./types";

type QueueFields = Pick<Job, "id" | "status" | "createdAt" | "doneAt" | "updatedAt" | "archivedAt" | "priority">;

/** Still to finish: not marked as done and not in Archived. Only these are in the Priority list and the queue. */
export const isOpen = (j: QueueFields, now: number) => j.status !== "done" && !isArchived(j, now);

/** The Priority list in Karina's order (1 first): open documents she starred. */
export function priorityList<T extends QueueFields>(jobs: T[], now: number): T[] {
  return jobs.filter((j) => j.priority !== undefined && isOpen(j, now)).sort((a, b) => a.priority! - b.priority! || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Each starred document's place in the Priority list (1, 2, 3 …), with no gaps. */
export function priorityRanks(jobs: QueueFields[], now: number): Map<string, number> {
  return new Map(priorityList(jobs, now).map((j, i) => [j.id, i + 1]));
}

/** Queue number: the order the open documents were uploaded in (1 = waiting longest). */
export function queueNumbers(jobs: QueueFields[], now: number): Map<string, number> {
  const open = jobs.filter((j) => isOpen(j, now)).sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  return new Map(open.map((j, i) => [j.id, i + 1]));
}

/**
 * The priority each document gets for a new Priority list `order` (ids, first = 1). Documents left out lose their
 * star, except done or archived ones (not in the list, so not part of the new order: Reopen brings them back).
 * Returns only the documents that change.
 */
export function applyPriorityOrder<T extends QueueFields>(jobs: T[], order: string[], now: number): { job: T; priority: number | undefined }[] {
  const place = new Map(order.map((id, i) => [id, i + 1]));
  const out: { job: T; priority: number | undefined }[] = [];
  for (const job of jobs) {
    const next = place.get(job.id) ?? (isOpen(job, now) ? undefined : job.priority);
    if (next !== job.priority) out.push({ job, priority: next });
  }
  return out;
}
