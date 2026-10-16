/**
 * The app's files in one Postgres table (online: Neon, from the Vercel Marketplace). Same layout as the local
 * folder, so a copy from this computer is file for file; strongly consistent, so a save is visible at once.
 *
 *   app_files(path text primary key, data bytea, size int, modified timestamptz)
 */
import { safePath, type AppFiles, type FileInfo } from "./files";

/** One SQL statement with $1… parameters, returning its rows. */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const TABLE = `CREATE TABLE IF NOT EXISTS app_files (
  path text PRIMARY KEY,
  data bytea NOT NULL,
  size integer NOT NULL,
  modified timestamptz NOT NULL DEFAULT now()
)`;

/** Rows for a path and everything under it ("jobs/a" -> "jobs/a", "jobs/a/…"). */
const UNDER = "(path = $1 OR left(path, length($1) + 1) = $1 || '/')";

export class PgFiles implements AppFiles {
  readonly kind = "cloud" as const;
  private ready: Promise<void> | null = null;

  constructor(private query: Query) {}

  private async q(text: string, params: unknown[] = []) {
    this.ready ??= this.query(TABLE).then(
      () => undefined,
      (e) => {
        this.ready = null;
        throw e;
      },
    );
    await this.ready;
    return this.query(text, params);
  }

  async read(p: string): Promise<Uint8Array | null> {
    const rows = await this.q("SELECT encode(data, 'base64') AS b64 FROM app_files WHERE path = $1", [safePath(p)]);
    return rows.length ? new Uint8Array(Buffer.from(String(rows[0].b64).replace(/\s/g, ""), "base64")) : null;
  }

  async write(p: string, data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    await this.q(
      `INSERT INTO app_files (path, data, size, modified) VALUES ($1, decode($2, 'base64'), $3, now())
       ON CONFLICT (path) DO UPDATE SET data = excluded.data, size = excluded.size, modified = now()`,
      [safePath(p), bytes.toString("base64"), bytes.byteLength],
    );
  }

  async list(dir: string): Promise<FileInfo[]> {
    const prefix = dir ? `${safePath(dir)}/` : "";
    const rows = await this.q("SELECT path, size, modified FROM app_files WHERE left(path, length($1)) = $1", [prefix]);
    const seen = new Map<string, FileInfo>();
    for (const r of rows) {
      const [name, ...rest] = String(r.path).slice(prefix.length).split("/");
      const modified = r.modified instanceof Date ? r.modified.toISOString() : String(r.modified ?? "");
      if (rest.length) {
        if (!seen.has(name)) seen.set(name, { name, folder: true, size: 0, modified });
      } else seen.set(name, { name, folder: false, size: Number(r.size), modified });
    }
    return [...seen.values()];
  }

  async remove(p: string): Promise<boolean> {
    const rows = await this.q(`DELETE FROM app_files WHERE ${UNDER} RETURNING path`, [safePath(p)]);
    return rows.length > 0;
  }

  async move(from: string, to: string): Promise<boolean> {
    const a = safePath(from);
    const b = safePath(to);
    // anything already at the target is replaced, as a folder move would
    await this.q(`DELETE FROM app_files WHERE ${UNDER.replaceAll("$1", "$2")} AND NOT ${UNDER}`, [a, b]);
    const rows = await this.q(`UPDATE app_files SET path = $2 || substr(path, length($1) + 1), modified = now() WHERE ${UNDER} RETURNING path`, [a, b]);
    return rows.length > 0;
  }
}

/** Neon's HTTP driver (online). */
export async function neonQuery(url: string): Promise<Query> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return (text, params = []) => sql.query(text, params) as Promise<Record<string, unknown>[]>;
}

/** PGlite, Postgres in-process (tests, and the online mode run on this computer: DATABASE_URL=pglite:<folder>). */
export async function pgliteQuery(dataDir?: string): Promise<Query> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(dataDir);
  return async (text, params = []) => (await db.query<Record<string, unknown>>(text, params)).rows;
}
