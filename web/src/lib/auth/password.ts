/** Karina's password: scrypt hash, constant-time check, and a lock after repeated wrong guesses. Server only. */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readJson, writeJson, type AppFiles } from "../storage/files";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * "scrypt.N.r.p.salt.hash" (base64url): only letters, digits, ".", "-" and "_", so it pastes safely anywhere.
 * Hashes made earlier with "$" separators and base64 still verify.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join(".");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const sep = stored.includes("$") ? "$" : ".";
  const enc: BufferEncoding = sep === "$" ? "base64" : "base64url";
  const [kind, N, r, p, salt, hash] = stored.trim().split(sep);
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, enc);
  if (!want.length) return false;
  try {
    const got = await scrypt(password, Buffer.from(salt, enc), want.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false; // a damaged hash
  }
}

/** The visitor's address (Vercel puts it first in x-forwarded-for). */
export const clientAddress = (request: Request) => (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "local").split(",")[0].trim();

/** After this many wrong passwords from one address within the window, sign-in waits until the window passes. */
export const LOCK = { tries: 5, windowMs: 15 * 60 * 1000 };
const FILE = "auth/failures.json";

type Failures = Record<string, string[]>;
/** Addresses are stored hashed. */
const keyOf = (ip: string) => createHash("sha256").update(ip).digest("base64url").slice(0, 16);

/** Minutes until this address may try again, or 0. */
export async function lockedFor(files: AppFiles, ip: string, now = Date.now()): Promise<number> {
  const recent = ((await readJson<Failures>(files, FILE)) ?? {})[keyOf(ip)]?.filter((t) => now - Date.parse(t) < LOCK.windowMs) ?? [];
  if (recent.length < LOCK.tries) return 0;
  return Math.ceil((Date.parse(recent[recent.length - LOCK.tries]) + LOCK.windowMs - now) / 60000);
}

export async function recordFailure(files: AppFiles, ip: string, now = Date.now()): Promise<void> {
  const all = (await readJson<Failures>(files, FILE)) ?? {};
  for (const k of Object.keys(all)) all[k] = all[k].filter((t) => now - Date.parse(t) < LOCK.windowMs);
  all[keyOf(ip)] = [...(all[keyOf(ip)] ?? []), new Date(now).toISOString()];
  for (const k of Object.keys(all)) if (!all[k].length) delete all[k];
  await writeJson(files, FILE, all);
}

export async function clearFailures(files: AppFiles, ip: string): Promise<void> {
  const all = (await readJson<Failures>(files, FILE)) ?? {};
  if (!all[keyOf(ip)]) return;
  delete all[keyOf(ip)];
  await writeJson(files, FILE, all);
}
