import { cleanCopy } from "@/lib/docx/clean";
import { doneFileName } from "@/lib/naming";
import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * GET ?v=<n|current>&download=tracked|clean
 * Without `download`: the raw version for the editor. With it: Karina's DONE_ file name.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = getStore();
  const job = await store.get((await ctx.params).id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  const url = new URL(request.url);
  const v = url.searchParams.get("v");
  const n = v === null || v === "current" ? job.current : Number(v);
  if (!job.versions.some((x) => x.n === n)) return Response.json({ error: "Version not found." }, { status: 404 });
  let data = await store.readVersion(job.id, n);
  const download = url.searchParams.get("download");
  const headers: Record<string, string> = { "Content-Type": DOCX, "Cache-Control": "no-store" };
  if (download === "clean") data = await cleanCopy(data);
  if (download) {
    const name = doneFileName(job, "docx", download === "clean" ? "clean" : undefined);
    headers["Content-Disposition"] = `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
  return new Response(new Blob([new Uint8Array(data)]), { headers });
}
