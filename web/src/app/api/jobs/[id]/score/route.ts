import { loadRules } from "@/lib/rules/config-store";
import { currentScore, proofreadScores } from "@/lib/score/job-score";
import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";

/**
 * Live score of the review in progress. Multipart: `file` = the editor's current .docx (not saved as a version),
 * `pending` = JSON list of w:ids of bot suggestions still open. Returns the current, original and potential scores.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/score">) {
  const store = getStore();
  const id = (await ctx.params).id;
  const job = await store.get(id);
  if (!job?.proofread) return Response.json({ error: "Proofread the document first." }, { status: 400 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "No document." }, { status: 400 });
  let pending: string[] = [];
  try {
    pending = JSON.parse(String(form.get("pending") ?? "[]"));
  } catch {
    /* treat as nothing pending */
  }
  const rules = await loadRules();
  const pr = job.proofread;
  if (!pr.score) {
    // documents proofread before scores existed
    pr.score = await proofreadScores(job, await store.readVersion(id, 0), await store.readVersion(id, pr.version), pr.changes, rules);
  }
  const openFixes = form.has("openFixes") ? Math.max(0, Number(form.get("openFixes")) || 0) : undefined;
  const current = await currentScore(job, new Uint8Array(await file.arrayBuffer()), pr.changes, new Set(pending.map(String)), rules, openFixes);  const fresh = await store.get(id); // don't overwrite changes made while scoring
  if (fresh?.proofread) {
    fresh.proofread.score = pr.score;
    fresh.score = { total: current.total, at: current.at };
    await store.save(fresh);
  }
  return Response.json({ current, original: pr.score.original, potential: pr.score.potential });
}
