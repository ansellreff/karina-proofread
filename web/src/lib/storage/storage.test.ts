import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { ConfigStore } from "../rules/config-store";
import { FileJobStore } from "../store/job-store";
import type { Job } from "../store/types";
import { MemoryFiles, readText, safePath, scoped, type AppFiles } from "./files";
import { PgFiles, pgliteQuery } from "./pg-files";

async function docx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

/** A fresh Postgres (PGlite, in memory) per test. */
const postgres = async () => new PgFiles(await pgliteQuery());

/** The same job-store behaviour on every backend. */
const backends: [string, () => Promise<AppFiles>][] = [
  ["memory", async () => new MemoryFiles()],
  ["Postgres (PGlite)", postgres],
];

describe.each(backends)("job store on %s", (_name, make) => {
  it("creates, lists, deletes, restores and keeps versions", async () => {
    const store = new FileJobStore(await make());
    const job = await store.create("Sari_Study Plan.docx", await docx("My name is Sari Wijaya and this is my study plan."));
    expect((await store.list()).map((j) => j.id)).toEqual([job.id]);
    const v1 = await store.addVersion(job.id, await docx("edited"), { label: "Your edits", kind: "edit" });
    expect(v1.current).toBe(1);
    expect(new TextDecoder().decode((await store.readVersion(job.id, 1)).slice(0, 2))).toBe("PK");
    const entry = await store.remove(job.id);
    expect(entry).toMatch(new RegExp(`^${job.id}_`));
    expect(await store.get(job.id)).toBeNull();
    expect(await store.list()).toEqual([]);
    expect((await store.listTrash()).map((t) => t.job.id)).toEqual([job.id]);
    const back = await store.restore(entry!);
    expect(back.versions).toHaveLength(2);
    expect((await store.list()).map((j) => j.id)).toEqual([job.id]);
    await expect(store.restore("../../etc")).rejects.toThrow(/Unknown/);
  }, 20_000);

  it("lists summaries without the change list, and rebuilds a missing index", async () => {
    const files = await make();
    const store = new FileJobStore(files);
    const job = await store.create("Essay.docx", await docx("An essay about my goals."));
    job.proofread = { at: "", version: 0, ai: false, changes: [{ rule: "x", kind: "fix", paragraph: 0, start: 0, end: 1, before: "a", after: "b" }], formatting: { deviated: false, runs: 0, paragraphs: 0 } };
    await store.save(job);
    const [listed] = await store.list();
    expect(listed.proofread?.changes).toEqual([]);
    expect(listed.proofread?.changeCount).toBe(1);
    expect((await store.get(job.id))?.proofread?.changes).toHaveLength(1);
    await files.remove("jobs/index.json");
    expect((await store.list()).map((j) => j.id)).toEqual([job.id]);
  }, 20_000);

  it("treats a proofread cut off long ago as not started, and keeps usage by month", async () => {
    const store = new FileJobStore(await make());
    const job = await store.create("Essay.docx", await docx("Text."));
    await store.save({ ...job, status: "proofreading", updatedAt: new Date(Date.now() - 10 * 60_000).toISOString() } as Job);
    expect((await store.get(job.id))?.status).toBe("new");
    await store.logUsage({ at: "2026-09-30T10:00:00Z", jobId: job.id, model: "m", costUsd: 0.1 });
    await store.logUsage({ at: "2026-10-01T10:00:00Z", jobId: job.id, model: "m", costUsd: 0.2 });
    await store.logUsage({ at: "2026-10-02T10:00:00Z", jobId: job.id, model: "m", costUsd: 0.3 });
    expect((await store.usage()).map((u) => u.costUsd)).toEqual([0.1, 0.2, 0.3]);
    expect(await store.spendSince("2026-10-01T00:00:00Z")).toBeCloseTo(0.5);
  }, 20_000);
});

describe("files", () => {
  it("refuses paths that leave the folder", () => {
    for (const p of ["../x", "a/../../b", "a\\b", "", "C:/x"]) expect(() => safePath(p)).toThrow();
    expect(safePath("/jobs/a/b.docx")).toBe("jobs/a/b.docx");
  });

  it("rules and rulebook: Karina's copy first, bundled defaults otherwise, with a backup on save", async () => {
    const mine = new MemoryFiles();
    const defaults = new MemoryFiles();
    await defaults.write("karina-style-guide.md", "# Guide");
    const cfg = new ConfigStore(mine, defaults);
    expect(await cfg.styleGuide()).toBe("# Guide");
    expect((await cfg.loadRules()).version).toBe(1);
    await cfg.saveStyleGuide("# Mine\r\n");
    await cfg.saveStyleGuide("# Mine v2");
    expect(await cfg.styleGuide()).toBe("# Mine v2");
    expect(await readText(mine, "karina-style-guide.backup.md")).toBe("# Mine\n");
  });
});

describe("Postgres files", () => {
  it("reads, writes, overwrites, lists folders, moves and deletes whole folders", async () => {
    const files = scoped(await postgres(), "data");
    await files.write("jobs/a/meta.json", "{}");
    await files.write("jobs/a/v0.docx", new Uint8Array([0, 1, 2, 255]));
    await files.write("jobs/a/meta.json", '{"v":2}');
    await files.write("jobs/ab.json", "x"); // shares the prefix "jobs/a" but isn't inside the folder
    expect(await readText(files, "jobs/a/meta.json")).toBe('{"v":2}');
    expect([...(await files.read("jobs/a/v0.docx"))!]).toEqual([0, 1, 2, 255]);
    expect((await files.list("jobs")).map((f) => [f.name, f.folder]).sort()).toEqual([["a", true], ["ab.json", false]]);
    expect(await files.move("jobs/a", "trash/a_1")).toBe(true);
    expect(await files.read("jobs/a/meta.json")).toBeNull();
    expect(await readText(files, "trash/a_1/meta.json")).toBe('{"v":2}');
    expect(await readText(files, "jobs/ab.json")).toBe("x");
    expect(await files.remove("trash")).toBe(true);
    expect(await files.list("trash")).toEqual([]);
    expect(await files.remove("trash")).toBe(false);
    expect(await files.move("nothing", "else")).toBe(false);
  }, 20_000);

  it("keeps large files intact", async () => {
    const files = await postgres();
    const big = new Uint8Array(3 * 1024 * 1024).map((_, i) => (i * 7) % 256);
    await files.write("big.docx", big);
    expect(Buffer.compare(Buffer.from((await files.read("big.docx"))!), Buffer.from(big))).toBe(0);
  }, 20_000);
});
