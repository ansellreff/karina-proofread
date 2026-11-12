import { stores } from "@/lib/storage/stores";
import { applyPriorityOrder, isOpen } from "@/lib/store/priority";

export const runtime = "nodejs";

/**
 * Saves Karina's Priority list: `order` is the starred documents' ids, first = 1. Open documents not in it lose
 * their star. Not an edit of the document, so "Updated" stays as it was.
 */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { order?: unknown } | null;
  const order = body?.order;
  if (!Array.isArray(order) || order.length > 500 || !order.every((id) => typeof id === "string")) return Response.json({ error: "Expected { order: string[] }." }, { status: 400 });
  const store = (await stores()).jobs;
  const now = Date.now();
  const jobs = await store.list();
  const open = new Set(jobs.filter((j) => isOpen(j, now)).map((j) => j.id));
  const changes = applyPriorityOrder(jobs, [...new Set(order as string[])].filter((id) => open.has(id)), now);
  // one at a time: each save also rewrites the documents index
  for (const { job, priority } of changes) {
    const full = await store.get(job.id);
    if (!full) continue;
    if (priority === undefined) delete full.priority;
    else full.priority = priority;
    await store.save(full);
  }
  return Response.json({ changed: changes.length });
}
