import { authConfig } from "@/lib/auth/config";
import { writeSession } from "@/lib/auth/current";
import { clientAddress, lockedFor, recordFailure, verifyPassword } from "@/lib/auth/password";
import { changePassword, currentPasswordHash, fingerprint, MIN_PASSWORD } from "@/lib/auth/password-store";
import { newSession } from "@/lib/auth/session";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/**
 * Change the password ({ current, next }). This device stays signed in; every other device is signed out.
 * Forgotten passwords are reset in Vercel instead (docs/ONLINE_SETUP.md).
 */
export async function POST(request: Request) {
  const cfg = authConfig();
  if (!cfg) return Response.json({ error: "There is no password on this computer’s copy of the app." }, { status: 400 });
  const st = await stores(); // signed in
  const { current, next } = (await request.json()) as { current?: string; next?: string };
  const ip = clientAddress(request);
  const wait = await lockedFor(st.data, ip);
  if (wait) return Response.json({ error: `Too many wrong tries. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` }, { status: 429 });
  if (!(await verifyPassword(String(current ?? ""), await currentPasswordHash(st.data, cfg)))) {
    await recordFailure(st.data, ip);
    return Response.json({ error: "Your current password isn’t right." }, { status: 400 });
  }
  if (String(next ?? "").length < MIN_PASSWORD) return Response.json({ error: `Use at least ${MIN_PASSWORD} characters for the new password.` }, { status: 400 });
  const hash = await changePassword(st.data, cfg, String(next));
  await writeSession(cfg, newSession(fingerprint(hash)));
  return Response.json({ ok: true });
}
