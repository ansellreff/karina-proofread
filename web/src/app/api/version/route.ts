import { databaseUrl } from "@/lib/storage/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which version of the code is running (push.bat compares it with what was pushed, to tell Karina when Vercel has
 * updated) and whether the database is connected. No document data.
 */
export function GET() {
  let database: "connected" | "missing" | "local" = "local";
  try {
    database = databaseUrl() ? "connected" : "local";
  } catch {
    database = "missing";
  }
  return Response.json(
    { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null, database },
    { headers: { "Cache-Control": "no-store" } },
  );
}
