/**
 * Pages only (API routes check the session themselves, and are left out so uploads are never cut by the proxy's
 * body limit): send visitors without a session to sign-in, choose the project folder first, and refresh the
 * Microsoft access token before a page renders (pages can't set cookies themselves). Inactive in local mode.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./lib/auth/config";
import { needsRefresh, refreshSession } from "./lib/auth/oauth";
import { cookieOptions, joinSession, seal, sessionCookies, SESSION_MAX_AGE, unseal, type Session } from "./lib/auth/session";

export async function proxy(request: NextRequest) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  const toLogin = () => NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, request.url));

  let session = await unseal<Session>(joinSession((n) => request.cookies.get(n)?.value), cfg.secret);
  if (!session) return toLogin();
  let refreshed = false;
  if (needsRefresh(session)) {
    try {
      session = await refreshSession(cfg, session);
      refreshed = true;
    } catch {
      return toLogin();
    }
  }
  const res = !session.folderId && pathname !== "/setup" ? NextResponse.redirect(new URL("/setup", request.url)) : null;
  if (!refreshed) return res ?? NextResponse.next();

  const writes = sessionCookies(await seal({ ...session }, cfg.secret, SESSION_MAX_AGE));
  // the page rendering now sees the fresh token…
  for (const c of writes) {
    if (c.value) request.cookies.set(c.name, c.value);
    else request.cookies.delete(c.name);
  }
  const out = res ?? NextResponse.next({ request: { headers: request.headers } });
  // …and the browser keeps it
  const secure = process.env.NODE_ENV === "production";
  for (const c of writes) out.cookies.set(c.name, c.value, { ...cookieOptions(secure), maxAge: c.maxAge });
  return out;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico).*)"],
};
