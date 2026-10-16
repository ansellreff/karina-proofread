/**
 * After a push: wait until the online app runs the code just pushed, and say clearly if Vercel did not update
 * (run by push.bat). Vercel normally redeploys by itself on every push; this catches a failed or skipped deploy.
 *
 *   node web/scripts/vercel-check.mjs [app address]   (default: https://karina-proofread.vercel.app)
 */
import { execFileSync } from "node:child_process";

const app = (process.argv[2] ?? process.env.APP_URL ?? "https://karina-proofread.vercel.app").replace(/\/+$/, "");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const short = head.slice(0, 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\nWaiting for ${app} to run the new version (${short})…`);
const until = Date.now() + 5 * 60 * 1000;
let last = null;
while (Date.now() < until) {
  try {
    const res = await fetch(`${app}/api/version`, { cache: "no-store" });
    last = res.ok ? await res.json() : { status: res.status };
    if (last.commit === head) {
      console.log(`\nVercel is up to date: the online app runs ${short}.`);
      if (last.database === "missing") console.log("BUT the database isn't connected: Vercel → your project → Storage → connect Neon, then Deployments → Redeploy.");
      process.exit(0);
    }
  } catch {
    last = { status: "no answer" };
  }
  process.stdout.write(".");
  await sleep(10_000);
}

console.log(`

==================== REMINDER: UPDATE VERCEL ====================
The code is on GitHub, but the online app has not picked it up after 5 minutes
(it runs ${last?.commit ? String(last.commit).slice(0, 7) : "an older version"}).

  1. Open https://vercel.com → karina-proofread → Deployments.
  2. Look at the top deployment:
     - "Building": wait a minute, then open the app again.
     - "Error": click it to see why, and tell Claude what it says.
     - Missing or older: press ⋯ → Redeploy on the newest one.
  3. If you changed anything in Settings → Environment Variables,
     you must Redeploy for it to take effect.
=================================================================
`);
process.exit(2);
