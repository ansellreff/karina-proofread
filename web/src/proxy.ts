/**
 * Online with the database not connected, every page says so (the setting's name only) instead of failing with a
 * bare "Internal Server Error". Pages only; API routes are left out so uploads are never cut by the proxy's body limit.
 */
import { NextResponse } from "next/server";
import { ConfigError, databaseUrl } from "./lib/storage/config";

function setupPage(problem: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup isn’t finished | Karina Proofread</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:12vh auto;padding:0 16px;color:#1f2430;background:#f4f5f1}h1{font-size:1.4rem}code{background:#e6e8ef;padding:0 4px;border-radius:4px}@media(prefers-color-scheme:dark){body{color:#e7e9ef;background:#11141b}code{background:#252b3b}}</style></head>
<body><h1>The app’s setup isn’t finished</h1><p>${problem.replace(/[<>&]/g, "")}</p>
<p>In Vercel → your project: <b>Storage</b> (connect Neon) or <b>Settings → Environment Variables</b>, then <b>Deployments → Redeploy</b>. The steps are in <code>docs/ONLINE_SETUP.md</code>.</p></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export function proxy() {
  try {
    databaseUrl();
  } catch (e) {
    if (e instanceof ConfigError) return setupPage(e.message);
    throw e;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico).*)"],
};
