import { describe, expect, it } from "vitest";
import { ARCHIVE_DAYS, archivesIn, doneSince, isArchived } from "./archive";
import type { JobStatus } from "./types";

const DAY = 86_400_000;
const now = Date.parse("2026-11-12T10:00:00Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const job = (status: JobStatus, doneAt?: string, updatedAt = ago(30)) => ({ status, doneAt, updatedAt });

describe("Archived documents", () => {
  it("are documents marked as done at least 14 days ago", () => {
    expect(ARCHIVE_DAYS).toBe(14);
    expect(isArchived(job("done", ago(14)), now)).toBe(true);
    expect(isArchived(job("done", ago(13.9)), now)).toBe(false);
  });

  it("never include new or ongoing reviews, however old they are", () => {
    for (const status of ["new", "proofreading", "ready"] as JobStatus[]) {
      expect(isArchived(job(status, undefined, ago(90)), now)).toBe(false);
      // a stale done time from before it was reopened or proofread again doesn't count
      expect(isArchived(job(status, ago(90)), now)).toBe(false);
    }
  });

  it("use the Proofread record's finished time, then the last update, for documents done before the timer existed", () => {
    expect(doneSince(job("done", undefined, ago(30)), ago(20))).toBe(ago(20));
    expect(doneSince(job("done", undefined, ago(30)))).toBe(ago(30));
    expect(doneSince(job("ready", undefined, ago(30)), ago(20))).toBeNull();
  });

  it("tell how long until a done document moves to Archived", () => {
    expect(archivesIn(job("done", ago(4)), now)).toBe("moves to Archived in 10 days");
    expect(archivesIn(job("done", ago(13)), now)).toBe("moves to Archived tomorrow");
    expect(archivesIn(job("done", ago(13.99)), now)).toBe("moves to Archived tomorrow");
    expect(archivesIn(job("done", ago(20)), now)).toBeNull();
    expect(archivesIn(job("ready"), now)).toBeNull();
  });
});
