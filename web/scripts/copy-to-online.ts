/**
 * One-time copy of this computer's app data into the online database: documents (every version, PDFs as sent),
 * Recently deleted, settings, AI usage, learning data and approved AI examples (web/.data), plus Karina's rules and
 * AI rulebook (web/prompts → settings/). Files already online are never overwritten; the local copy stays.
 *
 *   $env:DATABASE_URL = "<from Vercel → Storage → Neon → .env.local tab>"; npx tsx scripts/copy-to-online.ts; Remove-Item Env:DATABASE_URL
 *   (add --dry-run to only count)
 */
import { promptsDir } from "../src/lib/rules/config-store";
import { readText, type AppFiles } from "../src/lib/storage/files";
import { FsFiles } from "../src/lib/storage/fs-files";
import { localDataDir } from "../src/lib/storage/local";
import { neonQuery, PgFiles, pgliteQuery } from "../src/lib/storage/pg-files";

interface Report {
  files: number;
  copied: number;
  skipped: number;
  bytes: number;
}

async function copyTree(from: AppFiles, to: AppFiles, dir: string, r: Report, dry: boolean): Promise<void> {
  const [local, remote] = await Promise.all([from.list(dir), to.list(dir)]);
  const there = new Set(remote.filter((f) => !f.folder).map((f) => f.name));
  for (const f of local) {
    const path = dir ? `${dir}/${f.name}` : f.name;
    if (f.folder) {
      await copyTree(from, to, path, r, dry);
      continue;
    }
    if (path === "jobs/index.json" || path.startsWith("auth/")) continue; // rebuilt online / not data
    r.files++;
    if (there.has(f.name)) {
      r.skipped++;
      continue;
    }
    const data = await from.read(path);
    if (!data) continue;
    if (!dry) await to.write(path, data);
    r.copied++;
    r.bytes += data.byteLength;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL to the online database first (see the comment at the top of this script).");
    process.exit(1);
  }
  const dry = process.argv.includes("--dry-run");
  const online = new PgFiles(url.startsWith("pglite:") ? await pgliteQuery(url.slice(7) || undefined) : await neonQuery(url));
  const report: Report = { files: 0, copied: 0, skipped: 0, bytes: 0 };
  await copyTree(new FsFiles(localDataDir()), online, "", report, dry);
  const prompts = new FsFiles(promptsDir());
  const settings = new Set((await online.list("settings")).map((f) => f.name));
  for (const name of ["karina-rules.json", "karina-style-guide.md"]) {
    report.files++;
    if (settings.has(name)) {
      report.skipped++;
      continue;
    }
    const text = await readText(prompts, name);
    if (text === null) continue;
    if (!dry) await online.write(`settings/${name}`, text);
    report.copied++;
    report.bytes += Buffer.byteLength(text);
  }
  if (!dry) await online.remove("jobs/index.json"); // the document list is rebuilt from the copied documents
  // check: every local file is now online with the same size
  let missing = 0;
  if (!dry) {
    const local = new FsFiles(localDataDir());
    const walk = async (dir: string): Promise<void> => {
      const [l, o] = await Promise.all([local.list(dir), online.list(dir)]);
      const sizes = new Map(o.map((f) => [f.name, f.size]));
      for (const f of l) {
        const p = dir ? `${dir}/${f.name}` : f.name;
        if (f.folder) await walk(p);
        else if (p !== "jobs/index.json" && !p.startsWith("auth/") && sizes.get(f.name) === undefined) missing++;
      }
    };
    await walk("");
  }
  console.log(`${dry ? "Would copy" : "Copied"} ${report.copied} of ${report.files} files (${(report.bytes / 1024 / 1024).toFixed(1)} MB); ${report.skipped} were online already.`);
  if (!dry) console.log(missing ? `WARNING: ${missing} files are not online.` : "Checked: every local file is online.");
  process.exit(missing ? 1 : 0); // the database client would otherwise keep the process open
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
