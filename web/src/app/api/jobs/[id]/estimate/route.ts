import { estimateAiCost } from "@/lib/pipeline";
import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";

/** Token and cost estimate for the Claude layer (free token-counting call). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = getStore();
  const job = await store.get((await ctx.params).id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "No Anthropic API key is set (web/.env.local)." }, { status: 400 });
  const settings = await store.getSettings();
  try {
    const est = await estimateAiCost(await store.readVersion(job.id, 0), {
      fileName: job.fileName,
      ai: { model: settings.model, effort: settings.effort },
    });
    const spent = await store.spendSince(settings.balanceSetAt);
    const remaining = settings.balanceUsd === null ? null : settings.balanceUsd - spent;
    return Response.json({ ...est, remainingUsd: remaining });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Estimate failed." }, { status: 502 });
  }
}
