import { describe, expect, it } from "vitest";
import { budgetState, DEFAULT_COST, formatCost, normalizeCost } from "./budget";

const now = new Date("2026-11-13T12:00:00Z");
const run = (at: string, costUsd: number) => ({ at, jobId: "j", model: "claude-opus-5-5", costUsd });
const usage = [run("2026-10-30T10:00:00Z", 5), run("2026-11-02T10:00:00Z", 3), run("2026-11-10T10:00:00Z", 5)];

describe("AI cost settings", () => {
  it("clean up what is sent: bad numbers fall back, codes become three letters", () => {
    expect(normalizeCost(undefined)).toEqual(DEFAULT_COST);
    const c = normalizeCost({ monthlyBudgetUsd: "10,5", warnAtPercent: 3, overBudget: "stop", lowBalanceUsd: null, confirmAboveUsd: -1, currency: { code: "idr", perUsd: "16300" } });
    expect(c).toEqual({ monthlyBudgetUsd: 10.5, warnAtPercent: 80, overBudget: "stop", lowBalanceUsd: null, confirmAboveUsd: null, currency: { code: "IDR", perUsd: 16300 } });
    expect(normalizeCost({ currency: { code: "Rp", perUsd: 16300 } }).currency).toBeNull();
  });

  it("track this month against the budget: near, over, and stopped only when she chose to stop", () => {
    const warn = budgetState({ ...DEFAULT_COST, monthlyBudgetUsd: 10 }, usage, { usd: null, setAt: null }, now);
    expect(warn).toMatchObject({ month: "2026-11", monthUsd: 8, monthRuns: 2, percent: 80, near: true, over: false, stopped: false });
    const stop = budgetState({ ...DEFAULT_COST, monthlyBudgetUsd: 8, overBudget: "stop" }, usage, { usd: null, setAt: null }, now);
    expect(stop).toMatchObject({ over: true, stopped: true, near: false });
    expect(budgetState(DEFAULT_COST, usage, { usd: null, setAt: null }, now)).toMatchObject({ budgetUsd: null, percent: null, near: false, over: false });
    // 8 dollars in 12.5 days of a 30-day month
    expect(warn.projectedUsd).toBeCloseTo(19.2, 1);
  });

  it("warn about a low balance, counting only what was spent since it was entered", () => {
    const s = budgetState(DEFAULT_COST, usage, { usd: 6, setAt: "2026-11-05T00:00:00Z" }, now);
    expect(s.balanceLeftUsd).toBe(1);
    expect(s.lowBalance).toBe(true);
    expect(budgetState({ ...DEFAULT_COST, lowBalanceUsd: null }, usage, { usd: 6, setAt: "2026-11-05T00:00:00Z" }, now).lowBalance).toBe(false);
  });

  it("show amounts in her currency too", () => {
    expect(formatCost(0.42, null)).toBe("US$0.42");
    expect(formatCost(0.42, { code: "IDR", perUsd: 16300 })).toBe("US$0.42 (about IDR 6,846)");
    expect(formatCost(0.5, { code: "EUR", perUsd: 0.9 }, { local: "only" })).toBe("EUR 0.45");
  });
});
