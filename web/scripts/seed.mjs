/** Upload documents to the running app and proofread them. node scripts/seed.mjs <file.docx>... [--ai] [--base http://localhost:3000] */
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ai = args.includes("--ai");
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");
for (const f of files) {
  const form = new FormData();
  form.append("files", new Blob([await readFile(f)]), path.basename(f));
  const up = await (await fetch(`${base}/api/jobs`, { method: "POST", body: form })).json();
  const job = up.created?.[0];
  if (!job) {
    console.error(path.basename(f), up.errors ?? up.error);
    continue;
  }
  const res = await fetch(`${base}/api/jobs/${job.id}/proofread`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai }) });
  const last = JSON.parse((await res.text()).trim().split("\n").at(-1));
  console.log(job.id, path.basename(f), last.error ?? `${last.job.proofread.changes.length} changes${last.job.proofread.costUsd ? `, US$${last.job.proofread.costUsd.toFixed(2)}` : ""}`);
}
