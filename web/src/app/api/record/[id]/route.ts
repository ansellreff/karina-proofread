import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/** Remove from record (a document added only to try something out; also the test clean-up). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/record/[id]">) {
  const removed = await (await stores()).record.remove((await ctx.params).id);
  return removed ? Response.json({ ok: true }) : Response.json({ error: "Not on the record." }, { status: 404 });
}
