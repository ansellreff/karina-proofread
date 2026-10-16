import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { FsJobStore } from "./fs-store";

async function docx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

const root = mkdtemp(path.join(os.tmpdir(), "kp-store-"));
afterAll(async () => rm(await root, { recursive: true, force: true }));

describe("deleting and restoring documents", () => {
  it("moves a deleted document to the trash and brings it back unchanged", async () => {
    const store = new FsJobStore(await root);
    const job = await store.create("Sari_Study Plan.docx", await docx("My name is Sari Wijaya and this is my study plan."));
    const entry = await store.remove(job.id);
    expect(entry).toMatch(new RegExp(`^${job.id}_`));
    expect(await store.get(job.id)).toBeNull();
    const trash = await store.listTrash();
    expect(trash.map((t) => t.job.id)).toContain(job.id);
    const back = await store.restore(entry!);
    expect(back).toEqual(job);
    expect(await store.listTrash()).toEqual([]);
  });

  it("refuses unknown trash entries", async () => {
    const store = new FsJobStore(await root);
    await expect(store.restore("../../etc")).rejects.toThrow(/Unknown/);
  });
});
