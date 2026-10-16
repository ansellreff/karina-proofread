/**
 * The stores for the current request: the online database when DATABASE_URL is set, otherwise this computer
 * (web/.data, web/prompts). Pages and route handlers only.
 *
 * There is no sign-in (Karina's choice, 2026-10-17): anyone with the online address can use the app. The password
 * sign-in that was built is in git history (commit c272e1c) if it is ever wanted back.
 */
import { databaseUrl } from "./config";
import { localStores, storesOn, type Stores } from "./local";
import { neonQuery, PgFiles, pgliteQuery, type Query } from "./pg-files";

export type { Stores };

/** One connection per server instance (PGlite must be a single instance per folder). */
let cached: { url: string; files: PgFiles } | null = null;

async function cloudFiles(url: string): Promise<PgFiles> {
  if (cached?.url === url) return cached.files;
  let query: Query;
  if (url.startsWith("pglite:")) {
    if (process.env.VERCEL) throw new Error("PGlite is for this computer only.");
    query = await pgliteQuery(url.slice("pglite:".length) || undefined);
  } else query = await neonQuery(url);
  cached = { url, files: new PgFiles(query) };
  return cached.files;
}

export async function stores(): Promise<Stores> {
  const url = databaseUrl();
  return url ? storesOn(await cloudFiles(url), "online") : localStores();
}
