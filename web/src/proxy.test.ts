import { afterEach, describe, expect, it, vi } from "vitest";
import { isHoldout } from "./lib/learn/learn";
import { ConfigError, databaseUrl } from "./lib/storage/config";
import { proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

describe("online settings", () => {
  it("local without DATABASE_URL; online it must be set", () => {
    expect(databaseUrl({})).toBeNull();
    expect(databaseUrl({ DATABASE_URL: " postgres://x " })).toBe("postgres://x");
    expect(() => databaseUrl({ VERCEL: "1" })).toThrow(ConfigError);
  });

  it("pages pass through when set up, and say what is missing online when not (no bare error 500)", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(proxy().headers.get("x-middleware-next")).toBe("1");
    vi.stubEnv("VERCEL", "1");
    const res = proxy();
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("DATABASE_URL");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(proxy().status).toBe(200);
  });
});

describe("hold-out guard", () => {
  it("knows the test documents by content, not name", () => {
    expect(isHoldout(new TextEncoder().encode("any other file"))).toBe(false);
  });
});
