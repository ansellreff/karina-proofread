import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seal, sessionCookies, type Session } from "./lib/auth/session";
import { proxy } from "./proxy";

const SECRET = "s".repeat(40);
const online = { MS_CLIENT_ID: "c", MS_CLIENT_SECRET: "x", AUTH_SECRET: SECRET, ALLOWED_ACCOUNT: "k@example.com" };

async function request(path: string, session?: Partial<Session>) {
  const headers = new Headers();
  if (session) {
    const sealed = await seal({ accountId: "a", email: "k@example.com", name: "K", accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3600_000, ...session }, SECRET, 3600);
    headers.set("cookie", sessionCookies(sealed).filter((c) => c.value).map((c) => `${c.name}=${c.value}`).join("; "));
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

const location = (res: Response) => res.headers.get("location");

afterEach(() => vi.unstubAllEnvs());

describe("proxy (pages only)", () => {
  it("does nothing in local mode", async () => {
    vi.stubEnv("MS_CLIENT_ID", "");
    expect(location(await proxy(await request("/rules")))).toBeNull();
  });

  it("sends visitors without a session to sign-in, and keeps where they were going", async () => {
    for (const [k, v] of Object.entries(online)) vi.stubEnv(k, v);
    expect(location(await proxy(await request("/jobs/abc?x=1")))).toBe("http://localhost:3000/login?next=%2Fjobs%2Fabc%3Fx%3D1");
    expect(location(await proxy(await request("/login")))).toBeNull();
  });

  it("asks for the project folder first, then lets pages through", async () => {
    for (const [k, v] of Object.entries(online)) vi.stubEnv(k, v);
    expect(location(await proxy(await request("/", {})))).toBe("http://localhost:3000/setup");
    expect(location(await proxy(await request("/setup", {})))).toBeNull();
    expect(location(await proxy(await request("/", { folderId: "f" })))).toBeNull();
  });
});
