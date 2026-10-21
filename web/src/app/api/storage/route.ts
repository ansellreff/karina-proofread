import { storageSummary } from "@/lib/backup";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/** How much is stored (Settings → Backup and storage). */
export async function GET() {
  const s = await stores();
  return Response.json({ mode: s.mode, ...(await storageSummary(s)) });
}

/**
 * Free up space: every document and everything in Recently deleted, deleted forever (Karina downloads a backup
 * first). Rules, rulebook, learning, settings and the AI cost history stay. Needs `{ confirm: "DELETE" }`.
 */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") return Response.json({ error: "Not confirmed." }, { status: 400 });
  return Response.json({ deleted: await (await stores()).jobs.removeAllForever() });
}
