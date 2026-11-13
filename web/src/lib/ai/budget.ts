/**
 * Karina's AI cost settings (Settings → AI cost): a monthly budget, warnings, a per-run limit that asks first, and
 * her own currency. All amounts are in US$ (what Anthropic bills); the currency is only for showing.
 */
import type { JobStore, Settings, UsageEntry } from "../store/types";

export interface CostSettings {
  /** Spending limit per calendar month (null: no budget). */
  monthlyBudgetUsd: number | null;
  /** Warn once this share of the budget is spent (percent). */
  warnAtPercent: number;
  /** When the month's budget is used up: only warn, or stop AI runs until next month (or until she raises it). */
  overBudget: "warn" | "stop";
  /** Warn when the estimated balance left drops below this (null: never). */
  lowBalanceUsd: number | null;
  /** Ask before a run that may cost more than this (null: never ask). */
  confirmAboveUsd: number | null;
  /** Also show amounts in her currency, at the rate she enters (null: US$ only). */
  currency: { code: string; perUsd: number } | null;
}

export const DEFAULT_COST: CostSettings = { monthlyBudgetUsd: null, warnAtPercent: 80, overBudget: "warn", lowBalanceUsd: 2, confirmAboveUsd: null, currency: null };

const amount = (v: unknown, max = 100_000): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};

/** A saved or sent value made safe: anything unreadable falls back to the default. */
export function normalizeCost(raw: unknown): CostSettings {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof CostSettings, unknown>>;
  const cur = c.currency as { code?: unknown; perUsd?: unknown } | null | undefined;
  const code = typeof cur?.code === "string" ? cur.code.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : "";
  const perUsd = amount(cur?.perUsd, 10_000_000);
  const warn = amount(c.warnAtPercent, 100);
  return {
    monthlyBudgetUsd: amount(c.monthlyBudgetUsd),
    warnAtPercent: warn === null || warn < 10 ? DEFAULT_COST.warnAtPercent : Math.round(warn),
    overBudget: c.overBudget === "stop" ? "stop" : "warn",
    lowBalanceUsd: c.lowBalanceUsd === null ? null : (amount(c.lowBalanceUsd) ?? DEFAULT_COST.lowBalanceUsd),
    confirmAboveUsd: amount(c.confirmAboveUsd),
    currency: code.length === 3 && perUsd && perUsd > 0 ? { code, perUsd } : null,
  };
}

export interface BudgetState {
  /** "2026-11" */
  month: string;
  monthUsd: number;
  monthRuns: number;
  budgetUsd: number | null;
  /** Share of the budget spent, 0–100+ (null without a budget). */
  percent: number | null;
  /** Past the warning share, but not over. */
  near: boolean;
  over: boolean;
  /** AI runs are stopped for the rest of the month (over budget, set to stop). */
  stopped: boolean;
  /** At this month's pace, the month ends at about this much. */
  projectedUsd: number | null;
  balanceLeftUsd: number | null;
  lowBalance: boolean;
}

/** Where this month's AI spend stands against her budget and balance. */
export function budgetState(cost: CostSettings, usage: UsageEntry[], balance: { usd: number | null; setAt: string | null }, now = new Date()): BudgetState {
  const month = now.toISOString().slice(0, 7);
  const inMonth = usage.filter((u) => u.at.startsWith(month));
  const monthUsd = inMonth.reduce((n, u) => n + u.costUsd, 0);
  const budgetUsd = cost.monthlyBudgetUsd && cost.monthlyBudgetUsd > 0 ? cost.monthlyBudgetUsd : null;
  const percent = budgetUsd ? (monthUsd / budgetUsd) * 100 : null;
  const over = percent !== null && percent >= 100;
  const day = now.getUTCDate() - 1 + (now.getUTCHours() * 60 + now.getUTCMinutes()) / 1440;
  const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projectedUsd = inMonth.length && day >= 1 ? (monthUsd / day) * days : null;
  const balanceLeftUsd = balance.usd === null ? null : balance.usd - usage.filter((u) => !balance.setAt || u.at >= balance.setAt).reduce((n, u) => n + u.costUsd, 0);
  return {
    month,
    monthUsd,
    monthRuns: inMonth.length,
    budgetUsd,
    percent,
    near: percent !== null && !over && percent >= cost.warnAtPercent,
    over,
    stopped: over && cost.overBudget === "stop",
    projectedUsd,
    balanceLeftUsd,
    lowBalance: balanceLeftUsd !== null && cost.lowBalanceUsd !== null && balanceLeftUsd < cost.lowBalanceUsd,
  };
}

/** The budget state from the app's own settings and usage log. */
export async function budgetOf(store: Pick<JobStore, "usage" | "getSettings">, settings?: Settings): Promise<BudgetState> {
  const s = settings ?? (await store.getSettings());
  return budgetState(s.cost, await store.usage(), { usd: s.balanceUsd, setAt: s.balanceSetAt });
}

/** The message the AI routes give when the month's budget has stopped AI runs. */
export const stoppedMessage = (s: BudgetState) =>
  `This month’s AI budget (US$${s.budgetUsd?.toFixed(2)}) is used up, so AI runs are paused until next month. Raise the budget or choose “Only warn me” in Settings → AI cost. Rules-only proofreading still works.`;

/** "US$0.42" or "US$0.42 (about IDR 6,900)". */
export function formatCost(usd: number, currency: CostSettings["currency"], opts: { local?: "after" | "only" } = {}) {
  const us = `US$${usd < 0.01 && usd > 0 ? usd.toFixed(3) : usd.toFixed(2)}`;
  if (!currency) return us;
  const n = usd * currency.perUsd;
  const local = `${currency.code} ${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;
  return opts.local === "only" ? local : `${us} (about ${local})`;
}
