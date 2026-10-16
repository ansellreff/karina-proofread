/** What the AI has cost, for the AI costs page (from the usage log: one row per AI proofread or re-check). */
import type { Job, Settings, UsageEntry } from "./store/types";

export interface MonthCost {
  /** "2026-10" */
  month: string;
  usd: number;
  runs: number;
}

export interface DocCost {
  jobId: string;
  /** null when the document was deleted. */
  name: string | null;
  docType: string | null;
  usd: number;
  runs: number;
  last: string;
}

export interface CostSummary {
  total: number;
  runs: number;
  thisMonth: MonthCost;
  /** The last 12 months, oldest first (months without runs included). */
  months: MonthCost[];
  /** Highest cost first. */
  documents: DocCost[];
  /** Average cost of one AI run. */
  perRun: number | null;
  byModel: { model: string; usd: number; runs: number }[];
  balance: { left: number; setAt: string | null; runsLeft: number | null } | null;
}

export function summarizeCosts(usage: UsageEntry[], jobs: Job[], settings: Settings, now = new Date()): CostSummary {
  const months: MonthCost[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), usd: 0, runs: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const docs = new Map<string, DocCost>();
  const models = new Map<string, { model: string; usd: number; runs: number }>();
  const names = new Map(jobs.map((j) => [j.id, j]));
  let total = 0;
  for (const u of usage) {
    total += u.costUsd;
    const m = byMonth.get(u.at.slice(0, 7));
    if (m) {
      m.usd += u.costUsd;
      m.runs++;
    }
    const job = names.get(u.jobId);
    const d = docs.get(u.jobId) ?? { jobId: u.jobId, name: job ? (job.studentName ?? job.fileName) : null, docType: job?.docType ?? null, usd: 0, runs: 0, last: u.at };
    d.usd += u.costUsd;
    d.runs++;
    if (u.at > d.last) d.last = u.at;
    docs.set(u.jobId, d);
    const md = models.get(u.model) ?? { model: u.model, usd: 0, runs: 0 };
    md.usd += u.costUsd;
    md.runs++;
    models.set(u.model, md);
  }
  const perRun = usage.length ? total / usage.length : null;
  let balance: CostSummary["balance"] = null;
  if (settings.balanceUsd !== null) {
    const spent = usage.filter((u) => !settings.balanceSetAt || u.at >= settings.balanceSetAt).reduce((n, u) => n + u.costUsd, 0);
    const left = settings.balanceUsd - spent;
    balance = { left, setAt: settings.balanceSetAt, runsLeft: perRun ? Math.max(0, Math.floor(left / perRun)) : null };
  }
  return {
    total,
    runs: usage.length,
    thisMonth: months[months.length - 1],
    months,
    documents: [...docs.values()].sort((a, b) => b.usd - a.usd),
    perRun,
    byModel: [...models.values()].sort((a, b) => b.usd - a.usd),
    balance,
  };
}
