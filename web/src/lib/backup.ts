/**
 * One-file backup of everything the app keeps, and putting it back (Settings → Backup).
 *
 * The file is a zip (`KarinaProofread-backup-<date>.zip`):
 *   manifest.json                what is inside (counts, dates) — read by the page before restoring
 *   data/jobs/<id>/…             every document with all its versions (and the student's PDF)
 *   data/learning/…              what the bot learned from her reviews
 *   data/settings.json, data/usage/…, data/usage.jsonl   app settings and the AI cost history
 *   config/karina-rules.json, config/karina-style-guide.md   her review rules and AI rulebook
 * Not included: Recently deleted, the AI-password lock state, the Documents index (rebuilt on restore).
 *
 * Restoring only ADDS what is missing (a document already in the app, or in Recently deleted, is left alone), so an
 * old backup can never overwrite newer work. Rules, rulebook and settings are put back only when asked.
 */
import JSZip from "jszip";
import type { FileInfo, AppFiles } from "./storage/files";
import type { Stores } from "./storage/local";

export const BACKUP_FORMAT = "karina-proofread-backup";
export const BACKUP_VERSION = 1;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  from: Stores["mode"];
  documents: { id: string; studentName: string | null; docType: string; fileName: string; updatedAt: string }[];
  counts: { documents: number; files: number; learning: number; bytes: number };
}

export interface RestoreResult {
  documentsAdded: number;
  /** Already in the app (or in Recently deleted): left as they are. */
  documentsSkipped: number;
  learningAdded: number;
  /** Rules, rulebook and settings put back (only when asked). */
  settingsRestored: boolean;
}

/** Every file under `dir` (paths relative to the root), with sizes. */
export async function listAll(files: AppFiles, dir = ""): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  const walk = async (d: string) => {
    const entries: FileInfo[] = await files.list(d);
    for (const e of entries) {
      const p = d ? `${d}/${e.name}` : e.name;
      if (e.folder) await walk(p);
      else out.push({ path: p, size: e.size });
    }
  };
  await walk(dir);
  return out;
}

