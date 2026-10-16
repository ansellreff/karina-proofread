/** The signed-in session: an encrypted, httpOnly cookie on each device (nothing about it is kept on the server). */
import { EncryptJWT, jwtDecrypt } from "jose";

export interface Session {
  v: 1;
  signedInAt: string;
  /** Fingerprint of the password hash it was opened with: a password change ends every other session. */
  pw: string;
}

export const SESSION_COOKIE = "kp_session";
/** A device stays signed in for 30 days. */
export const SESSION_MAX_AGE = 30 * 24 * 3600;

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

export const newSession = (pw: string): Session => ({ v: 1, signedInAt: new Date().toISOString(), pw });

export const cookieOptions = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "lax" as const, path: "/" });
