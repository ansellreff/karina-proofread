/**
 * Pages only (API routes check the session themselves through stores(), and are left out so uploads are never
 * cut by the proxy's body limit): send a device that isn't signed in to the sign-in page. Inactive in local mode.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./lib/auth/config";
import { SESSION_COOKIE, unseal } from "./lib/auth/session";

export async function proxy(request: NextRequest) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (await unseal(request.cookies.get(SESSION_COOKIE)?.value, cfg.secret)) return NextResponse.next();
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico).*)"],
};
