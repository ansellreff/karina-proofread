/**
 * Where the app's files are. Online (Vercel) DATABASE_URL points to the Neon database (set by the Vercel
 * Marketplace integration); without it the app uses this computer's web/.data. "pglite:<folder>" tries the online
 * mode on this computer.
 */

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

export function databaseUrl(env: Env = process.env): string | null {
  const url = env.DATABASE_URL?.trim();
  if (!url && env.VERCEL) throw new ConfigError("DATABASE_URL is not set: connect the Neon database to the Vercel project (Storage → Neon).");
  return url || null;
}
