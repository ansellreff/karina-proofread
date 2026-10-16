/** The session of the current request (pages, route handlers). Server only. */
import { cookies } from "next/headers";
import { authConfig, type AuthConfig } from "./config";
import { cookieOptions, seal, SESSION_COOKIE, SESSION_MAX_AGE, unseal, type Session } from "./session";

export const secureCookies = () => process.env.NODE_ENV === "production";

/** Sign this device in (route handlers only), or out with null. */
export async function writeSession(cfg: AuthConfig, s: Session | null): Promise<void> {
  const jar = await cookies();
  if (!s) jar.set(SESSION_COOKIE, "", { ...cookieOptions(secureCookies()), maxAge: 0 });
  else jar.set(SESSION_COOKIE, await seal({ ...s }, cfg.secret, SESSION_MAX_AGE), { ...cookieOptions(secureCookies()), maxAge: SESSION_MAX_AGE });
}

export async function currentSession(cfg: AuthConfig): Promise<Session | null> {
  return unseal<Session>((await cookies()).get(SESSION_COOKIE)?.value, cfg.secret);
}

/** Local mode (no password set) counts as signed in. */
export async function signedIn(): Promise<boolean> {
  const cfg = authConfig();
  return !cfg || !!(await currentSession(cfg));
}
