import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";

/** Recently deleted documents (restorable). */
export async function GET() {
  return Response.json(await getStore().listTrash());
}
