import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/** Forget one learned document (its proposals and numbers go with it). The document itself is not touched. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ record: string }> }) {
  const learn = (await stores()).learn; // outside try: a sign-in redirect must not be caught
  const id = (await ctx.params).record;
  try {
    const removed = await learn.remove(id);
    return removed ? Response.json({ removed: id }) : Response.json({ error: "Not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
}
