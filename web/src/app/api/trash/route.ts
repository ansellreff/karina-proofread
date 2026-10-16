import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await (await stores()).jobs.listTrash());
}
