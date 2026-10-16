import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { writeSession } from "@/lib/auth/current";
import { clearFailures, clientAddress, lockedFor, recordFailure, verifyPassword } from "@/lib/auth/password";
import { currentPasswordHash, fingerprint } from "@/lib/auth/password-store";
import { newSession } from "@/lib/auth/session";
import { dataStores } from "@/lib/storage/stores";

export const runtime = "nodejs";

const back = (request: Request, path: string) => NextResponse.redirect(new URL(path, request.url), 303);
const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/");

/** The sign-in form (POST, so the CSP's form-action 'self' holds). */
export async function POST(request: Request) {
  const cfg = authConfig();
  if (!cfg) return back(request, "/");
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const ip = clientAddress(request);
  const files = (await dataStores()).data;
  const wait = await lockedFor(files, ip);
  if (wait) return back(request, `/login?error=locked&wait=${wait}&next=${encodeURIComponent(next)}`);
  const hash = await currentPasswordHash(files, cfg);
  if (!(await verifyPassword(String(form.get("password") ?? ""), hash))) {
    await recordFailure(files, ip);
    return back(request, `/login?error=wrong&next=${encodeURIComponent(next)}`);
  }
  await clearFailures(files, ip);
  await writeSession(cfg, newSession(fingerprint(hash)));
  return back(request, next);
}
