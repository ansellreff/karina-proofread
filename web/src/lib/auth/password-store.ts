/**
 * Which password is in force, and changing it.
 * - Karina can change it in the app (Settings): the new hash is kept in the database (auth/password.json).
 * - If she forgets it, she makes a new hash with scripts/password-hash.ts and puts it in Vercel's APP_PASSWORD_HASH:
 *   a hash set in Vercel after the in-app change wins (recovery needs her Vercel account, which has email recovery).
 * Every session remembers which password it was opened with, so any change signs the other devices out.
 */
import { createHash } from "node:crypto";
import { readJson, writeJson, type AppFiles } from "../storage/files";
import type { AuthConfig } from "./config";
import { hashPassword } from "./password";

const FILE = "auth/password.json";

interface PasswordRecord {
  hash: string;
  /** Fingerprint of Vercel's APP_PASSWORD_HASH when this password was set in the app. */
  envFingerprint: string;
  changedAt: string;
}

export const fingerprint = (hash: string) => createHash("sha256").update(hash).digest("base64url").slice(0, 16);

/** The hash to check passwords against: the one set in the app, unless Vercel's has been replaced since. */
export async function currentPasswordHash(files: AppFiles, cfg: AuthConfig): Promise<string> {
  const rec = await readJson<PasswordRecord>(files, FILE);
  return rec && rec.envFingerprint === fingerprint(cfg.passwordHash) ? rec.hash : cfg.passwordHash;
}

export const MIN_PASSWORD = 10;

export async function changePassword(files: AppFiles, cfg: AuthConfig, next: string): Promise<string> {
  if (next.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
  const hash = await hashPassword(next);
  await writeJson(files, FILE, { hash, envFingerprint: fingerprint(cfg.passwordHash), changedAt: new Date().toISOString() } satisfies PasswordRecord);
  return hash;
}
