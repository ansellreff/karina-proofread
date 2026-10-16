/**
 * Remove specific jobs from the running local app (test clean-up). Deleted jobs go to web/.data/trash/.
 *
 *   node scripts/clear-jobs.mjs <jobId> [<jobId> ...] [--base http://localhost:3000]
 *
 * Without ids it only lists the jobs: there is deliberately no "delete everything" (Karina's own uploads live here too).
 */
const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");
const jobs = await (await fetch(`${base}/api/jobs`)).json();
if (!ids.length) {
  for (const j of jobs) console.log(`${j.id}  ${j.status.padEnd(12)} ${j.updatedAt}  ${j.fileName}`);
  console.log(`\n${jobs.length} job(s). Pass the ids to remove.`);
} else {
  for (const id of ids) {
    const res = await fetch(`${base}/api/jobs/${id}`, { method: "DELETE" });
    console.log(`${id}: ${res.ok ? "moved to trash" : `not removed (${res.status})`}`);
  }
}
