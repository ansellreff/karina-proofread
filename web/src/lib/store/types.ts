import type { ChangeRecord } from "../pipeline";
import type { DocType } from "../rules/types";
import type { DocScore } from "../score/score";

export type JobStatus = "new" | "proofreading" | "ready" | "done";

export interface Version {
  /** 0 is always the student's original as received. */
  n: number;
  label: string;
  kind: "original" | "bot" | "edit" | "restore" | "recheck";
  createdAt: string;
  /** For "restore": which version was restored. */
  from?: number;
}

export interface ProofreadInfo {
  at: string;
  version: number;
  ai: boolean;
  model?: string;
  englishQuality?: string;
  costUsd?: number;
  usage?: Record<string, number | null | undefined>;
  changes: ChangeRecord[];
  formatting: { deviated: boolean; runs: number; paragraphs: number };
  dropped?: { what: string; why: string }[];
  /** Score of the student's original, and of the document with every suggestion accepted. */
  score?: { original: DocScore; potential: DocScore };
}

export interface Job {
  id: string;
  fileName: string;
  docType: DocType;
  studentName: string | null;
  status: JobStatus;
  source: "upload" | "email" | "onedrive";
  createdAt: string;
  updatedAt: string;
  versions: Version[];
  current: number;
  proofread?: ProofreadInfo;
  /** Latest score of the review in progress (updated as Karina accepts, rejects and edits). */
  score?: { total: number; at: string };
  /** The student sent a PDF: it was converted to Word (fileName is the .docx); the PDF is kept as sent. */
  sourceFile?: { name: string; kind: "pdf"; notes: string[] };
}

export interface Settings {
  aiDefault: boolean;
  model: "claude-opus-5-5" | "claude-sonnet-5-5";
  effort: "low" | "medium" | "high";
  authorName: string;
  /** API balance Karina entered, used for the "remaining" estimate. */
  balanceUsd: number | null;
  balanceSetAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  aiDefault: true,
  model: "claude-opus-5-5",
  effort: "high",
  authorName: "Karina Octavia",
  balanceUsd: null,
  balanceSetAt: null,
};

/** A deleted document, kept so it can be restored. */
export interface TrashEntry {
  entry: string;
  deletedAt: string;
  job: Job;
}

/** Where jobs live. M3: local folder. M4: OneDrive + database. */
export interface JobStore {
  list(): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  create(fileName: string, data: Uint8Array, source?: Job["source"]): Promise<Job>;
  save(job: Job): Promise<void>;
  /** Moves the document to the trash; returns the trash entry (null when it didn't exist). */
  remove(id: string): Promise<string | null>;
  listTrash(): Promise<TrashEntry[]>;
  restore(entry: string): Promise<Job>;
  readVersion(id: string, n: number): Promise<Uint8Array>;
  addVersion(id: string, data: Uint8Array, v: Omit<Version, "n" | "createdAt">, opts?: { rolling?: boolean }): Promise<Job>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  /** Total AI spend recorded since `since` (ISO date), for the balance estimate. */
  spendSince(since: string | null): Promise<number>;
}
