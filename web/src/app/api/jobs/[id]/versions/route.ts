import { normalizeSaved } from "@/lib/docx/normalize";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/**
 * POST multipart { file, label, score? } -> save the editor's current document as a new version
 * POST json { restore: <n> }            -> restore version n (0 = the student's original) as a new version
 * Nothing is ever overwritten, so every earlier version stays available.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = (await stores()).jobs;
  const id = (await ctx.params).id;
  const job = await store.get(id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const { restore } = (await request.json()) as { restore?: number };
    const from = job.versions.find((v) => v.n === restore);
    if (!from) return Response.json({ error: "Version not found." }, { status: 404 });
    const data = await store.readVersion(id, from.n);
    const label = from.n === 0 ? "Restored the original" : `Restored “${from.label}”`;
    return Response.json(await store.addVersion(id, data, { label, kind: "restore", from: from.n }));
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No document was sent." }, { status: 400 });
  const autosave = form.get("autosave") === "1";
  const label = autosave ? "Your edits (autosaved)" : String(form.get("label") ?? "Your edits");
  const saved = await normalizeSaved(new Uint8Array(await file.arrayBuffer()), await store.readVersion(id, 0), (await store.getSettings()).authorName);
  const updated = await store.addVersion(id, saved, { label, kind: "edit" }, { rolling: autosave });
  const score = Number(form.get("score"));
  if (form.has("score") && score >= 0 && score <= 100 && updated.score?.total !== score) {
    updated.score = { total: score, at: new Date().toISOString() };
    await store.save(updated);
  }
  return Response.json(updated);
}
