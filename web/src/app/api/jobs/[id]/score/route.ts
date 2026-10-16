import { currentScore, proofreadScores } from "@/lib/score/job-score";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The live score is saved with the job at most this often (each save is a OneDrive write online). */
const SAVE_EVERY_MS = 60_000;

/**
 * Live score of the review in progress. Multipart: `file` = the editor's current .docx (not saved as a version),
 * `pending` = JSON list of w:ids of bot suggestions still open. Returns the current, original and potential scores.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/score">) {
  const st = await stores();
  const store = st.jobs;
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
  const rules = await st.config.loadRules();
  const pr = job.proofread;
  const backfilled = !pr.score;
  if (!pr.score) {
    // documents proofread before scores existed
    pr.score = await proofreadScores(job, await store.readVersion(id, 0), await store.readVersion(id, pr.version), pr.changes, rules);
  }
  const openFixes = form.has("openFixes") ? Math.max(0, Number(form.get("openFixes")) || 0) : undefined;
  const current = await currentScore(job, new Uint8Array(await file.arrayBuffer()), pr.changes, new Set(pending.map(String)), rules, openFixes);
  const stale = !job.score || Date.now() - Date.parse(job.score.at) > SAVE_EVERY_MS;
  if (backfilled || (stale && job.score?.total !== current.total)) {
    const fresh = await store.get(id); // don't overwrite changes made while scoring
    if (fresh?.proofread) {
      fresh.proofread.score = pr.score;
      fresh.score = { total: current.total, at: current.at };
      await store.save(fresh);
    }
  }
  return Response.json({ current, original: pr.score.original, potential: pr.score.potential });
}
