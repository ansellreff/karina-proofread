import { importFromInbox, listInbox } from "@/lib/onedrive/project";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Word and PDF files waiting in the project folder's Inbox. */
export async function GET() {
  const st = await stores();
  if (st.mode !== "onedrive") return Response.json({ files: [] });
  try {
    return Response.json({ files: await listInbox(st) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "The Inbox could not be read." }, { status: 502 });
  }
}

/** Import one Inbox file ({ name }) as a document; the file moves to Inbox/Imported. */
export async function POST(request: Request) {
  const st = await stores();
  if (st.mode !== "onedrive") return Response.json({ error: "OneDrive is not connected." }, { status: 400 });
  const { name } = (await request.json()) as { name?: string };
  try {
    return Response.json({ job: await importFromInbox(st, String(name ?? "")) }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "The file could not be imported." }, { status: 400 });
  }
}
