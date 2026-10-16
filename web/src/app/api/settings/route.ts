import { stores } from "@/lib/storage/stores";
import type { Settings } from "@/lib/store/types";

export const runtime = "nodejs";

export async function GET() {
  const store = (await stores()).jobs;
  const settings = await store.getSettings();
  const usage = await store.usage();
  const spent = await store.spendSince(settings.balanceSetAt);
  const month = new Date().toISOString().slice(0, 7);
  return Response.json({
    settings,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    spentSinceBalance: spent,
    remainingUsd: settings.balanceUsd === null ? null : settings.balanceUsd - spent,
    thisMonthUsd: usage.filter((u) => u.at.startsWith(month)).reduce((n, u) => n + u.costUsd, 0),
    runsThisMonth: usage.filter((u) => u.at.startsWith(month)).length,
  });
}

export async function PUT(request: Request) {
  const store = (await stores()).jobs;
  const current = await store.getSettings();
  const body = (await request.json()) as Partial<Settings>;
  const next: Settings = { ...current, ...body };
  if (body.balanceUsd !== undefined && body.balanceUsd !== current.balanceUsd) next.balanceSetAt = new Date().toISOString();
  if (!["claude-opus-5-5", "claude-sonnet-5-5"].includes(next.model)) next.model = current.model;
  if (!["low", "medium", "high"].includes(next.effort)) next.effort = current.effort;
  next.authorName = (next.authorName || current.authorName).trim();
  await store.saveSettings(next);
  return Response.json(next);
}
