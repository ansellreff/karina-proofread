import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { DocxPackage } from "../docx/package";
import { pdfToDocx } from "../pdf/pdf-to-docx";
import { bodyParagraphs } from "../docx/paragraphs";
import { acceptAllRevisions } from "../docx/accept";
import { buildContext, detectName } from "../rules/detect";
import { DEFAULT_SETTINGS, type Job, type JobStore, type Settings, type TrashEntry, type Version } from "./types";

/** Local-folder job store (web/.data, gitignored). Each job: meta.json + v0.docx, v1.docx, ... */
export class FsJobStore implements JobStore {
  constructor(private root = path.join(process.cwd(), ".data")) {}

  private dir(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid job id");
    return path.join(this.root, "jobs", id);
  }

  async list(): Promise<Job[]> {
    const base = path.join(this.root, "jobs");
    let ids: string[] = [];
    try {
      ids = await readdir(base);
    } catch {
      return [];
    }
    const jobs = await Promise.all(ids.map((id) => this.get(id).catch(() => null)));
    return jobs.filter((j): j is Job => !!j).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Job | null> {
    try {
      return JSON.parse(await readFile(path.join(this.dir(id), "meta.json"), "utf8")) as Job;
    } catch {
      return null;
    }
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
    await mkdir(this.dir(id), { recursive: true });
    if (converted) await writeFile(path.join(this.dir(id), "source.pdf"), upload);
    await writeFile(path.join(this.dir(id), "v0.docx"), data);
    await this.save(job);
    return job;
  }

  async save(job: Job): Promise<void> {
    await writeFile(path.join(this.dir(job.id), "meta.json"), JSON.stringify(job, null, 1));
  }

  /** Deleting moves the document to .data/trash/ (never erased), so it can be restored. Returns the trash entry. */
  async remove(id: string): Promise<string | null> {
    const trash = path.join(this.root, "trash");
    await mkdir(trash, { recursive: true });
    const entry = `${id}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      await rename(this.dir(id), path.join(trash, entry));
      return entry;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  /** Recently deleted documents, newest first. */
  async listTrash(): Promise<TrashEntry[]> {
    const trash = path.join(this.root, "trash");
    let entries: string[] = [];
    try {
      entries = await readdir(trash);
    } catch {
      return [];
    }
    const out: TrashEntry[] = [];
    for (const entry of entries) {
      const m = /^([a-f0-9-]{36})_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(entry);
      if (!m) continue;
      try {
        const job = JSON.parse(await readFile(path.join(trash, entry, "meta.json"), "utf8")) as Job;
        out.push({ entry, deletedAt: `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z`, job });
      } catch {
        /* not a job folder */
      }
    }
    return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  /** Erase one deleted document for good (test clean-up; the app itself offers no "erase forever"). */
  async purge(entry: string): Promise<void> {
    if (!/^[a-f0-9-]{36}_[\dT-]+Z$/.test(entry)) throw new Error("Unknown deleted document.");
    await rm(path.join(this.root, "trash", entry), { recursive: true, force: true });
  }

  /** Put a deleted document back. */
  async restore(entry: string): Promise<Job> {
    const m = /^([a-f0-9-]{36})_[\dT-]+Z$/.exec(entry);
    if (!m) throw new Error("Unknown deleted document.");
    const id = m[1];
    if (await this.get(id)) throw new Error("This document is already in the list.");
    await mkdir(path.join(this.root, "jobs"), { recursive: true });
    await rename(path.join(this.root, "trash", entry), this.dir(id));
    const job = (await this.get(id))!;
    return job;
  }

  /** The PDF exactly as the student sent it (documents converted from PDF). */
  async readSource(id: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(path.join(this.dir(id), "source.pdf")));
  }

  async readVersion(id: string, n: number): Promise<Uint8Array> {
    return new Uint8Array(await readFile(path.join(this.dir(id), `v${n}.docx`)));
  }

  async addVersion(id: string, data: Uint8Array, v: Omit<Version, "n" | "createdAt">, opts: { rolling?: boolean } = {}): Promise<Job> {
    const job = await this.get(id);
    if (!job) throw new Error("job not found");
    const last = job.versions[job.versions.length - 1];
    if (opts.rolling && last.kind === "edit" && last.label === v.label && last.n === job.current) {
      // autosave keeps updating one draft version instead of piling up new ones
      await writeFile(path.join(this.dir(id), `v${last.n}.docx`), data);
      last.createdAt = job.updatedAt = new Date().toISOString();
      await this.save(job);
      return job;
    }
    const n = Math.max(...job.versions.map((x) => x.n)) + 1;
    await writeFile(path.join(this.dir(id), `v${n}.docx`), data);
    const now = new Date().toISOString();
    job.versions.push({ ...v, n, createdAt: now });
    job.current = n;
    job.updatedAt = now;
    await this.save(job);
    return job;
  }

  async getSettings(): Promise<Settings> {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(await readFile(path.join(this.root, "settings.json"), "utf8")) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(s: Settings): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, "settings.json"), JSON.stringify(s, null, 1));
  }

  /** Append one AI run to the usage log (cost tracker). */
  async logUsage(entry: { at: string; jobId: string; model: string; costUsd: number; usage: unknown }): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await appendFile(path.join(this.root, "usage.jsonl"), JSON.stringify(entry) + "\n");
  }

  async usage(): Promise<{ at: string; jobId: string; model: string; costUsd: number }[]> {
    try {
      return (await readFile(path.join(this.root, "usage.jsonl"), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
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

let store: FsJobStore | null = null;
export function getStore(): FsJobStore {
  store ??= new FsJobStore();
  return store;
}
