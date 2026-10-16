import { getLearnStore } from "@/lib/learn/store";

export const runtime = "nodejs";

/** Forget one learned document (its proposals and numbers go with it). The document itself is not touched. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ record: string }> }) {
  const id = (await ctx.params).record;
  try {
    const removed = await getLearnStore().remove(id);
    return removed ? Response.json({ removed: id }) : Response.json({ error: "Not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
}
