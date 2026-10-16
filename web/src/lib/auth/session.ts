/**
 * The signed-in session: Karina's Microsoft tokens in an encrypted, httpOnly cookie (split over a few cookies,
 * since browsers cap each at about 4 KB). Nothing is stored on the server.
 */
import { EncryptJWT, jwtDecrypt } from "jose";

export interface Session {
  accountId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  /** Access token expiry (ms since epoch). */
  expiresAt: number;
  /** Her project folder in OneDrive (chosen in Settings). */
  folderId?: string;
  folderName?: string;
}

export const SESSION_COOKIE = "kp_s";
export const OAUTH_COOKIE = "kp_oauth";
const CHUNK = 3800;
const MAX_CHUNKS = 5;
/** Sessions last as long as Microsoft keeps the refresh token valid; the cookie itself for 90 days. */
export const SESSION_MAX_AGE = 90 * 24 * 3600;

async function key(secret: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
}

export async function seal(payload: Record<string, unknown>, secret: string, maxAgeSeconds: number): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(await key(secret));
}

export async function unseal<T>(token: string | null | undefined, secret: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, await key(secret));
    return payload as T;
  } catch {
    return null; // tampered, expired or from another secret
  }
}

export interface CookieWrite {
  name: string;
  value: string;
  maxAge: number;
}

/** The cookies that store a sealed session (and clear chunks a shorter session no longer uses). */
export function sessionCookies(sealed: string | null): CookieWrite[] {
  const parts = sealed ? sealed.match(new RegExp(`.{1,${CHUNK}}`, "g"))! : [];
  if (parts.length > MAX_CHUNKS) throw new Error("The session is too large for cookies.");
  return Array.from({ length: MAX_CHUNKS }, (_, i) =>
    i < parts.length ? { name: `${SESSION_COOKIE}${i}`, value: parts[i], maxAge: SESSION_MAX_AGE } : { name: `${SESSION_COOKIE}${i}`, value: "", maxAge: 0 },
  );
}

/** Reassemble the sealed session from the request cookies. */
export function joinSession(get: (name: string) => string | undefined): string | null {
  let out = "";
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = get(`${SESSION_COOKIE}${i}`);
    if (!part) break;
    out += part;
  }
  return out || null;
}

export const cookieOptions = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "lax" as const, path: "/" });
