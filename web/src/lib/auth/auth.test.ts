import { describe, expect, it } from "vitest";
import { isHoldout } from "../learn/learn";
import { authConfig, AuthConfigError, isLocalMode } from "./config";
import { NotAllowedError, needsRefresh, refreshSession, signIn } from "./oauth";
import { joinSession, seal, sessionCookies, unseal, type Session } from "./session";

const SECRET = "x".repeat(40);
const env = { MS_CLIENT_ID: "client", MS_CLIENT_SECRET: "secret", AUTH_SECRET: SECRET, ALLOWED_ACCOUNT: "Karina@Example.com, other@example.com" };
const cfg = authConfig(env)!;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;

function tokenEndpoint(body: Record<string, unknown>, status = 200) {
  const seen: URLSearchParams[] = [];
  const fetcher = (async (_url: unknown, init?: RequestInit) => {
    seen.push(new URLSearchParams(String(init?.body)));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetcher, seen };
}

describe("sign-in settings", () => {
  it("is local mode without MS_CLIENT_ID, and refuses a half setup", () => {
    expect(authConfig({})).toBeNull();
    expect(isLocalMode({})).toBe(true);
    expect(() => authConfig({ MS_CLIENT_ID: "x" })).toThrow(AuthConfigError);
    expect(() => authConfig({ ...env, AUTH_SECRET: "short" })).toThrow(/32/);
    expect(cfg.allowed).toEqual(["karina@example.com", "other@example.com"]);
  });
});

describe("session cookie", () => {
  const session: Session = { accountId: "a", email: "karina@example.com", name: "Karina", accessToken: "A".repeat(3000), refreshToken: "R".repeat(2000), expiresAt: Date.now() + 3600_000 };

  it("round-trips encrypted, split over cookies, and rejects tampering or another secret", async () => {
    const sealed = await seal({ ...session }, SECRET, 3600);
    expect(sealed).not.toContain("karina@example.com");
    const cookies = sessionCookies(sealed);
    const set = cookies.filter((c) => c.value);
    expect(set.length).toBeGreaterThan(1);
    expect(cookies.filter((c) => !c.value).every((c) => c.maxAge === 0)).toBe(true); // stale chunks are cleared
    const jar = new Map(set.map((c) => [c.name, c.value]));
    const joined = joinSession((n) => jar.get(n));
    expect((await unseal<Session>(joined, SECRET))?.email).toBe("karina@example.com");
    expect(await unseal(joined, "y".repeat(40))).toBeNull();
    expect(await unseal(`${joined!.slice(0, -4)}AAAA`, SECRET)).toBeNull();
    expect(await unseal(null, SECRET)).toBeNull();
  });

  it("signing out clears every chunk", () => {
    expect(sessionCookies(null).every((c) => c.value === "" && c.maxAge === 0)).toBe(true);
  });
});

describe("Microsoft sign-in", () => {
  it("lets Karina in (PKCE verifier sent) and keeps everyone else out", async () => {
    const ok = tokenEndpoint({ access_token: "at", refresh_token: "rt", expires_in: 3600, id_token: idToken({ oid: "o1", email: "karina@example.com", name: "Karina" }) });
    const s = await signIn(cfg, "code", "verifier", "http://localhost:3000/api/auth/callback", ok.fetcher);
    expect(s).toMatchObject({ accountId: "o1", email: "karina@example.com", accessToken: "at", refreshToken: "rt" });
    expect(ok.seen[0].get("code_verifier")).toBe("verifier");
    expect(ok.seen[0].get("grant_type")).toBe("authorization_code");

    const stranger = tokenEndpoint({ access_token: "at", refresh_token: "rt", expires_in: 3600, id_token: idToken({ oid: "o2", preferred_username: "someone@outlook.com" }) });
    await expect(signIn(cfg, "code", "v", "http://x/cb", stranger.fetcher)).rejects.toBeInstanceOf(NotAllowedError);

    const refused = tokenEndpoint({ error: "invalid_grant", error_description: "AADSTS70008: The code has expired.\r\nTrace ID: …" }, 400);
    await expect(signIn(cfg, "code", "v", "http://x/cb", refused.fetcher)).rejects.toThrow("AADSTS70008: The code has expired.");
  });

  it("refreshes an expiring token and keeps the new refresh token", async () => {
    const s: Session = { accountId: "a", email: "k", name: "K", accessToken: "old", refreshToken: "r1", expiresAt: Date.now() + 60_000, folderId: "f" };
    expect(needsRefresh(s)).toBe(true);
    expect(needsRefresh({ ...s, expiresAt: Date.now() + 3600_000 })).toBe(false);
    const t = tokenEndpoint({ access_token: "new", refresh_token: "r2", expires_in: 3600 });
    const fresh = await refreshSession(cfg, s, t.fetcher);
    expect(fresh).toMatchObject({ accessToken: "new", refreshToken: "r2", folderId: "f" });
    expect(t.seen[0].get("refresh_token")).toBe("r1");
  });
});

describe("hold-out guard", () => {
  it("knows the test documents by content, not name", () => {
    expect(isHoldout(new TextEncoder().encode("any other file"))).toBe(false);
  });
});
