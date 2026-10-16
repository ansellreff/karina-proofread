import { describe, expect, it } from "vitest";
import { summarizeCosts } from "./costs";
import { DEFAULT_SETTINGS, type Job } from "./store/types";

const job = { id: "j1", studentName: "Sari", fileName: "Sari_Study Plan.docx", docType: "Study Plan" } as Job;
const usage = [
  { at: "2026-08-03T10:00:00Z", jobId: "j1", model: "claude-opus-5-5", costUsd: 0.1 },
  { at: "2026-10-01T10:00:00Z", jobId: "j1", model: "claude-opus-5-5", costUsd: 0.12 },
  { at: "2026-10-05T10:00:00Z", jobId: "gone", model: "claude-sonnet-5-5", costUsd: 0.05 },
];

describe("AI costs", () => {
  it("adds up per month, per document and per model, and estimates what the balance still covers", () => {
    const c = summarizeCosts(usage, [job], { ...DEFAULT_SETTINGS, balanceUsd: 5, balanceSetAt: "2026-10-01T00:00:00Z" }, new Date("2026-10-16T00:00:00Z"));
    expect(c.months).toHaveLength(12);
    expect(c.months[0].month).toBe("2025-11");
    expect(c.thisMonth).toMatchObject({ month: "2026-10", runs: 2 });
    expect(c.thisMonth.usd).toBeCloseTo(0.17);
    expect(c.months.find((m) => m.month === "2026-08")?.usd).toBeCloseTo(0.1);
    expect(c.documents.map((d) => [d.name, d.runs])).toEqual([["Sari", 2], [null, 1]]);
    expect(c.perRun).toBeCloseTo(0.09);
    expect(c.balance?.left).toBeCloseTo(4.83);
    expect(c.balance?.runsLeft).toBe(53);
    expect(c.byModel.map((m) => m.model)).toEqual(["claude-opus-5-5", "claude-sonnet-5-5"]);
  });

  it("has no balance until one is entered", () => {
    expect(summarizeCosts([], [], DEFAULT_SETTINGS).balance).toBeNull();
  });
});
