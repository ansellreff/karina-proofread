/** Microsoft sign-in (OAuth 2.0 authorization code flow with PKCE, confidential client). Server only. */
import { decodeJwt } from "jose";
import { AUTHORITY, SCOPES, type AuthConfig } from "./config";
import type { Session } from "./session";

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

export const randomState = () => b64url(crypto.getRandomValues(new Uint8Array(16)));

/** Where Microsoft sends Karina back (must be listed in the app registration). */
export const callbackUrl = (request: Request, appUrl: string | null) => `${appUrl ?? new URL(request.url).origin}/api/auth/callback`;

export function authorizeUrl(cfg: AuthConfig, redirectUri: string, state: string, challenge: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTHORITY}/authorize?${q}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

export class SignInError extends Error {}

async function token(cfg: AuthConfig, body: Record<string, string>, fetcher: typeof fetch): Promise<TokenResponse> {
  const res = await fetcher(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: SCOPES, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new SignInError(json.error_description?.split("\r\n")[0] ?? json.error ?? `Sign-in failed (${res.status}).`);
  return json;
}

/** Exchange the code from Microsoft's redirect for tokens, and check the account is allowed. */
export async function signIn(cfg: AuthConfig, code: string, verifier: string, redirectUri: string, fetcher: typeof fetch = fetch): Promise<Session> {
  const t = await token(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }, fetcher);
  if (!t.id_token || !t.refresh_token) throw new SignInError("Microsoft did not return a complete sign-in.");
  // the ID token comes straight from Microsoft's token endpoint over TLS (not from the browser), so its claims are trusted
  const claims = decodeJwt(t.id_token) as { oid?: string; sub?: string; email?: string; preferred_username?: string; name?: string };
  const email = (claims.email ?? claims.preferred_username ?? "").toLowerCase();
  if (!email || !cfg.allowed.includes(email)) throw new NotAllowedError(email);
  return {
    accountId: claims.oid ?? claims.sub ?? email,
    email,
    name: claims.name ?? email,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
}

export class NotAllowedError extends SignInError {
  constructor(readonly email: string) {
    super("This app is private: only its owner can sign in.");
  }
}

/** A fresh access token (Microsoft rotates the refresh token too). */
export async function refreshSession(cfg: AuthConfig, s: Session, fetcher: typeof fetch = fetch): Promise<Session> {
  const t = await token(cfg, { grant_type: "refresh_token", refresh_token: s.refreshToken }, fetcher);
  return { ...s, accessToken: t.access_token, refreshToken: t.refresh_token ?? s.refreshToken, expiresAt: Date.now() + t.expires_in * 1000 };
}

/** Refresh when the access token has less than 5 minutes left. */
export const needsRefresh = (s: Session, now = Date.now()) => s.expiresAt - now < 5 * 60 * 1000;
