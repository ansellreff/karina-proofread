/** The session of the current request (pages, route handlers). Server only. */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig, type AuthConfig } from "./config";
import { needsRefresh, refreshSession } from "./oauth";
import { cookieOptions, joinSession, seal, sessionCookies, SESSION_MAX_AGE, unseal, type Session } from "./session";

export const secureCookies = () => process.env.NODE_ENV === "production";

/** Store the session in its cookies (route handlers and server actions only; pages can't set cookies). */
export async function writeSession(cfg: AuthConfig, s: Session | null): Promise<void> {
  const jar = await cookies();
  const sealed = s ? await seal({ ...s }, cfg.secret, SESSION_MAX_AGE) : null;
  for (const c of sessionCookies(sealed)) jar.set(c.name, c.value, { ...cookieOptions(secureCookies()), maxAge: c.maxAge });
}

/** The signed-in session, refreshed when its access token is about to expire; null when signed out. */
export async function currentSession(cfg: AuthConfig): Promise<Session | null> {
  const jar = await cookies();
  const s = await unseal<Session>(joinSession((n) => jar.get(n)?.value), cfg.secret);
  if (!s) return null;
  if (!needsRefresh(s)) return s;
  let fresh: Session;
  try {
    fresh = await refreshSession(cfg, s);
  } catch {
    return null; // Microsoft no longer accepts the sign-in: sign in again
  }
  try {
    await writeSession(cfg, fresh);
  } catch {
    // rendering a page: cookies can't be set here (the proxy refreshes before pages render)
  }
  return fresh;
}

/** The session, or a redirect to the sign-in page. */
export async function requireSession(): Promise<{ cfg: AuthConfig; session: Session }> {
  const cfg = authConfig();
  if (!cfg) throw new Error("Sign-in is not configured (local mode).");
  const session = await currentSession(cfg);
  if (!session) redirect("/login");
  return { cfg, session };
}
