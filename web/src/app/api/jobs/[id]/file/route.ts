import { cleanCopy } from "@/lib/docx/clean";
import { forEditor, toWord } from "@/lib/docx/dates";
import { KARINA } from "@/lib/identity";
import { doneFileName } from "@/lib/naming";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * GET ?v=<n|current>&download=tracked|clean
 * Without `download`: the stored version. With it: named as set in Settings → Export file name, dates in Word's form.
 * &view=editor: the copy the in-app editor opens, its dates readable as written (lib/docx/dates.ts).
 * GET ?source=1: the file exactly as the student sent it (the PDF, for documents converted from PDF).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const store = (await stores()).jobs;
  const job = await store.get((await ctx.params).id);
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("source") && job.sourceFile) {
    const pdf = await store.readSource(job.id);
    const name = job.sourceFile.name;
    return new Response(new Blob([new Uint8Array(pdf)]), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}` },
    });
  }
  const v = url.searchParams.get("v");
  const n = v === null || v === "current" ? job.current : Number(v);
  if (!job.versions.some((x) => x.n === n)) return Response.json({ error: "Version not found." }, { status: 404 });
  let data = await store.readVersion(job.id, n);
  const download = url.searchParams.get("download");
  const headers: Record<string, string> = { "Content-Type": DOCX, "Cache-Control": "no-store" };
  if (url.searchParams.get("view") === "editor") data = await forEditor(data, KARINA.utcOffsetMinutes);
  if (download === "clean") data = await cleanCopy(data);
  if (download) {
    data = await toWord(data, KARINA.utcOffsetMinutes);
    const name = doneFileName(job, "docx", (await store.getSettings()).fileName);
    headers["Content-Disposition"] = `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
  return new Response(new Blob([new Uint8Array(data)]), { headers });
}
