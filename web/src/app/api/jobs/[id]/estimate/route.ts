import { systemPrompt } from "@/lib/ai/prompt";
import { estimateAiCost } from "@/lib/pipeline";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Token and cost estimate for the Claude layer (free token-counting call). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await stores();
  const store = st.jobs;
  const job = await store.get((await ctx.params).id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "No Anthropic API key is set (ANTHROPIC_API_KEY)." }, { status: 400 });
  const settings = await store.getSettings();
  try {
    const [original, rules, system] = await Promise.all([store.readVersion(job.id, 0), st.config.loadRules(), systemPrompt(st)]);
    const est = await estimateAiCost(original, { fileName: job.fileName, rules, ai: { model: settings.model, effort: settings.effort, system } });
    const spent = await store.spendSince(settings.balanceSetAt);
    const remaining = settings.balanceUsd === null ? null : settings.balanceUsd - spent;
    return Response.json({ ...est, remainingUsd: remaining });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Estimate failed." }, { status: 502 });
  }
}
