import { recordState } from "@/lib/record/view";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/** The Proofread record: summary and every entry (newest first) with where its document is now. */
export async function GET() {
  const { summary, rows } = await recordState(await stores());
  return Response.json({ summary, entries: rows.map((r) => ({ ...r, exists: r.doc === "active" })) });
}
