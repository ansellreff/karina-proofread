import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { FakeGraph } from "../onedrive/fake-graph";
import { Graph, SIMPLE_UPLOAD_MAX } from "../onedrive/graph";
import { saveToDone, setupProject, toPdf } from "../onedrive/project";
import { ConfigStore } from "../rules/config-store";
import { FileJobStore } from "../store/job-store";
import type { Job } from "../store/types";
import { MemoryFiles, readText, safePath, scoped, type AppFiles } from "./files";
import { OneDriveFiles } from "./onedrive-files";
import { oneDriveStores } from "./stores";

async function docx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

function onedrive(): { fake: FakeGraph; files: OneDriveFiles; graph: Graph } {
  const fake = new FakeGraph();
  const graph = new Graph("token", fake.fetch, 0);
  return { fake, graph, files: new OneDriveFiles(graph, fake.folder("Karina Proofread")) };
}

/** The same job-store behaviour on every backend. */
const backends: [string, () => AppFiles][] = [
  ["memory", () => new MemoryFiles()],
  ["OneDrive (fake Graph)", () => scoped(onedrive().files, "App data")],
];

describe.each(backends)("job store on %s", (_name, make) => {
  it("creates, lists, deletes, restores and keeps versions", async () => {
    const store = new FileJobStore(make());
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
  });

  it("lists summaries without the change list, and rebuilds a missing index", async () => {
    const files = make();
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
  });

  it("treats a proofread cut off long ago as not started, and keeps usage by month", async () => {
    const store = new FileJobStore(make());
    const job = await store.create("Essay.docx", await docx("Text."));
    await store.save({ ...job, status: "proofreading", updatedAt: new Date(Date.now() - 10 * 60_000).toISOString() } as Job);
    expect((await store.get(job.id))?.status).toBe("new");
    await store.logUsage({ at: "2026-09-30T10:00:00Z", jobId: job.id, model: "m", costUsd: 0.1 });
    await store.logUsage({ at: "2026-10-01T10:00:00Z", jobId: job.id, model: "m", costUsd: 0.2 });
    await store.logUsage({ at: "2026-10-02T10:00:00Z", jobId: job.id, model: "m", costUsd: 0.3 });
    expect((await store.usage()).map((u) => u.costUsd)).toEqual([0.1, 0.2, 0.3]);
    expect(await store.spendSince("2026-10-01T00:00:00Z")).toBeCloseTo(0.5);
  });
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

describe("OneDrive through Graph", () => {
  it("reads, writes, lists, moves and deletes inside the project folder", async () => {
    const { files } = onedrive();
    await files.write("App data/jobs/a/meta.json", "{}");
    expect(await readText(files, "App data/jobs/a/meta.json")).toBe("{}");
    expect((await files.list("App data/jobs")).map((f) => [f.name, f.folder])).toEqual([["a", true]]);
    expect(await files.move("App data/jobs/a", "App data/trash/a_1")).toBe(true);
    expect(await files.read("App data/jobs/a/meta.json")).toBeNull();
    expect(await readText(files, "App data/trash/a_1/meta.json")).toBe("{}");
    expect(await files.remove("App data/trash")).toBe(true);
    expect(await files.list("App data/trash")).toEqual([]);
    expect(await files.read("nothing/here.json")).toBeNull();
  });

  it("uploads large files in chunks and waits out throttling", async () => {
    const { fake, files } = onedrive();
    const big = new Uint8Array(SIMPLE_UPLOAD_MAX + 1000).map((_, i) => i % 251);
    fake.throttle = 2;
    await files.write("App data/big.docx", big);
    // two throttled attempts, then the session; the file goes up in two chunks
    expect(fake.calls.filter((c) => c.includes("createUploadSession"))).toHaveLength(3);
    expect(fake.calls.filter((c) => /^PUT \/s\d+$/.test(c))).toHaveLength(2);
    expect(Buffer.compare(Buffer.from((await files.read("App data/big.docx"))!), Buffer.from(big))).toBe(0);
  });

  it("sets up the project folder, saves finished files to Done and converts to PDF", async () => {
    const fake = new FakeGraph();
    const folderId = fake.folder("Karina Proofread");
    const graph = new Graph("token", fake.fetch, 0);
    await setupProject(graph, folderId);
    expect((await graph.children(folderId)).map((i) => i.name).sort()).toEqual(["App data", "Done", "Inbox"]);
    const st = oneDriveStores({ accountId: "a", email: "k@example.com", name: "K", accessToken: "t", refreshToken: "r", expiresAt: 0, folderId }, fake.fetch);
    const job = await st.jobs.create("Sari_Study Plan.docx", await docx("My study plan."));
    expect(await saveToDone(st, job, "tracked")).toMatch(/^Done\/DONE_Sari_Study Plan_\d{8}\.docx$/);
    const pdf = await toPdf(st, await docx("x"));
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect((await new OneDriveFiles(graph, folderId).list("App data/tmp")).length).toBe(0); // the temporary file is gone
  });
});
