import { cleanCopy } from "@/lib/docx/clean";
import { doneFileName } from "@/lib/naming";
import { toPdf } from "@/lib/onedrive/project";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET ?job=<id>&v=<n|current>: the version (all changes accepted) as a PDF, converted by OneDrive, downloaded
 * with Karina's file name. When OneDrive can't convert it the app falls back to the print view.
 */
export async function GET(request: Request) {
  const st = await stores();
  if (st.mode !== "onedrive") return Response.json({ error: "OneDrive is not connected." }, { status: 400 });
  const url = new URL(request.url);
  const job = await st.jobs.get(url.searchParams.get("job") ?? "");
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  const v = url.searchParams.get("v");
  const n = v === null || v === "current" ? job.current : Number(v);
  if (!job.versions.some((x) => x.n === n)) return Response.json({ error: "Version not found." }, { status: 404 });
  try {
    const pdf = await toPdf(st, await cleanCopy(await st.jobs.readVersion(job.id, n)));
    const name = doneFileName(job, "pdf");
    return new Response(new Blob([new Uint8Array(pdf)]), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}` },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "OneDrive could not make the PDF." }, { status: 502 });
  }
}
