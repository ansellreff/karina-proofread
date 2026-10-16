import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { writeSession } from "@/lib/auth/current";

export const runtime = "nodejs";

/** Sign out of the app (the cookies are cleared; her Microsoft account stays signed in elsewhere). */
export async function POST(request: Request) {
  const cfg = authConfig();
  if (cfg) await writeSession(cfg, null);
  return NextResponse.redirect(new URL("/login?signedOut=1", request.url), 303);
}
