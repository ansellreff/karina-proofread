import { saveToDone, type DoneKind } from "@/lib/onedrive/project";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Save the current version to the project folder's Done/ ({ jobId, kind: "tracked" | "clean" | "pdf" }). */
export async function POST(request: Request) {
  const st = await stores();
  if (st.mode !== "onedrive") return Response.json({ error: "OneDrive is not connected." }, { status: 400 });
  const { jobId, kind } = (await request.json()) as { jobId?: string; kind?: DoneKind };
  if (!kind || !["tracked", "clean", "pdf"].includes(kind)) return Response.json({ error: "Unknown export." }, { status: 400 });
  const job = jobId ? await st.jobs.get(jobId) : null;
  if (!job) return Response.json({ error: "Document not found." }, { status: 404 });
  try {
    return Response.json({ path: await saveToDone(st, job, kind) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Saving to OneDrive failed." }, { status: 502 });
  }
}
