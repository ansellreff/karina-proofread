import { randomUUID } from "node:crypto";
import { acceptAllRevisions } from "../docx/accept";
import { DocxPackage } from "../docx/package";
import { bodyParagraphs } from "../docx/paragraphs";
import { DEFAULT_FILE_NAME, normalizeFormat, OLD_DEFAULT_FILE_NAME } from "../naming";
import { pdfToDocx } from "../pdf/pdf-to-docx";
import { buildContext, detectName } from "../rules/detect";
import { readJson, readText, writeJson, type AppFiles } from "../storage/files";
import { DEFAULT_SETTINGS, TRASH_DAYS, type Job, type JobStore, type Settings, type TrashEntry, type UsageEntry, type Version } from "./types";

/** A proofread cut off before it finished (a server function can be stopped) is treated as not started. */
const STALLED_MS = 6 * 60 * 1000;

const ID = /^[a-f0-9-]{36}$/;
const ENTRY = /^([a-f0-9-]{36})_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;
const DAY = 86_400_000;
/** When a trash entry ("<id>_<time>") was deleted, as an ISO date (null: not a trash entry). */
function trashDate(entry: string): string | null {
  const m = ENTRY.exec(entry);
  return m ? `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z` : null;
}

/**
 * Jobs kept as files (a local folder or OneDrive):
 *   jobs/<id>/meta.json, v0.docx, v1.docx, … (source.pdf when the student sent a PDF)
 *   jobs/index.json        job summaries for the Documents page (rebuilt when missing)
 *   trash/<id>_<time>/     deleted jobs (restorable)
 *   settings.json, usage/<yyyy-mm>.jsonl
 */
export class FileJobStore implements JobStore {
  constructor(readonly files: AppFiles) {}

  private dir(id: string) {
    if (!ID.test(id)) throw new Error("invalid job id");
    return `jobs/${id}`;
  }

  private normalize(job: Job): Job {
    if (job.status === "proofreading" && Date.now() - Date.parse(job.updatedAt) > STALLED_MS) job.status = job.versions.length > 1 ? "ready" : "new";
    // an older guess took the submission date for the name ("Study Plan_Ruddy_20261005" -> "20261005"); guess again
    if (job.studentName && NOT_A_NAME.test(job.studentName.trim())) job.studentName = guessNameFromFile(job.fileName);
    return job;
  }

  /** What the Documents page needs: the job without its long change list. */
  private summary(job: Job): Job {
    if (!job.proofread) return job;
    return { ...job, proofread: { ...job.proofread, changeCount: job.proofread.changes.length, changes: [], dropped: undefined } };
  }

  private async readIndex(): Promise<Record<string, Job> | null> {
    return readJson<Record<string, Job>>(this.files, "jobs/index.json");
  }

  private async updateIndex(fn: (index: Record<string, Job>) => void): Promise<void> {
    const index = (await this.readIndex()) ?? (await this.rebuildIndex());
    fn(index);
    await writeJson(this.files, "jobs/index.json", index);
  }

  private async rebuildIndex(): Promise<Record<string, Job>> {
    const index: Record<string, Job> = {};
    const dirs = (await this.files.list("jobs")).filter((f) => f.folder && ID.test(f.name));
    const jobs = await Promise.all(dirs.map((d) => readJson<Job>(this.files, `jobs/${d.name}/meta.json`)));
    for (const j of jobs) if (j) index[j.id] = this.summary(j);
    return index;
  }

