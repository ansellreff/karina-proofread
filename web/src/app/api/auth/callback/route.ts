import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { writeSession } from "@/lib/auth/current";
import { callbackUrl, NotAllowedError, signIn } from "@/lib/auth/oauth";
import { OAUTH_COOKIE, unseal } from "@/lib/auth/session";
import { Graph } from "@/lib/onedrive/graph";
import { readAppConfig } from "@/lib/onedrive/project";

export const runtime = "nodejs";

const back = (request: Request, path: string) => NextResponse.redirect(new URL(path, request.url));

/** Microsoft sends Karina back here after sign-in. */
export async function GET(request: Request) {
  const cfg = authConfig();
  if (!cfg) return back(request, "/");
  const url = new URL(request.url);
  const jar = await cookies();
  const pending = await unseal<{ state: string; verifier: string; returnTo: string }>(jar.get(OAUTH_COOKIE)?.value, cfg.secret);
  jar.delete(OAUTH_COOKIE);
  if (url.searchParams.get("error")) return back(request, "/login?error=cancelled");
  const code = url.searchParams.get("code");
  if (!pending || !code || url.searchParams.get("state") !== pending.state) return back(request, "/login?error=expired");
  try {
    const session = await signIn(cfg, code, pending.verifier, callbackUrl(request, cfg.appUrl));
    // the project folder chosen before (remembered in her OneDrive's app folder)
    const saved = await readAppConfig(new Graph(session.accessToken)).catch(() => null);
    if (saved) Object.assign(session, { folderId: saved.folderId, folderName: saved.folderName });
    await writeSession(cfg, session);
    return back(request, session.folderId ? pending.returnTo : "/setup");
  } catch (e) {
    if (e instanceof NotAllowedError) return back(request, "/login?error=private");
    console.error("sign-in failed", e);
    return back(request, "/login?error=failed");
  }
}
