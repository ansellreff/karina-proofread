import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/** Recently deleted (anything older than TRASH_DAYS is deleted forever first). */
export async function GET() {
  return Response.json(await (await stores()).jobs.listTrash());
}

/** Empty Recently deleted: everything in it is deleted forever. */
export async function DELETE() {
  return Response.json({ deleted: await (await stores()).jobs.emptyTrash() });
}