  async list(): Promise<Job[]> {
    let index = await this.readIndex();
    if (!index) {
      index = await this.rebuildIndex();
      if (Object.keys(index).length) await writeJson(this.files, "jobs/index.json", index);
    }
    return Object.values(index).map((j) => this.normalize(j)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Job | null> {
    if (!ID.test(id)) return null;
    const job = await readJson<Job>(this.files, `${this.dir(id)}/meta.json`);
    return job ? this.normalize(job) : null;
  }

  async create(uploadName: string, upload: Uint8Array, source: Job["source"] = "upload"): Promise<Job> {
    const id = randomUUID();
    // a PDF is converted to Word first; the PDF itself is kept as the student sent it
    const isPdf = new TextDecoder().decode(upload.slice(0, 5)) === "%PDF-";
    const converted = isPdf ? await pdfToDocx(upload) : null;
    const data = converted ? converted.docx : upload;
    const fileName = converted ? uploadName.replace(/\.pdf$/i, "") + ".docx" : uploadName;
    const pkg = await DocxPackage.load(data);
    const doc = await pkg.xml("word/document.xml");
    if (!doc) throw new Error("This file is not a Word document (.docx).");
    acceptAllRevisions(doc);
    const ctx = buildContext(fileName, bodyParagraphs(doc));
    const now = new Date().toISOString();
    const job: Job = {
      id,
      fileName,
      docType: ctx.docType,
      studentName: detectName(ctx) ?? guessNameFromFile(fileName),
      status: "new",
      source,
      createdAt: now,
      updatedAt: now,
      versions: [{ n: 0, label: converted ? "Original (converted from PDF)" : "Original (as received)", kind: "original", createdAt: now }],
      current: 0,
      ...(converted ? { sourceFile: { name: uploadName, kind: "pdf" as const, notes: converted.notes } } : {}),
    };
    if (converted) await this.files.write(`${this.dir(id)}/source.pdf`, upload);
    await this.files.write(`${this.dir(id)}/v0.docx`, data);
    await this.save(job);
    return job;
  }

  async save(job: Job): Promise<void> {
    await writeJson(this.files, `${this.dir(job.id)}/meta.json`, job);
    await this.updateIndex((index) => {
      index[job.id] = this.summary(job);
    });
  }

  /** Deleting moves the document to trash/ (never erased), so it can be restored. Returns the trash entry. */
  async remove(id: string): Promise<string | null> {
    const entry = `${id}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
    if (!(await this.files.move(this.dir(id), `trash/${entry}`))) return null;
    await this.updateIndex((index) => {
      delete index[id];
    });
    return entry;
  }

  /** Recently deleted documents, newest first (those older than TRASH_DAYS are deleted forever first). */
  async listTrash(now = Date.now()): Promise<TrashEntry[]> {
    await this.purgeExpired(now);
    const out: TrashEntry[] = [];
    for (const f of await this.files.list("trash")) {
      const deletedAt = trashDate(f.name);
      if (!deletedAt || !f.folder) continue;
      const job = await readJson<Job>(this.files, `trash/${f.name}/meta.json`);
      if (job) out.push({ entry: f.name, deletedAt, expiresAt: new Date(Date.parse(deletedAt) + TRASH_DAYS * DAY).toISOString(), job });
    }
    return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  /** How many documents are in Recently deleted. */
  async trashCount(): Promise<number> {
    return (await this.files.list("trash")).filter((f) => f.folder && trashDate(f.name)).length;
  }

  /** Delete forever what has been in Recently deleted for TRASH_DAYS days. Returns how many. */
  async purgeExpired(now = Date.now()): Promise<number> {
    let n = 0;
    for (const f of await this.files.list("trash")) {
      const deletedAt = trashDate(f.name);
      if (deletedAt && now - Date.parse(deletedAt) >= TRASH_DAYS * DAY && (await this.files.remove(`trash/${f.name}`))) n++;
    }
    return n;
  }

  /** Delete one deleted document forever. */
  async purge(entry: string): Promise<void> {
    if (!ENTRY.test(entry)) throw new Error("Unknown deleted document.");
    await this.files.remove(`trash/${entry}`);
  }

  /** Empty Recently deleted. Returns how many documents were deleted forever. */
  async emptyTrash(): Promise<number> {
    const n = await this.trashCount();
    await this.files.remove("trash");
    return n;
  }

  /**
   * Free up space: every document and everything in Recently deleted, deleted forever. Rules, rulebook, learning,
   * settings and the AI cost history stay. Returns how many documents there were.
   */
  async removeAllForever(): Promise<number> {
    const n = (await this.list()).length + (await this.trashCount());
    await this.files.remove("jobs");
    await this.files.remove("trash");
    return n;
  }

  /** Rebuild the Documents page index from the documents themselves (after a restore from a backup). */
  async reindex(): Promise<void> {
    await writeJson(this.files, "jobs/index.json", await this.rebuildIndex());
  }

  /** Put a deleted document back. */
  async restore(entry: string): Promise<Job> {
    const m = ENTRY.exec(entry);
    if (!m) throw new Error("Unknown deleted document.");
    const id = m[1];
    if (await this.get(id)) throw new Error("This document is already in the list.");
    if (!(await this.files.move(`trash/${entry}`, this.dir(id)))) throw new Error("Unknown deleted document.");
    const job = (await this.get(id))!;
    await this.updateIndex((index) => {
      index[id] = this.summary(job);
    });
    return job;
  }

  /** The PDF exactly as the student sent it (documents converted from PDF). */
  async readSource(id: string): Promise<Uint8Array> {
    const data = await this.files.read(`${this.dir(id)}/source.pdf`);
    if (!data) throw new Error("The original PDF is missing.");
    return data;
  }

  async readVersion(id: string, n: number): Promise<Uint8Array> {
    const data = await this.files.read(`${this.dir(id)}/v${n}.docx`);
    if (!data) throw new Error(`Version ${n} is missing.`);
    return data;
  }

  async addVersion(id: string, data: Uint8Array, v: Omit<Version, "n" | "createdAt">, opts: { rolling?: boolean } = {}): Promise<Job> {
    const job = await this.get(id);
    if (!job) throw new Error("job not found");
    const last = job.versions[job.versions.length - 1];
    if (opts.rolling && last.kind === "edit" && last.label === v.label && last.n === job.current) {
      // autosave keeps updating one draft version instead of piling up new ones
      await this.files.write(`${this.dir(id)}/v${last.n}.docx`, data);
      last.createdAt = job.updatedAt = new Date().toISOString();
      await this.save(job);
      return job;
    }
    const n = Math.max(...job.versions.map((x) => x.n)) + 1;
    await this.files.write(`${this.dir(id)}/v${n}.docx`, data);
    const now = new Date().toISOString();
    job.versions.push({ ...v, n, createdAt: now });
    job.current = n;
    job.updatedAt = now;
    await this.save(job);
    return job;
  }

  async getSettings(): Promise<Settings> {
    const s: Settings = { ...DEFAULT_SETTINGS, ...((await readJson<Partial<Settings>>(this.files, "settings.json")) ?? {}) };
    // the old default order (DONE_name_type_date) moved to DONE_type_name_date; a format she customised is kept
    if (JSON.stringify(normalizeFormat(s.fileName)) === JSON.stringify(OLD_DEFAULT_FILE_NAME)) s.fileName = DEFAULT_FILE_NAME;
    return s;
  }

  async saveSettings(s: Settings): Promise<void> {
    await writeJson(this.files, "settings.json", s);
  }

  /** Add one AI run to this month's usage file (cost tracker). */
  async logUsage(entry: UsageEntry): Promise<void> {
    const file = `usage/${entry.at.slice(0, 7)}.jsonl`;
    const before = (await readText(this.files, file)) ?? "";
    await this.files.write(file, `${before}${JSON.stringify(entry)}\n`);
  }

  async usage(): Promise<UsageEntry[]> {
    const parse = (text: string | null) => (text ?? "").split("\n").filter(Boolean).map((l) => JSON.parse(l) as UsageEntry);
    const months = (await this.files.list("usage")).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f.name)).map((f) => f.name).sort();
    const rows = [...parse(await readText(this.files, "usage.jsonl"))]; // the log from before monthly files
    for (const m of months) rows.push(...parse(await readText(this.files, `usage/${m}`)));
    return rows.sort((a, b) => a.at.localeCompare(b.at));
  }

  async spendSince(since: string | null): Promise<number> {
    return (await this.usage()).filter((u) => !since || u.at >= since).reduce((n, u) => n + u.costUsd, 0);
  }
}

/** Parts of a file name that are never the student's name: dates and numbers, and words like DONE or V2. */
const NOT_A_NAME = /^(?:[\d\s.\-/]+|done|final|revised?|rev\d*|v\d+|draft|copy)$/i;
const DOC_TYPE = /study ?plan|autobio|statement|essay|resume|curriculum|recommendation|script|personal|motivation|cover ?letter|portfolio|\b(?:cv|sop|ps|lor)\b/i;

/**
 * The student's name from the file name, when the document doesn't say it:
 * "StudyPlan_(SINTA) NYUST.docx" -> "SINTA"; "Sinta_Autobiography.docx" -> "Sinta";
 * "Study Plan_Ruddy_20261005.docx" -> "Ruddy" (the date is skipped); "SOP_TSE NTHU_Someone.docx" -> "Someone".
 */
export function guessNameFromFile(fileName: string): string | null {
  const stem = fileName.replace(/\.(docx|pdf)$/i, "");
  const paren = /\(([^)]+)\)/.exec(stem);
  if (paren && !NOT_A_NAME.test(paren[1].trim())) return paren[1].trim();
  const parts = stem.split("_").map((p) => p.trim()).filter(Boolean);
  const isName = (p: string) => !NOT_A_NAME.test(p) && !DOC_TYPE.test(p);
  if (parts[0] && isName(parts[0])) return parts[0];
  return parts.filter(isName).at(-1) ?? null;
}
