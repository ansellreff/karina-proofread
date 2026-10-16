/**
 * Online settings (Vercel environment variables). Without them the app runs in local mode: files in web/.data,
 * no sign-in, for development and the tests.
 *   DATABASE_URL       Neon Postgres (set by the Vercel Marketplace integration); "pglite:<folder>" on this computer
 *   APP_PASSWORD_HASH  Karina's password, hashed (scripts/password-hash.ts); the password itself is never stored
 *   AUTH_SECRET        encrypts the sign-in cookie (at least 32 characters)
 */

export interface AuthConfig {
  passwordHash: string;
  secret: string;
}

export class AuthConfigError extends Error {}

type Env = Record<string, string | undefined>;

/** The sign-in settings, or null when no password is set (local mode). */
export function authConfig(env: Env = process.env): AuthConfig | null {
  const passwordHash = env.APP_PASSWORD_HASH?.trim();
  if (!passwordHash) {
    if (env.VERCEL) throw new AuthConfigError("APP_PASSWORD_HASH is not set: the online app stays locked until it is.");
    return null;
  }
  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new AuthConfigError("AUTH_SECRET must be set, at least 32 characters.");
  return { passwordHash, secret };
}

/** Where the app's files are: a database online, the local folder otherwise. */
export function databaseUrl(env: Env = process.env): string | null {
  const url = env.DATABASE_URL?.trim();
  if (!url && env.VERCEL) throw new AuthConfigError("DATABASE_URL is not set: connect the Neon database to the Vercel project.");
  return url || null;
}
