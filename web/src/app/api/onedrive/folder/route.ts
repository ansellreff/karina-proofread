import { authConfig } from "@/lib/auth/config";
import { requireSession, writeSession } from "@/lib/auth/current";
import { Graph } from "@/lib/onedrive/graph";
import { hasLocalData } from "@/lib/onedrive/migrate";
import { saveAppConfig, setupProject } from "@/lib/onedrive/project";

export const runtime = "nodejs";

/** The signed-in account and the project folder (null until chosen). */
export async function GET() {
  if (!authConfig()) return Response.json({ mode: "local" });
  const { session } = await requireSession();
  return Response.json({
    mode: "onedrive",
    account: { email: session.email, name: session.name },
    folder: session.folderId ? { id: session.folderId, name: session.folderName ?? "" } : null,
    localData: hasLocalData(),
  });
}

/** Use this folder as the project folder: creates Inbox, Done and App data inside it, and remembers it. */
export async function POST(request: Request) {
  if (!authConfig()) return Response.json({ error: "OneDrive is not connected (local mode)." }, { status: 400 });
  const { cfg, session } = await requireSession();
  const { id } = (await request.json()) as { id?: string };
  if (!id) return Response.json({ error: "Choose a folder." }, { status: 400 });
  const graph = new Graph(session.accessToken);
  try {
    const folder = await graph.item(id);
    if (!folder.folder) return Response.json({ error: "That is not a folder." }, { status: 400 });
    await setupProject(graph, folder.id);
    await saveAppConfig(graph, { folderId: folder.id, folderName: folder.name });
    await writeSession(cfg, { ...session, folderId: folder.id, folderName: folder.name });
    return Response.json({ folder: { id: folder.id, name: folder.name } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "The folder could not be set up." }, { status: 502 });
  }
}
