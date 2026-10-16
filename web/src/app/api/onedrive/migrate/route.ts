import { copyLocalToOneDrive, hasLocalData } from "@/lib/onedrive/migrate";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Copy this computer's documents, rules and learning data into OneDrive (only when running locally). */
export async function POST() {
  const st = await stores();
  if (st.mode !== "onedrive") return Response.json({ error: "Connect OneDrive first." }, { status: 400 });
  if (!hasLocalData()) return Response.json({ error: "There is no local data here (this only works in the app on your computer)." }, { status: 400 });
  try {
    return Response.json(await copyLocalToOneDrive(st.data));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Copying failed." }, { status: 502 });
  }
}
