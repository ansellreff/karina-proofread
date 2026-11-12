import { describe, expect, it } from "vitest";
import { applyPriorityOrder, priorityList, priorityRanks, queueNumbers } from "./priority";
import type { JobStatus } from "./types";

const DAY = 86_400_000;
const now = Date.parse("2026-11-12T10:00:00Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const doc = (id: string, status: JobStatus, uploadedDaysAgo: number, extra: { priority?: number; doneAt?: string; archivedAt?: string } = {}) => ({
  id,
  status,
  createdAt: ago(uploadedDaysAgo),
  updatedAt: ago(0),
  ...extra,
});

describe("Priority list", () => {
  const jobs = [
    doc("a", "ready", 5, { priority: 7 }),
    doc("b", "new", 3, { priority: 2 }),
    doc("c", "new", 1),
    doc("d", "done", 9, { priority: 1, doneAt: ago(1) }),
    doc("e", "new", 2, { priority: 4, archivedAt: ago(1) }),
  ];

  it("lists the open starred documents in her order, numbered 1, 2, 3 without gaps", () => {
    expect(priorityList(jobs, now).map((j) => j.id)).toEqual(["b", "a"]);
    expect([...priorityRanks(jobs, now)]).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("saves a new order, and a star taken off; done and archived documents keep theirs", () => {
    expect(applyPriorityOrder(jobs, ["c", "b"], now).map(({ job, priority }) => [job.id, priority])).toEqual([
      ["a", undefined],
      ["c", 1], // b already has 2
    ]);
    // only what moved is saved
    expect(applyPriorityOrder(jobs, ["b", "a"], now).map(({ job, priority }) => [job.id, priority])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
    expect(applyPriorityOrder([doc("x", "new", 1, { priority: 1 })], ["x"], now)).toEqual([]);
  });
});

describe("Queue numbers", () => {
  it("number the documents still to finish by upload time, the longest waiting first", () => {
    const jobs = [doc("late", "new", 1), doc("early", "ready", 6), doc("finished", "done", 9, { doneAt: ago(2) }), doc("mid", "proofreading", 3)];
    expect([...queueNumbers(jobs, now)]).toEqual([
      ["early", 1],
      ["mid", 2],
      ["late", 3],
    ]);
  });
});
