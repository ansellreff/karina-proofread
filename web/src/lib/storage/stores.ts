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

/**
 * One connection per server instance, kept on globalThis: Next.js bundles pages and route handlers separately, and
 * a module-level variable would give each its own copy. For PGlite that meant two databases on one folder (the page
 * never saw what a route saved); it must be a single instance per folder.
 */
const shared = globalThis as { __kpCloudFiles?: { url: string; files: Promise<PgFiles> } };

function cloudFiles(url: string): Promise<PgFiles> {
  if (shared.__kpCloudFiles?.url === url) return shared.__kpCloudFiles.files;
  const files = (async () => {
    let query: Query;
    if (url.startsWith("pglite:")) {
      if (process.env.VERCEL) throw new Error("PGlite is for this computer only.");
      query = await pgliteQuery(url.slice("pglite:".length) || undefined);
    } else query = await neonQuery(url);
    return new PgFiles(query);
  })();
  shared.__kpCloudFiles = { url, files };
  files.catch(() => {
    if (shared.__kpCloudFiles?.files === files) delete shared.__kpCloudFiles; // try again on the next request
  });
  return files;
}

export async function stores(): Promise<Stores> {
  const url = databaseUrl();
  return url ? storesOn(await cloudFiles(url), "online") : localStores();
}
