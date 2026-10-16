/**
 * The AI lock. The app itself is open, but using the AI (which costs money on Karina's Anthropic key) needs the AI
 * password (ai-password.ts). Unlocking sets an httpOnly cookie on that device: "<expiry>.<signature>", where the
 * signature is an HMAC keyed by the password, so changing the password locks every device again. A few wrong tries
 * from one address make it wait. Server only.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readJson, writeJson, type AppFiles } from "../storage/files";
import { AI_PASSWORD } from "./ai-password";

export const AI_COOKIE = "kp_ai";
/** "Remember on this device": 30 days. Otherwise until the browser closes (and at most 12 hours). */
export const REMEMBER_DAYS = 30;
const SHORT_HOURS = 12;

const sign = (expires: number, password = AI_PASSWORD) => createHmac("sha256", password).update(`ai-unlock:${expires}`).digest("base64url");

export function checkPassword(given: string, password = AI_PASSWORD): boolean {
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}

export function unlockToken(remember: boolean, now = Date.now(), password = AI_PASSWORD): { value: string; expires: number; maxAge?: number } {
  const expires = now + (remember ? REMEMBER_DAYS * 24 : SHORT_HOURS) * 3600 * 1000;
  return { value: `${expires}.${sign(expires, password)}`, expires, maxAge: remember ? REMEMBER_DAYS * 24 * 3600 : undefined };
}

/** When the unlock on this device ends, or null when the AI is locked here. */
export function unlockedUntil(cookie: string | undefined, now = Date.now(), password = AI_PASSWORD): number | null {
  const [exp, sig] = (cookie ?? "").split(".");
  const expires = Number(exp);
  if (!sig || !Number.isFinite(expires) || expires < now) return null;
  const want = Buffer.from(sign(expires, password));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want) ? expires : null;
}

// ---- wrong tries

export const LOCK = { tries: 5, windowMs: 15 * 60 * 1000 };
const FILE = "ai/failures.json";
type Failures = Record<string, string[]>;
const keyOf = (ip: string) => createHash("sha256").update(ip).digest("base64url").slice(0, 16);

export const clientAddress = (request: Request) => (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "local").split(",")[0].trim();

/** Minutes this address must wait before trying again, or 0. */
export async function waitMinutes(files: AppFiles, ip: string, now = Date.now()): Promise<number> {
  const recent = ((await readJson<Failures>(files, FILE)) ?? {})[keyOf(ip)]?.filter((t) => now - Date.parse(t) < LOCK.windowMs) ?? [];
  if (recent.length < LOCK.tries) return 0;
  return Math.max(1, Math.ceil((Date.parse(recent[recent.length - LOCK.tries]) + LOCK.windowMs - now) / 60000));
}

export async function recordFailure(files: AppFiles, ip: string, now = Date.now()): Promise<number> {
  const all = (await readJson<Failures>(files, FILE)) ?? {};
  for (const k of Object.keys(all)) {
    all[k] = all[k].filter((t) => now - Date.parse(t) < LOCK.windowMs);
    if (!all[k].length) delete all[k];
  }
  all[keyOf(ip)] = [...(all[keyOf(ip)] ?? []), new Date(now).toISOString()];
  await writeJson(files, FILE, all);
  return LOCK.tries - all[keyOf(ip)].length; // tries left
}

export async function clearFailures(files: AppFiles, ip: string): Promise<void> {
  const all = (await readJson<Failures>(files, FILE)) ?? {};
  if (!all[keyOf(ip)]) return;
  delete all[keyOf(ip)];
  await writeJson(files, FILE, all);
}
