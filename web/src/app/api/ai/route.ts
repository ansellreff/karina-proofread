import { cookies } from "next/headers";
import { AI_COOKIE, checkPassword, clearFailures, clientAddress, recordFailure, unlockToken, waitMinutes } from "@/lib/ai/lock";
import { aiUnlockedUntil } from "@/lib/ai/lock-request";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" });

/** Is the AI available (key set) and unlocked on this device? */
export async function GET() {
  const until = await aiUnlockedUntil();
  return Response.json({ hasKey: !!process.env.ANTHROPIC_API_KEY, unlocked: !!until, until: until ? new Date(until).toISOString() : null });
}

/** Unlock the AI on this device: { password, remember }. */
export async function POST(request: Request) {
  const { password, remember } = (await request.json().catch(() => ({}))) as { password?: string; remember?: boolean };
  const files = (await stores()).data;
  const ip = clientAddress(request);
  const wait = await waitMinutes(files, ip);
  if (wait) return Response.json({ error: `Too many wrong tries. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`, wait }, { status: 429 });
  if (!checkPassword(String(password ?? ""))) {
    const left = await recordFailure(files, ip);
    return Response.json(
      { error: left > 0 ? `That password isn’t right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That password isn’t right. Try again in 15 minutes." },
      { status: 401 },
    );
  }
  await clearFailures(files, ip);
  const t = unlockToken(!!remember);
  (await cookies()).set(AI_COOKIE, t.value, { ...cookieOptions(), ...(t.maxAge ? { maxAge: t.maxAge } : {}) });
  return Response.json({ unlocked: true, until: new Date(t.expires).toISOString() });
}

/** Lock the AI on this device again. */
export async function DELETE() {
  (await cookies()).set(AI_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return Response.json({ unlocked: false });
}
