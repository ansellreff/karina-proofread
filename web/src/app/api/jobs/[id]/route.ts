import { learnFromJob } from "@/lib/learn/learn";
import { stores } from "@/lib/storage/stores";
import type { Job } from "@/lib/store/types";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const job = await (await stores()).jobs.get((await ctx.params).id);
  return job ? Response.json(job) : Response.json({ error: "Document not found." }, { status: 404 });
}

const STATUSES: Job["status"][] = ["new", "proofreading", "ready", "done"];

/** Update status or student name (the name is used in the DONE_ file names). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await stores();
  const store = st.jobs;
  const job = await store.get((await ctx.params).id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  const body = (await request.json()) as Partial<Pick<Job, "status" | "studentName">>;
  if (body.status) {
    if (!STATUSES.includes(body.status)) return Response.json({ error: "Unknown status." }, { status: 400 });
    job.status = body.status;
  }
  if (body.studentName !== undefined) job.studentName = body.studentName?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
  job.updatedAt = new Date().toISOString();
  await store.save(job);
  // A finished document teaches the bot (Review rules → From your reviews). Never blocks marking it done.
  let learned: Awaited<ReturnType<typeof learnFromJob>> = null;
  if (body.status === "done") {
    try {
      learned = await learnFromJob(job, store, st.learn, await st.config.loadRules());
    } catch (e) {
      console.error("learning from a finished document failed", e);
    }
  }
  return Response.json(learned ? { ...job, learned } : job);
}

/** Moves the document to the trash (it can be restored from "Recently deleted"). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const trashed = await (await stores()).jobs.remove((await ctx.params).id);
  return Response.json({ trashed });
}
