/**
 * Smoke test of the online mode (password sign-in + database storage), without a browser.
 *
 *   node scripts/e2e-online.mjs <sample.docx> --base http://localhost:3100   (password in env E2E_PASSWORD)
 *
 * Run against a production build started with DATABASE_URL=pglite:<folder>, APP_PASSWORD_HASH and AUTH_SECRET
 * (see CLAUDE.md). Removes the document it creates.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const sample = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");
const base = opt("--base", "http://localhost:3100");
const password = process.env.E2E_PASSWORD;
if (!sample || !password) throw new Error("usage: E2E_PASSWORD=… node scripts/e2e-online.mjs <sample.docx> [--base url]");

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
let cookie = "";
const get = (p, withCookie = true) => fetch(`${base}${p}`, { redirect: "manual", headers: withCookie && cookie ? { cookie } : {} });
const signIn = async (pw, ip) => {
  const body = new URLSearchParams({ password: pw, next: "/rules" });
  return fetch(`${base}/api/auth/login`, { method: "POST", body, redirect: "manual", headers: { "x-forwarded-for": ip } });
};

// 1. locked out without signing in
const page = await get("/", false);
check("pages ask for sign-in", page.status === 307 && (page.headers.get("location") ?? "").includes("/login"), `${page.status} ${page.headers.get("location")}`);
const api = await get("/api/jobs", false);
check("the API asks for sign-in too", [303, 307, 308].includes(api.status) && (api.headers.get("location") ?? "").includes("/login"), `${api.status}`);
const login = await get("/login", false);
check("sign-in page and app icon are open", login.status === 200 && (await get("/manifest.webmanifest", false)).status === 200);

// 2. wrong password, lockout after repeated tries (from one address only)
const wrong = await signIn("not the password", "203.0.113.9");
check("a wrong password is refused", wrong.status === 303 && (wrong.headers.get("location") ?? "").includes("error=wrong") && !wrong.headers.get("set-cookie"));
for (let i = 0; i < 4; i++) await signIn("still wrong", "203.0.113.9");
const locked = await signIn(password, "203.0.113.9");
check("after 5 wrong tries that address waits, even with the right password", (locked.headers.get("location") ?? "").includes("error=locked") && !locked.headers.get("set-cookie"));

// 3. sign in
const ok = await signIn(password, "198.51.100.7");
cookie = (ok.headers.get("set-cookie") ?? "").split(";")[0];
check("the right password signs in and returns to the page asked for", ok.status === 303 && (ok.headers.get("location") ?? "").endsWith("/rules") && cookie.startsWith("kp_session="));
const cookieFlags = (ok.headers.get("set-cookie") ?? "").toLowerCase();
check("the sign-in cookie is httpOnly, SameSite=Lax, 30 days", cookieFlags.includes("httponly") && cookieFlags.includes("samesite=lax") && cookieFlags.includes("max-age=2592000"));

// 4. use the app: upload, proofread (rules only, free), save a version, export, other pages
const form = new FormData();
form.append("files", new Blob([await readFile(sample)]), `Online Check ${Date.now().toString(36)}.docx`);
const up = await fetch(`${base}/api/jobs`, { method: "POST", body: form, headers: { cookie } });
const job = (await up.json()).created?.[0];
check("upload into the database", up.status === 201 && !!job, `${up.status}`);
try {
  const pr = await fetch(`${base}/api/jobs/${job.id}/proofread`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ai: false }) });
  const last = (await pr.text()).trim().split("\n").map((l) => JSON.parse(l)).at(-1);
  check("proofread (rules only) and its version are saved", !!last.done && last.job.versions.length === 2, last.error ?? `${last.job?.proofread?.changes.length} changes`);
  const v1 = new Uint8Array(await (await get(`/api/jobs/${job.id}/file?v=1`)).arrayBuffer());
  const sf = new FormData();
  sf.append("file", new Blob([v1]), "x.docx");
  sf.append("label", "Your edits");
  const saved = await (await fetch(`${base}/api/jobs/${job.id}/versions`, { method: "POST", body: sf, headers: { cookie } })).json();
  check("saving a version", saved.versions?.length === 3, `${saved.versions?.length}`);
  const dl = await get(`/api/jobs/${job.id}/file?v=${saved.current}&download=clean`);
  const name = decodeURIComponent((dl.headers.get("content-disposition") ?? "").split("filename*=UTF-8''")[1] ?? "");
  const bytes = new Uint8Array(await dl.arrayBuffer());
  check("export downloads the clean Word file with Karina's name", dl.ok && /^DONE_.+_clean\.docx$/.test(name) && bytes[0] === 0x50 && bytes[1] === 0x4b, name);
  const list = await (await get("/api/jobs")).json();
  check("the document list comes from the database", list.some((j) => j.id === job.id));
  const pages = await Promise.all(["/", "/rules", "/costs", "/settings", `/jobs/${job.id}`].map(async (p) => [p, (await get(p)).status]));
  check("every page opens when signed in", pages.every(([, s]) => s === 200), pages.map(([p, s]) => `${p} ${s}`).join(", "));
  const rules = await (await get("/api/rules")).json();
  check("rules load (bundled defaults until saved online)", rules.rules?.custom?.length > 0);
} finally {
  if (job) {
    const del = await (await fetch(`${base}/api/jobs/${job.id}`, { method: "DELETE", headers: { cookie } })).json();
    if (del.trashed) await fetch(`${base}/api/trash/${encodeURIComponent(del.trashed)}`, { method: "DELETE", headers: { cookie } });
  }
}

// 5. sign out
const out = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie }, redirect: "manual" });
check("sign out clears the cookie", out.status === 303 && /kp_session=;/.test(out.headers.get("set-cookie") ?? "") && (out.headers.get("location") ?? "").includes("signedOut"));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} online checks passed (${path.basename(sample)} test copy removed).`);
process.exit(failed ? 1 : 0);
