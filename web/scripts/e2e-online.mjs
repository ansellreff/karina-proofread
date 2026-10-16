/**
 * Smoke test of the online mode (database storage), without a browser.
 *
 *   node scripts/e2e-online.mjs <sample.docx> --base http://localhost:3100
 *
 * Run against a production build started with DATABASE_URL=pglite:<folder> (see CLAUDE.md), or against the live
 * app. Removes the document it creates.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const sample = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");
const base = opt("--base", "http://localhost:3100");
if (!sample) throw new Error("usage: node scripts/e2e-online.mjs <sample.docx> [--base url]");

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const get = (p) => fetch(`${base}${p}`, { redirect: "manual" });

const version = await (await get("/api/version")).json();
check("the app is up and the database is connected", version.database === "connected", JSON.stringify(version));

const form = new FormData();
form.append("files", new Blob([await readFile(sample)]), `Online Check ${Date.now().toString(36)}.docx`);
const up = await fetch(`${base}/api/jobs`, { method: "POST", body: form });
const job = (await up.json()).created?.[0];
check("upload into the database", up.status === 201 && !!job, `${up.status}`);
try {
  const pr = await fetch(`${base}/api/jobs/${job.id}/proofread`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai: false }) });
  const last = (await pr.text()).trim().split("\n").map((l) => JSON.parse(l)).at(-1);
  check("proofread (rules only) and its version are saved", !!last.done && last.job.versions.length === 2, last.error ?? `${last.job?.proofread?.changes.length} changes`);
  const v1 = new Uint8Array(await (await get(`/api/jobs/${job.id}/file?v=1`)).arrayBuffer());
  const sf = new FormData();
  sf.append("file", new Blob([v1]), "x.docx");
  sf.append("label", "Your edits");
  const saved = await (await fetch(`${base}/api/jobs/${job.id}/versions`, { method: "POST", body: sf })).json();
  check("saving a version", saved.versions?.length === 3, `${saved.versions?.length}`);
  const dl = await get(`/api/jobs/${job.id}/file?v=${saved.current}&download=clean`);
  const name = decodeURIComponent((dl.headers.get("content-disposition") ?? "").split("filename*=UTF-8''")[1] ?? "");
  const bytes = new Uint8Array(await dl.arrayBuffer());
  check("export downloads the clean Word file with Karina's name", dl.ok && /^DONE_.+_clean\.docx$/.test(name) && bytes[0] === 0x50 && bytes[1] === 0x4b, name);
  const list = await (await get("/api/jobs")).json();
  check("the document list comes from the database", list.some((j) => j.id === job.id));
  const pages = await Promise.all(["/", "/rules", "/costs", "/settings", `/jobs/${job.id}`].map(async (p) => [p, (await get(p)).status]));
  check("every page opens", pages.every(([, s]) => s === 200), pages.map(([p, s]) => `${p} ${s}`).join(", "));
  const rules = await (await get("/api/rules")).json();
  check("rules load", rules.rules?.custom?.length > 0);
} finally {
  if (job) {
    const del = await (await fetch(`${base}/api/jobs/${job.id}`, { method: "DELETE" })).json();
    if (del.trashed) await fetch(`${base}/api/trash/${encodeURIComponent(del.trashed)}`, { method: "DELETE" });
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} online checks passed (${path.basename(sample)} test copy removed).`);
process.exit(failed ? 1 : 0);
