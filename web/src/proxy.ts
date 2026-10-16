/**
 * Pages only (API routes check the session themselves through stores(), and are left out so uploads are never
 * cut by the proxy's body limit): send a device that isn't signed in to the sign-in page. Inactive in local mode.
 * Online with a setting missing, every page says which one (names only, never values) instead of opening.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, AuthConfigError, databaseUrl } from "./lib/auth/config";
import { SESSION_COOKIE, unseal } from "./lib/auth/session";

function setupPage(problems: string[]): Response {
  const items = problems.map((p) => `<li>${p.replace(/[<>&]/g, "")}</li>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup isn’t finished | Karina Proofread</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:12vh auto;padding:0 16px;color:#1f2430;background:#f4f5f1}h1{font-size:1.4rem}li{margin:.4rem 0}code{background:#e6e8ef;padding:0 4px;border-radius:4px}@media(prefers-color-scheme:dark){body{color:#e7e9ef;background:#11141b}code{background:#252b3b}}</style></head>
<body><h1>The app’s setup isn’t finished</h1><p>The app stays locked until these Vercel settings are in place:</p><ul>${items}</ul>
<p>Add them in Vercel → your project → <b>Settings → Environment Variables</b>, then <b>Deployments → Redeploy</b>. The steps are in <code>docs/ONLINE_SETUP.md</code>.</p></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function proxy(request: NextRequest) {
  let cfg: ReturnType<typeof authConfig>;
  try {
    cfg = authConfig();
    databaseUrl();
  } catch (e) {
    if (!(e instanceof AuthConfigError)) throw e;
    const problems = [];
    for (const check of [authConfig, databaseUrl]) {
      try {
        check();
      } catch (err) {
        problems.push((err as Error).message);
      }
    }
    return setupPage(problems);
  }
  if (!cfg) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (await unseal(request.cookies.get(SESSION_COOKIE)?.value, cfg.secret)) return NextResponse.next();
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico).*)"],
};
