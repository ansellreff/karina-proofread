/**
 * One-time copy of what the app kept on this computer (web/.data, plus the rules and AI rulebook in web/prompts)
 * into OneDrive's App data. Files already in OneDrive are never overwritten; the local copy is left untouched.
 */
import { existsSync } from "node:fs";
import type { AppFiles } from "../storage/files";
import { FsFiles } from "../storage/fs-files";
import { localDataDir } from "../storage/local";
import { promptsDir } from "../rules/config-store";

export interface CopyReport {
  files: number;
  copied: number;
  skipped: number;
  bytes: number;
}

export const hasLocalData = () => !process.env.VERCEL && existsSync(localDataDir());

async function copyTree(from: AppFiles, to: AppFiles, dir: string, report: CopyReport): Promise<void> {
  const [local, remote] = await Promise.all([from.list(dir), to.list(dir)]);
  const there = new Set(remote.filter((f) => !f.folder).map((f) => f.name));
  for (const f of local) {
    const path = dir ? `${dir}/${f.name}` : f.name;
    if (f.folder) {
      await copyTree(from, to, path, report);
      continue;
    }
    report.files++;
    if (there.has(f.name)) {
      report.skipped++;
      continue;
    }
    const data = await from.read(path);
    if (!data) continue;
    await to.write(path, data);
    report.copied++;
    report.bytes += data.byteLength;
  }
}

/** @param appData OneDrive's App data folder (stores().data online) */
export async function copyLocalToOneDrive(appData: AppFiles): Promise<CopyReport> {
  if (appData.kind !== "onedrive") throw new Error("Connect OneDrive first.");
  if (!hasLocalData()) throw new Error("There is no local data on this computer.");
  const report: CopyReport = { files: 0, copied: 0, skipped: 0, bytes: 0 };
  await copyTree(new FsFiles(localDataDir()), appData, "", report);
  // Karina's rules and rulebook, as saved on this computer
  const prompts = new FsFiles(promptsDir());
  const settings = await appData.list("settings");
  for (const name of ["karina-rules.json", "karina-style-guide.md"]) {
    report.files++;
    if (settings.some((f) => f.name === name)) {
      report.skipped++;
      continue;
    }
    const data = await prompts.read(name);
    if (!data) continue;
    await appData.write(`settings/${name}`, data);
    report.copied++;
    report.bytes += data.byteLength;
  }
  // the document list is rebuilt from the copied documents on the next visit
  await appData.remove("jobs/index.json");
  return report;
}
