import { describe, expect, it } from "vitest";
import { MemoryFiles } from "../storage/files";
import { checkPassword, clearFailures, LOCK, recordFailure, unlockedUntil, unlockToken, waitMinutes } from "./lock";

describe("AI lock", () => {
  it("checks the password (spaces around it ignored)", () => {
    expect(checkPassword("991009", "991009")).toBe(true);
    expect(checkPassword(" 991009 ", "991009")).toBe(true);
    expect(checkPassword("991008", "991009")).toBe(false);
    expect(checkPassword("", "991009")).toBe(false);
  });

  it("an unlock lasts 30 days when remembered, 12 hours otherwise, and ends when the password changes", () => {
    const now = Date.parse("2026-10-17T10:00:00Z");
    const long = unlockToken(true, now, "991009");
    const short = unlockToken(false, now, "991009");
    expect(long.maxAge).toBe(30 * 24 * 3600);
    expect(short.maxAge).toBeUndefined(); // until the browser closes
    expect(unlockedUntil(long.value, now + 29 * 86400_000, "991009")).toBe(long.expires);
    expect(unlockedUntil(long.value, now + 31 * 86400_000, "991009")).toBeNull();
    expect(unlockedUntil(short.value, now + 13 * 3600_000, "991009")).toBeNull();
    expect(unlockedUntil(long.value, now, "a new password")).toBeNull(); // changed password: locked again
    expect(unlockedUntil(`${long.expires + 999999}.${long.value.split(".")[1]}`, now, "991009")).toBeNull(); // edited expiry
    expect(unlockedUntil(undefined, now, "991009")).toBeNull();
    expect(long.value).not.toContain("991009");
  });

  it("makes an address wait after 5 wrong tries, telling the tries left", async () => {
    const files = new MemoryFiles();
    const t0 = Date.parse("2026-10-17T10:00:00Z");
    const left = [];
    for (let i = 0; i < LOCK.tries; i++) left.push(await recordFailure(files, "1.2.3.4", t0 + i));
    expect(left).toEqual([4, 3, 2, 1, 0]);
    expect(await waitMinutes(files, "1.2.3.4", t0 + 1000)).toBe(15);
    expect(await waitMinutes(files, "5.6.7.8", t0 + 1000)).toBe(0);
    expect(await waitMinutes(files, "1.2.3.4", t0 + LOCK.windowMs + 10)).toBe(0);
    await clearFailures(files, "1.2.3.4");
    expect(await waitMinutes(files, "1.2.3.4", t0 + 1000)).toBe(0);
  });
});
