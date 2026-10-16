import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { secureCookies } from "@/lib/auth/current";
import { authConfig } from "@/lib/auth/config";
import { authorizeUrl, callbackUrl, pkce, randomState } from "@/lib/auth/oauth";
import { cookieOptions, OAUTH_COOKIE, seal } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Start Microsoft sign-in (a plain link from the sign-in page, so the CSP's form-action stays 'self'). */
export async function GET(request: Request) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.redirect(new URL("/", request.url));
  const { verifier, challenge } = await pkce();
  const state = randomState();
  const next = new URL(request.url).searchParams.get("next");
  const returnTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  (await cookies()).set(OAUTH_COOKIE, await seal({ state, verifier, returnTo }, cfg.secret, 600), { ...cookieOptions(secureCookies()), maxAge: 600 });
  return NextResponse.redirect(authorizeUrl(cfg, callbackUrl(request, cfg.appUrl), state, challenge));
}
