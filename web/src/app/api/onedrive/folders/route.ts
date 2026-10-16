import { requireSession } from "@/lib/auth/current";
import { authConfig } from "@/lib/auth/config";
import { Graph } from "@/lib/onedrive/graph";
import { subfolders } from "@/lib/onedrive/project";

export const runtime = "nodejs";

/** Folders inside a OneDrive folder (?parent=<id>; none = the top of her OneDrive), to choose the project folder. */
export async function GET(request: Request) {
  if (!authConfig()) return Response.json({ error: "OneDrive is not connected (local mode)." }, { status: 400 });
  const { session } = await requireSession();
  const parent = new URL(request.url).searchParams.get("parent");
  try {
    const { folder, path, folders } = await subfolders(new Graph(session.accessToken), parent);
    return Response.json({
      folder: { id: folder.id, name: parent ? folder.name : "OneDrive", path, parentId: parent ? (folder.parentReference?.id ?? null) : null },
      folders: folders.map((f) => ({ id: f.id, name: f.name, children: f.folder?.childCount ?? 0 })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "OneDrive could not be read." }, { status: 502 });
  }
}