/** Kept out of backups: deleted documents, the AI-password lock, the rebuilt index, and online copies of the rules. */
const SKIP = [/^trash\//, /^ai\//, /^auth\//, /^jobs\/index\.json$/, /^settings\//, /^learning\//];

/** How much the app stores now (Settings → Backup and storage). */
export async function storageSummary(s: Stores) {
  const all = await listAll(s.data);
  const sum = (re: RegExp) => all.filter((f) => re.test(f.path)).reduce((n, f) => n + f.size, 0);
  return {
    bytes: all.reduce((n, f) => n + f.size, 0),
    documentsBytes: sum(/^jobs\//),
    trashBytes: sum(/^trash\//),
    documents: (await s.jobs.list()).length,
    trash: await s.jobs.trashCount(),
  };
}

/** Build the backup zip. */
export async function createBackup(s: Stores): Promise<{ zip: JSZip; manifest: BackupManifest }> {
  const zip = new JSZip();
  let bytes = 0;
  let files = 0;
  for (const f of await listAll(s.data)) {
    if (SKIP.some((re) => re.test(f.path))) continue;
    const data = await s.data.read(f.path);
    if (!data) continue;
    zip.file(`data/${f.path}`, data);
    bytes += data.byteLength;
    files++;
  }
  // learning lives in its own folder (locally it can be elsewhere): read it through its store
  let learning = 0;
  for (const f of await listAll(s.learn.files)) {
    const data = await s.learn.files.read(f.path);
    if (!data) continue;
    zip.file(`data/learning/${f.path}`, data);
    bytes += data.byteLength;
    files++;
    if (LEARN_RECORD.test(f.path)) learning++;
  }
  zip.file("config/karina-rules.json", JSON.stringify(await s.config.loadRules(), null, 2) + "\n");
  zip.file("config/karina-style-guide.md", await s.config.styleGuide());
  const jobs = await s.jobs.list();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    from: s.mode,
    documents: jobs.map((j) => ({ id: j.id, studentName: j.studentName, docType: j.docType, fileName: j.fileName, updatedAt: j.updatedAt })),
    counts: { documents: jobs.length, files, learning, bytes },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 1));
  return { zip, manifest };
}

/** Read and check a backup's manifest (throws a readable message when the file isn't one of this app's backups). */
export async function readManifest(zip: JSZip): Promise<BackupManifest> {
  const text = await zip.file("manifest.json")?.async("string");
  const m = text ? (JSON.parse(text) as BackupManifest) : null;
  if (!m || m.format !== BACKUP_FORMAT) throw new Error("This file isn't a Karina Proofread backup.");
  if (m.version > BACKUP_VERSION) throw new Error("This backup was made by a newer version of the app. Update the app first.");
  return m;
}

const JOB_FILE = /^data\/jobs\/([a-f0-9-]{36})\/(.+)$/;
/** One learned document (lib/learn/store.ts: records/<id>.json). */
const LEARN_RECORD = /^records\/[^/]+\.json$/;

/** Put a backup back. Only adds what is missing; `settings` also puts back rules, rulebook and settings. */
export async function restoreBackup(s: Stores, input: Uint8Array, opts: { settings?: boolean } = {}): Promise<RestoreResult> {
  const zip = await JSZip.loadAsync(input);
  await readManifest(zip);
  const result: RestoreResult = { documentsAdded: 0, documentsSkipped: 0, learningAdded: 0, settingsRestored: false };

  // documents: whole documents only, and only those not here already (nor in Recently deleted)
  const present = new Set((await s.jobs.list()).map((j) => j.id));
  for (const t of await s.data.list("trash")) present.add(t.name.slice(0, 36));
  const byJob = new Map<string, JSZip.JSZipObject[]>();
  zip.forEach((path, f) => {
    const m = JOB_FILE.exec(path);
    if (m && !f.dir) byJob.set(m[1], [...(byJob.get(m[1]) ?? []), f]);
  });
  for (const [id, entries] of byJob) {
    if (present.has(id) || !entries.some((e) => e.name.endsWith("/meta.json"))) {
      result.documentsSkipped++;
      continue;
    }
    for (const e of entries) await s.data.write(e.name.slice("data/".length), await e.async("uint8array"));
    result.documentsAdded++;
  }
  if (result.documentsAdded) await s.jobs.reindex();

  // learning: records not here yet (her approvals/dismissals, state.json, only with the settings)
  for (const e of Object.values(zip.files)) {
    if (e.dir || !e.name.startsWith("data/learning/")) continue;
    const rel = e.name.slice("data/learning/".length);
    const isRecord = LEARN_RECORD.test(rel);
    if (!isRecord && !opts.settings) continue;
    if (isRecord && (await s.learn.files.read(rel))) continue;
    await s.learn.files.write(rel, await e.async("uint8array"));
    if (isRecord) result.learningAdded++;
  }

  // AI cost history: merge, never lose a line
  for (const e of Object.values(zip.files)) {
    if (e.dir || !/^data\/(usage\/\d{4}-\d{2}\.jsonl|usage\.jsonl)$/.test(e.name)) continue;
    const rel = e.name.slice("data/".length);
    const mine = new TextDecoder().decode((await s.data.read(rel)) ?? new Uint8Array());
    const lines = new Set(mine.split("\n").filter(Boolean));
    const before = lines.size;
    for (const l of (await e.async("string")).split("\n").filter(Boolean)) lines.add(l);
    if (lines.size > before) await s.data.write(rel, [...lines].sort().join("\n") + "\n"); // untouched when nothing is new
  }

  if (opts.settings) {
    const settings = zip.file("data/settings.json");
    if (settings) await s.data.write("settings.json", await settings.async("uint8array"));
    const rules = await zip.file("config/karina-rules.json")?.async("string");
    if (rules) await s.config.saveRules(JSON.parse(rules));
    const guide = await zip.file("config/karina-style-guide.md")?.async("string");
    if (guide) await s.config.saveStyleGuide(guide);
    result.settingsRestored = true;
  }
  return result;
}

/** The download name: KarinaProofread-backup-2026-10-21.zip */
export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `KarinaProofread-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`;
}

