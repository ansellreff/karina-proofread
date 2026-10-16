import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";

/** Erase one deleted document for good. Used by the test script to clean up its own test documents. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/trash/[entry]">) {
  try {
    await getStore().purge((await ctx.params).entry);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not erase." }, { status: 400 });
  }
}

/** Restore a deleted document. */
export async function POST(_req: Request, ctx: RouteContext<"/api/trash/[entry]">) {
  try {
    return Response.json(await getStore().restore((await ctx.params).entry));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not restore." }, { status: 400 });
  }
}
