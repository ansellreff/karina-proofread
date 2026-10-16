/**
 * Microsoft sign-in settings. Online (and locally once Karina has registered the app) these come from environment
 * variables; when MS_CLIENT_ID is not set the app runs in local mode: no sign-in, files in web/.data.
 */

/** Personal Microsoft accounts (outlook.com, hotmail.com, live.com; OneDrive Personal). */
export const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
export const SCOPES = "openid profile email offline_access User.Read Files.ReadWrite";

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  /** Encrypts the session cookie (AUTH_SECRET, at least 32 characters). */
  secret: string;
  /** Email addresses allowed to sign in (ALLOWED_ACCOUNT, comma-separated). */
  allowed: string[];
  /** The app's public address (APP_URL); the sign-in callback is <APP_URL>/api/auth/callback. */
  appUrl: string | null;
}

export class AuthConfigError extends Error {}

export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const clientId = env.MS_CLIENT_ID?.trim();
  if (!clientId) return null;
  const missing = ["MS_CLIENT_SECRET", "AUTH_SECRET", "ALLOWED_ACCOUNT"].filter((k) => !env[k]?.trim());
  if (missing.length) throw new AuthConfigError(`Sign-in is half set up: ${missing.join(", ")} missing.`);
  if (env.AUTH_SECRET!.trim().length < 32) throw new AuthConfigError("AUTH_SECRET must be at least 32 characters.");
  return {
    clientId,
    clientSecret: env.MS_CLIENT_SECRET!.trim(),
    secret: env.AUTH_SECRET!.trim(),
    allowed: env.ALLOWED_ACCOUNT!.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    appUrl: env.APP_URL?.trim().replace(/\/+$/, "") || null,
  };
}

/** Local mode: no sign-in, files on this computer. */
export const isLocalMode = (env: Record<string, string | undefined> = process.env) => !env.MS_CLIENT_ID?.trim();
