/** Turn finished documents into learned records, and summarise what was learned. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { acceptAllRevisions } from "../docx/accept";
import { DocxPackage } from "../docx/package";
import { bodyParagraphs, type Para } from "../docx/paragraphs";
import { rejectAllRevisions } from "../docx/reject";
import { getW, wDescendants } from "../docx/xml";
import { ruleSuggestions } from "../pipeline";
import type { RuleConfig } from "../rules/config";
import { loadRules } from "../rules/config-store";
import { buildContext, detectName } from "../rules/detect";
import type { DocType } from "../rules/types";
import type { Job, JobStore } from "../store/types";
import { hash, learnStats, propose, type LearnedExample, type LearnStats, type Proposal, type Tally } from "./proposals";
import { botOutcomes, netEdits, type LearnedRecord } from "./record";
import { getLearnStore, type LearnStore } from "./store";

export class LearnError extends Error {}

async function readParas(data: Uint8Array, mode: "accept" | "reject"): Promise<{ pkg: DocxPackage; paras: Para[]; revisions: number; lastRevision: string | null }> {
  const pkg = await DocxPackage.load(data);
  const doc = await pkg.xml("word/document.xml");
  if (!doc) throw new LearnError("This is not a Word document.");
  const marks = ["ins", "del", "moveFrom", "moveTo"].flatMap((t) => wDescendants(doc, t));
  // when she reviewed it: the newest date on a tracked change
  const dates = marks.map((m) => getW(m, "date")).filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)));
  const lastRevision = dates.length ? new Date(Math.max(...dates.map((d) => Date.parse(d)))).toISOString() : null;
  if (mode === "accept") acceptAllRevisions(doc);
  else rejectAllRevisions(doc);
  return { pkg, paras: bodyParagraphs(doc), revisions: marks.length, lastRevision };
}

/** File names of the 6 test documents (training/holdout.txt). The bot never learns from them. */
export function holdoutNames(): Set<string> {
  // local only (gitignored, outside the app): never traced into the build
  for (const p of [path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "training", "holdout.txt"), path.join(/*turbopackIgnore: true*/ process.cwd(), "training", "holdout.txt")]) {
    if (existsSync(/*turbopackIgnore: true*/ p)) return new Set(readFileSync(/*turbopackIgnore: true*/ p, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  }
  return new Set();
}

function buildRecord(base: Omit<LearnedRecord, "text" | "starts" | "edits" | "outcomes" | "learnedAt">, orig: string[], fin: string[], changes: Parameters<typeof botOutcomes>[0]): LearnedRecord {
  const { text, starts, edits } = netEdits(orig, fin);
  return { ...base, learnedAt: new Date().toISOString(), text, starts, edits, outcomes: botOutcomes(changes, text, starts, edits) };
}

/**
 * A document Karina marked as done in the app: the student's original (v0) against what she sends (the current
 * version with every remaining suggestion accepted), and the bot's suggestions from its proofread.
 */
export async function recordFromJob(job: Job, jobs: JobStore, rules?: RuleConfig): Promise<LearnedRecord | null> {
  if (job.current === 0) return null; // nothing was proofread or edited
  const orig = await readParas(await jobs.readVersion(job.id, 0), "accept");
  const fin = await readParas(await jobs.readVersion(job.id, job.current), "accept");
  const ctx = buildContext(job.fileName, orig.paras, job.docType, rules ?? (await loadRules()));
  const names = [job.studentName, detectName(ctx)].filter((n): n is string => !!n);
  return buildRecord(
    { id: `job-${job.id}`, source: "job", jobId: job.id, fileName: job.fileName, docType: job.docType, names, reviewedAt: job.updatedAt },
    orig.paras.map((p) => p.text),
    fin.paras.map((p) => p.text),
    job.proofread?.changes ?? [],
  );
}

/**
 * A review Karina did in Word (her tracked changes in the file): the original is the file with every change
 * rejected, her final is the file with every change accepted, and the bot's suggestions come from running the
 * rules engine on the original.
 */
export async function recordFromReview(fileName: string, data: Uint8Array, docType?: DocType, rules?: RuleConfig): Promise<LearnedRecord> {
  if (holdoutNames().has(path.basename(fileName))) {
    throw new LearnError("This is one of the 6 test documents used to measure the bot’s accuracy, so it never learns from it.");
  }
  const rejected = await readParas(data, "reject");
  if (!rejected.revisions) throw new LearnError("This file has no tracked changes, so there is nothing to learn from. Upload the version with your tracked changes.");
  const original = await rejected.pkg.save();
  const bot = await ruleSuggestions(original, { fileName, docType, rules: rules ?? (await loadRules()) });
  const fin = await readParas(data, "accept");
  return buildRecord(
    {
      id: `up-${hash(`${fileName}|${bot.paras.join("\n")}`)}`, source: "upload", fileName, docType: bot.docType, names: bot.name ? [bot.name] : [],
      reviewedAt: rejected.lastRevision ?? new Date().toISOString(),
    },
    bot.paras,
    fin.paras.map((p) => p.text),
    bot.changes,
  );
}

export interface RecordSummary {
  id: string;
  source: LearnedRecord["source"];
  jobId?: string;
  fileName: string;
  docType: DocType;
  learnedAt: string;
  edits: number;
  suggestions: Tally;
}

export interface LearnSummary {
  stats: LearnStats;
  proposals: Proposal[];
  records: RecordSummary[];
  examples: LearnedExample[];
}

export async function learnSummary(learn: LearnStore = getLearnStore(), rules?: RuleConfig): Promise<LearnSummary> {
  const config = rules ?? (await loadRules());
  const records = await learn.list();
  const state = await learn.state();
  return {
    stats: learnStats(records, config),
    proposals: propose(records, config, state),
    records: records.map((r) => ({
      id: r.id, source: r.source, jobId: r.jobId, fileName: r.fileName, docType: r.docType, learnedAt: r.learnedAt, edits: r.edits.length,
      suggestions: {
        n: r.outcomes.length,
        kept: r.outcomes.filter((o) => o.outcome === "kept").length,
        changed: r.outcomes.filter((o) => o.outcome === "changed").length,
        rejected: r.outcomes.filter((o) => o.outcome === "rejected").length,
      },
    })),
    examples: state.examples,
  };
}

/** Learn from a job that was just marked done; returns how many open proposals draw on it. */
export async function learnFromJob(job: Job, jobs: JobStore, learn: LearnStore = getLearnStore()): Promise<{ record: string; proposals: number } | null> {
  const rules = await loadRules();
  const rec = await recordFromJob(job, jobs, rules);
  if (!rec) return null;
  await learn.save(rec);
  const proposals = propose(await learn.list(), rules, await learn.state()).filter((p) => p.records.includes(rec.id)).length;
  return { record: rec.id, proposals };
}
