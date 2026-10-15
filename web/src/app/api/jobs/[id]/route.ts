import { getStore } from "@/lib/store/fs-store";
import type { Job } from "@/lib/store/types";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const job = await getStore().get((await ctx.params).id);
  return job ? Response.json(job) : Response.json({ error: "Document not found." }, { status: 404 });
}

/** Update status or student name. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = getStore();
  const job = await store.get((await ctx.params).id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  const body = (await request.json()) as Partial<Pick<Job, "status" | "studentName">>;
  if (body.status) job.status = body.status;
  if (body.studentName !== undefined) job.studentName = body.studentName;
  job.updatedAt = new Date().toISOString();
  await store.save(job);
  return Response.json(job);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await getStore().remove((await ctx.params).id);
  return new Response(null, { status: 204 });
}
