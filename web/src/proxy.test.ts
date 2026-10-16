import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newSession, seal, SESSION_COOKIE } from "./lib/auth/session";
import { proxy } from "./proxy";

const SECRET = "s".repeat(40);
const online = () => {
  vi.stubEnv("APP_PASSWORD_HASH", "scrypt$1$1$1$a$b");
  vi.stubEnv("AUTH_SECRET", SECRET);
};

async function request(path: string, signedIn = false, secret = SECRET) {
  const headers = new Headers();
  if (signedIn) headers.set("cookie", `${SESSION_COOKIE}=${await seal({ ...newSession("fp") }, secret, 3600)}`);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

const location = (res: Response) => res.headers.get("location");

afterEach(() => vi.unstubAllEnvs());

describe("proxy (pages only)", () => {
  it("does nothing in local mode", async () => {
    vi.stubEnv("APP_PASSWORD_HASH", "");
    expect(location(await proxy(await request("/rules")))).toBeNull();
  });

  it("sends a device that isn't signed in to sign-in, and keeps where it was going", async () => {
    online();
    expect(location(await proxy(await request("/jobs/abc?x=1")))).toBe("http://localhost:3000/login?next=%2Fjobs%2Fabc%3Fx%3D1");
    expect(location(await proxy(await request("/login")))).toBeNull();
    expect(location(await proxy(await request("/", true, "o".repeat(40))))).toContain("/login"); // a cookie from another secret
  });

  it("lets a signed-in device through", async () => {
    online();
    expect(location(await proxy(await request("/", true)))).toBeNull();
  });

  it("online with a setting missing: a page naming what's missing (no values), not an error", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_PASSWORD_HASH", "");
    vi.stubEnv("DATABASE_URL", "");
    const res = await proxy(await request("/"));
    const html = await res.text();
    expect(res.status).toBe(503);
    expect(html).toContain("APP_PASSWORD_HASH");
    expect(html).toContain("DATABASE_URL");
    online();
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("AUTH_SECRET", "short");
    const res2 = await proxy(await request("/"));
    expect((await res2.text()).includes("AUTH_SECRET")).toBe(true);
  });
});
