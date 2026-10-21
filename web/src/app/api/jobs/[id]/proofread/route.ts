import { aiLockedResponse, aiUnlockedUntil } from "@/lib/ai/lock-request";
import { NO_KEY } from "@/lib/ai/messages";
import { systemPrompt } from "@/lib/ai/prompt";
import { KARINA } from "@/lib/identity";
import { proofreadDocx } from "@/lib/pipeline";
import { proofreadScores } from "@/lib/score/job-score";
import { countedNumber } from "@/lib/record/view";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Proofread the student's original (version 0) and save the result as a new version.
 * Body: { ai: boolean }. Streams NDJSON progress lines: {stage} ... then {done, job} or {error}.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await stores();
  const store = st.jobs;
  const id = (await ctx.params).id;
  const job = await store.get(id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  const { ai } = (await request.json().catch(() => ({}))) as { ai?: boolean };
  const settings = await store.getSettings();
  if (ai && !process.env.ANTHROPIC_API_KEY) return Response.json({ error: NO_KEY }, { status: 400 });
  if (ai && !(await aiUnlockedUntil())) return aiLockedResponse();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        job.status = "proofreading";
        job.updatedAt = new Date().toISOString();
        await store.save(job);
        const [original, rules, system] = await Promise.all([store.readVersion(id, 0), st.config.loadRules(), ai ? systemPrompt(st) : undefined]);
        const result = await proofreadDocx(original, {
          fileName: job.fileName,
          identity: { ...KARINA, author: settings.authorName },
          rules,
          ai: ai ? { model: settings.model, effort: settings.effort, system } : false,
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
        try {
          updated.proofread.score = await proofreadScores(updated, original, result.output, result.changes, rules);
          updated.score = { total: updated.proofread.score.original.total, at: updated.proofread.at };
        } catch (e) {
          console.warn("scoring failed", e); // the proofread itself is fine; the score just stays empty
        }
        await store.save(updated);
        if (result.ai) {
          await store.logUsage({ at: updated.proofread.at, jobId: id, model: result.ai.model, costUsd: result.ai.costUsd, usage: result.ai.usage });
        }
        // the Proofread record: counted once, the first time this document is proofread (never blocks the result)
        const counted = await st.record.count(updated, ai ? "ai" : "rules").then((n) => countedNumber(st, n)).catch(() => null);
        send({ done: true, job: updated, counted });
      } catch (e) {
        job.status = job.versions.length > 1 ? "ready" : "new";
        await store.save(job).catch(() => {});
        send({ error: e instanceof Error ? e.message : "Proofreading failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
