/** Delete every job in the running local app (test clean-up). node scripts/clear-jobs.mjs [--base http://localhost:3000] */
const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3000";
const jobs = await (await fetch(`${base}/api/jobs`)).json();
for (const j of jobs) await fetch(`${base}/api/jobs/${j.id}`, { method: "DELETE" });
console.log(`deleted ${jobs.length} job(s)`);
