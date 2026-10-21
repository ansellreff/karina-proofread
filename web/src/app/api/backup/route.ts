import { backupFileName, createBackup, restoreBackup } from "@/lib/backup";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Download a backup of everything (one zip), streamed so a large backup isn't held back by response size limits. */
export async function GET() {
  const { zip } = await createBackup(await stores());
  const parts = zip.generateInternalStream({ type: "uint8array", compression: "STORE", streamFiles: true });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      parts
        .on("data", (chunk) => controller.enqueue(chunk))
        .on("error", (e) => controller.error(e))
        .on("end", () => controller.close())
        .resume();
    },
  });
  const name = backupFileName();
  return new Response(body, {
    headers: { "Content-Type": "application/zip", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${name}"` },
  });
}

/** Restore a backup: form field `file` (the zip), `settings=1` to also put back rules, rulebook and settings. */
export async function POST(request: Request) {
  const s = await stores();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a backup file." }, { status: 400 });
    const result = await restoreBackup(s, new Uint8Array(await file.arrayBuffer()), { settings: form.get("settings") === "1" });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error && /backup|newer version/.test(e.message) ? e.message : "This file couldn't be read as a backup.";
    return Response.json({ error: message }, { status: 400 });
  }
}
