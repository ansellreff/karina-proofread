import { randomUUID } from "node:crypto";
import { acceptAllRevisions } from "../docx/accept";
import { DocxPackage } from "../docx/package";
import { bodyParagraphs } from "../docx/paragraphs";
import { pdfToDocx } from "../pdf/pdf-to-docx";
import { buildContext, detectName } from "../rules/detect";
import { readJson, readText, writeJson, type AppFiles } from "../storage/files";
import { DEFAULT_SETTINGS, type Job, type JobStore, type Settings, type TrashEntry, type UsageEntry, type Version } from "./types";

/** A proofread cut off before it finished (a server function can be stopped) is treated as not started. */
const STALLED_MS = 6 * 60 * 1000;

const ID = /^[a-f0-9-]{36}$/;
const ENTRY = /^([a-f0-9-]{36})_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;

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

  /** Recently deleted documents, newest first. */
  async listTrash(): Promise<TrashEntry[]> {
    const out: TrashEntry[] = [];
    for (const f of await this.files.list("trash")) {
      const m = ENTRY.exec(f.name);
      if (!m || !f.folder) continue;
      const job = await readJson<Job>(this.files, `trash/${f.name}/meta.json`);
      if (job) out.push({ entry: f.name, deletedAt: `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z`, job });
    }
    return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  /** Erase one deleted document for good (test clean-up; the app itself offers no "erase forever"). */
  async purge(entry: string): Promise<void> {
    if (!ENTRY.test(entry)) throw new Error("Unknown deleted document.");
    await this.files.remove(`trash/${entry}`);
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
    return { ...DEFAULT_SETTINGS, ...((await readJson<Partial<Settings>>(this.files, "settings.json")) ?? {}) };
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

/** "StudyPlan_(SINTA) NYUST.docx" -> "SINTA"; "Sinta_Autobiography.docx" -> "Sinta". */
export function guessNameFromFile(fileName: string): string | null {
  const stem = fileName.replace(/\.docx$/i, "").replace(/^DONE_/, "");
  const paren = /\(([^)]+)\)/.exec(stem);
  if (paren) return paren[1].trim();
  const first = stem.split("_")[0].trim();
  if (/study ?plan|autobio|statement|essay|resume|cv|recommendation|script/i.test(first)) {
    const last = stem.split("_").at(-1)?.trim();
    return last && !/study ?plan|autobio|statement|essay/i.test(last) ? last : null;
  }
  return first || null;
}
