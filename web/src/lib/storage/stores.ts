/**
 * The stores for the current request: the online database when DATABASE_URL is set, otherwise this computer
 * (web/.data, web/prompts). Online, a request without a signed-in session goes to the sign-in page.
 * Pages and route handlers only.
 */
import { redirect } from "next/navigation";
import { authConfig, databaseUrl } from "../auth/config";
import { currentSession } from "../auth/current";
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

/** The files the app keeps, without the sign-in check (the sign-in route needs them before a session exists). */
export async function dataStores(): Promise<Stores> {
  const url = databaseUrl();
  return url ? storesOn(await cloudFiles(url), "online") : localStores();
}

/** This request's stores; without a session (when a password is set) to the sign-in page. */
export async function stores(): Promise<Stores> {
  const cfg = authConfig();
  if (cfg && !(await currentSession(cfg))) redirect("/login");
  return dataStores();
}
