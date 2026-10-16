import { systemPrompt } from "@/lib/ai/prompt";
import { recheckPassage } from "@/lib/pipeline";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Re-check a passage Karina selected. Body: { text }. Returns find/replace edits for the editor to apply as tracked changes. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await stores();
  const store = st.jobs;
  const id = (await ctx.params).id;
  const job = await store.get(id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Re-checking needs the AI, and no Anthropic API key is set (ANTHROPIC_API_KEY)." }, { status: 400 });
  const { text } = (await request.json()) as { text?: string };
  const passage = (text ?? "").trim();
  if (passage.split(/\s+/).length < 3) return Response.json({ error: "Select at least a sentence to re-check." }, { status: 400 });
  if (passage.length > 6000) return Response.json({ error: "Select a shorter passage (a few paragraphs at most)." }, { status: 400 });
  const settings = await store.getSettings();
  try {
    const res = await recheckPassage(passage, job.docType, { model: settings.model, effort: settings.effort, system: await systemPrompt(st) });
    await store.logUsage({ at: new Date().toISOString(), jobId: id, model: res.model, costUsd: res.costUsd, usage: res.usage });
    return Response.json({ edits: res.edits, costUsd: res.costUsd });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Re-check failed." }, { status: 502 });
  }
}
