import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_VERSION, RELEASES, releaseOfCommit } from "./update-log";

const parse = (v: string) => v.split(".").map(Number) as [number, number];

describe("update log", () => {
  it("numbers versions newest first: majors 1, 2, 3…; each major starts at x.0 and its minors count up by one", () => {
    const oldestFirst = [...RELEASES].reverse();
    expect(oldestFirst[0].version).toBe("1.0");
    for (let i = 1; i < oldestFirst.length; i++) {
      const [pM, pm] = parse(oldestFirst[i - 1].version);
      const [M, m] = parse(oldestFirst[i].version);
      const r = oldestFirst[i];
      if (r.kind === "major") expect([M, m], r.version).toEqual([pM + 1, 0]);
      else expect([M, m], r.version).toEqual([pM, pm + 1]);
      expect(r.date >= oldestFirst[i - 1].date, r.version).toBe(true);
    }
    expect(RELEASES.every((r) => r.points.length > 0 && r.title && r.summary)).toBe(true);
  });

  it("the app's version number matches the newest release", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
    expect(pkg.version).toBe(`${CURRENT_VERSION}.0`);
  });

  it("every release but the newest names its commits, and they are in the git history", () => {
    for (const r of RELEASES.slice(1)) expect(r.commits.length, r.version).toBeGreaterThan(0);
    let git = true;
    try {
      execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
    } catch {
      git = false; // not a git checkout (e.g. a build server): nothing to check against
    }
    if (!git) return;
    for (const c of RELEASES.flatMap((r) => r.commits)) {
      expect(() => execFileSync("git", ["cat-file", "-e", `${c}^{commit}`], { stdio: "ignore" }), c).not.toThrow();
    }
  }, 30_000); // one git call per commit: slow while the other tests run alongside

  it("finds the release a deployed commit belongs to; a commit not listed yet is the newest release", () => {
    expect(releaseOfCommit("bcf949d0123456789")?.version).toBe("4.3");
    expect(releaseOfCommit("ffffffffffffffff")?.version).toBe(CURRENT_VERSION);
    expect(releaseOfCommit(null)).toBeNull();
  });
});
