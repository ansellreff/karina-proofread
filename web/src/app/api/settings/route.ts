import { budgetState, normalizeCost } from "@/lib/ai/budget";
import { normalizeFormat } from "@/lib/naming";
import { stores } from "@/lib/storage/stores";
import type { Settings } from "@/lib/store/types";

export const runtime = "nodejs";

export async function GET() {
  const store = (await stores()).jobs;
  const settings = await store.getSettings();
  const usage = await store.usage();
  const spent = await store.spendSince(settings.balanceSetAt);
  const budget = budgetState(settings.cost, usage, { usd: settings.balanceUsd, setAt: settings.balanceSetAt });
  // what one AI proofread of a whole document has cost her with each model (its latest proofread; re-checks of a
  // passage are left out), to show beside the model choice
  const perModel: Record<string, { runs: number; avgUsd: number }> = {};
  for (const j of await store.list()) {
    const p = j.proofread;
    if (!p?.ai || !p.model || typeof p.costUsd !== "number") continue;
    const m = (perModel[p.model] ??= { runs: 0, avgUsd: 0 });
    m.avgUsd = (m.avgUsd * m.runs + p.costUsd) / (m.runs + 1);
    m.runs++;
  }
  return Response.json({
    settings,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    spentSinceBalance: spent,
    remainingUsd: settings.balanceUsd === null ? null : settings.balanceUsd - spent,
    thisMonthUsd: budget.monthUsd,
    runsThisMonth: budget.monthRuns,
    budget,
    perModel,
  });
}

/** Saves the settings. `topUpUsd`: adds to the balance left (the balance starts again from now). */
export async function PUT(request: Request) {
  const store = (await stores()).jobs;
  const current = await store.getSettings();
  const body = (await request.json()) as Partial<Settings> & { topUpUsd?: number };
  const { topUpUsd, balanceSetAt: _ignored, ...rest } = body; // the server keeps when the balance was entered
  void _ignored;
  const next: Settings = { ...current, ...rest };
  if (rest.balanceUsd !== undefined && rest.balanceUsd !== current.balanceUsd) next.balanceSetAt = new Date().toISOString();
  if (typeof topUpUsd === "number" && topUpUsd > 0 && topUpUsd < 100_000) {
    const left = current.balanceUsd === null ? 0 : current.balanceUsd - (await store.spendSince(current.balanceSetAt));
    next.balanceUsd = Math.round((Math.max(0, left) + topUpUsd) * 100) / 100;
    next.balanceSetAt = new Date().toISOString();
  }
  if (next.balanceUsd !== null && !(typeof next.balanceUsd === "number" && next.balanceUsd >= 0)) next.balanceUsd = current.balanceUsd;
  if (!["claude-opus-5-5", "claude-sonnet-5-5"].includes(next.model)) next.model = current.model;
  if (!["low", "medium", "high"].includes(next.effort)) next.effort = current.effort;
  next.aiDefault = !!next.aiDefault;
  next.authorName = (typeof next.authorName === "string" && next.authorName.trim() ? next.authorName : current.authorName).trim().slice(0, 80);
  next.fileName = normalizeFormat(next.fileName);
  next.cost = normalizeCost(next.cost);
  await store.saveSettings(next);
  return Response.json(next);
}
