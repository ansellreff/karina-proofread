/** The AI lock for the current request (route handlers). Server only. */
import { cookies } from "next/headers";
import { AI_COOKIE, unlockedUntil } from "./lock";

export async function aiUnlockedUntil(): Promise<number | null> {
  return unlockedUntil((await cookies()).get(AI_COOKIE)?.value);
}

/** The answer an AI route gives when this device hasn't unlocked the AI. */
export const aiLockedResponse = () => Response.json({ error: "The AI is locked. Enter the AI password to use it.", aiLocked: true }, { status: 403 });
