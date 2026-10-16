import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { DocxPackage } from "../docx/package";
import { bodyParagraphs } from "../docx/paragraphs";
import { acceptAllRevisions } from "../docx/accept";
import { buildContext, detectName } from "../rules/detect";
import { DEFAULT_SETTINGS, type Job, type JobStore, type Settings, type Version } from "./types";

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

  async create(fileName: string, data: Uint8Array, source: Job["source"] = "upload"): Promise<Job> {
    const id = randomUUID();
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
      versions: [{ n: 0, label: "Original (as received)", kind: "original", createdAt: now }],
      current: 0,
    };
    await mkdir(this.dir(id), { recursive: true });
    await writeFile(path.join(this.dir(id), "v0.docx"), data);
    await this.save(job);
    return job;
  }

  async save(job: Job): Promise<void> {
    await writeFile(path.join(this.dir(job.id), "meta.json"), JSON.stringify(job, null, 1));
  }

  /** Deleting moves the document to .data/trash/ (never erased), so a wrong delete can always be undone by hand. */
  async remove(id: string): Promise<void> {
    const trash = path.join(this.root, "trash");
    await mkdir(trash, { recursive: true });
    await rename(this.dir(id), path.join(trash, `${id}_${new Date().toISOString().replace(/[:.]/g, "-")}`)).catch(async (e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
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
