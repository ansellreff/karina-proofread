import { KARINA } from "@/lib/identity";
import { proofreadDocx } from "@/lib/pipeline";
import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Proofread the student's original (version 0) and save the result as a new version.
 * Body: { ai: boolean }. Streams NDJSON progress lines: {stage} ... then {done, job} or {error}.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = getStore();
  const id = (await ctx.params).id;
  const job = await store.get(id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  const { ai } = (await request.json().catch(() => ({}))) as { ai?: boolean };
  const settings = await store.getSettings();
  if (ai && !process.env.ANTHROPIC_API_KEY) return Response.json({ error: "No Anthropic API key is set (web/.env.local)." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        job.status = "proofreading";
        await store.save(job);
        const result = await proofreadDocx(await store.readVersion(id, 0), {
          fileName: job.fileName,
          identity: { ...KARINA, author: settings.authorName },
          ai: ai ? { model: settings.model, effort: settings.effort } : false,
          onStage: (stage) => send({ stage }),
        });
        const updated = await store.addVersion(id, result.output, {
          label: ai ? "Bot proofread (rules + AI)" : "Bot proofread (rules only)",
          kind: "bot",
        });
        updated.status = "ready";
        updated.docType = result.docType;
        updated.proofread = {
          at: new Date().toISOString(),
          version: updated.current,
          ai: !!ai,
          model: result.ai?.model,
          englishQuality: result.ai?.englishQuality,
          costUsd: result.ai?.costUsd,
          usage: result.ai?.usage as unknown as Record<string, number>,
          changes: result.changes,
          formatting: result.formatting,
          dropped: result.ai?.dropped,
        };
        await store.save(updated);
        if (result.ai) {
          await store.logUsage({ at: updated.proofread.at, jobId: id, model: result.ai.model, costUsd: result.ai.costUsd, usage: result.ai.usage });
        }
        send({ done: true, job: updated });
      } catch (e) {
        job.status = job.versions.length > 1 ? "ready" : "new";
        await store.save(job);
        send({ error: e instanceof Error ? e.message : "Proofreading failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
