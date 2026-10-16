import { describe, expect, it } from "vitest";
import { isHoldout } from "../learn/learn";
import { MemoryFiles } from "../storage/files";
import { authConfig, AuthConfigError, databaseUrl } from "./config";
import { clearFailures, hashPassword, LOCK, lockedFor, recordFailure, verifyPassword } from "./password";
import { newSession, seal, unseal, type Session } from "./session";

const SECRET = "x".repeat(40);

describe("online settings", () => {
  it("is local mode without a password; fails closed on Vercel", () => {
    expect(authConfig({})).toBeNull();
    expect(databaseUrl({})).toBeNull();
    expect(() => authConfig({ VERCEL: "1" })).toThrow(AuthConfigError);
    expect(() => databaseUrl({ VERCEL: "1" })).toThrow(AuthConfigError);
    expect(() => authConfig({ APP_PASSWORD_HASH: "h", AUTH_SECRET: "short" })).toThrow(/32/);
    expect(authConfig({ APP_PASSWORD_HASH: "h", AUTH_SECRET: SECRET })).toEqual({ passwordHash: "h", secret: SECRET });
  });
});

describe("password", () => {
  it("checks the password against its hash (never stored as is)", async () => {
    const hash = await hashPassword("Correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
    expect(hash).not.toContain("Correct");
    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await hashPassword("same")).not.toBe(await hashPassword("same")); // salted
  });

  it("locks an address after repeated wrong passwords, for that address only, and frees it after the window", async () => {
    const files = new MemoryFiles();
    const t0 = Date.parse("2026-10-17T10:00:00Z");
    for (let i = 0; i < LOCK.tries - 1; i++) await recordFailure(files, "1.2.3.4", t0 + i * 1000);
    expect(await lockedFor(files, "1.2.3.4", t0 + 5000)).toBe(0);
    await recordFailure(files, "1.2.3.4", t0 + 5000);
    expect(await lockedFor(files, "1.2.3.4", t0 + 6000)).toBe(15);
    expect(await lockedFor(files, "5.6.7.8", t0 + 6000)).toBe(0);
    expect(await lockedFor(files, "1.2.3.4", t0 + LOCK.windowMs + 6000)).toBe(0);
    expect(new TextDecoder().decode((await files.read("auth/failures.json"))!)).not.toContain("1.2.3.4"); // stored hashed
    await clearFailures(files, "1.2.3.4");
    expect(await lockedFor(files, "1.2.3.4", t0 + 6000)).toBe(0);
  });
});

describe("session cookie", () => {
  it("round-trips encrypted, and rejects tampering or another secret", async () => {
    const sealed = await seal({ ...newSession() }, SECRET, 3600);
    expect((await unseal<Session>(sealed, SECRET))?.v).toBe(1);
    expect(await unseal(sealed, "y".repeat(40))).toBeNull();
    expect(await unseal(`${sealed.slice(0, -4)}AAAA`, SECRET)).toBeNull();
    expect(await unseal(null, SECRET)).toBeNull();
  });
});

describe("hold-out guard", () => {
  it("knows the test documents by content, not name", () => {
    expect(isHoldout(new TextEncoder().encode("any other file"))).toBe(false);
  });
});
