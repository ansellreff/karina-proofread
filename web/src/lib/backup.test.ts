import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createBackup, readManifest, restoreBackup, storageSummary } from "./backup";
import { MemoryFiles, readText } from "./storage/files";
import { storesOn } from "./storage/local";
import { TRASH_DAYS } from "./store/types";

async function docx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

const fresh = () => storesOn(new MemoryFiles(), "online");
const DAY = 86_400_000;

describe("Recently deleted", () => {
  it(`keeps a deleted document ${TRASH_DAYS} days, then deletes it forever; one or all can be deleted forever now`, async () => {
    const s = fresh();
    const a = await s.jobs.create("Bravo_Essay.docx", await docx("An essay."));
    const b = await s.jobs.create("Kilo_Essay.docx", await docx("Another essay."));
    const c = await s.jobs.create("Tango_Essay.docx", await docx("A third essay."));
    const ea = (await s.jobs.remove(a.id))!;
    await s.jobs.remove(b.id);
    const [entry] = await s.jobs.listTrash();
    expect(Date.parse(entry.expiresAt) - Date.parse(entry.deletedAt)).toBe(TRASH_DAYS * DAY);
    // a day before: kept; on the day: gone
    expect(await s.jobs.purgeExpired(Date.now() + (TRASH_DAYS - 1) * DAY)).toBe(0);
    expect(await s.jobs.trashCount()).toBe(2);
    expect((await s.jobs.listTrash(Date.now() + TRASH_DAYS * DAY + 1000)).length).toBe(0);
    expect(await s.data.read(`trash/${ea}/meta.json`)).toBeNull();
    // delete forever: one, then all
    const ec = (await s.jobs.remove(c.id))!;
    await s.jobs.purge(ec);
    expect(await s.jobs.trashCount()).toBe(0);
    await s.jobs.remove((await s.jobs.create("Delta_Essay.docx", await docx("Text.")))!.id);
    await s.jobs.remove((await s.jobs.create("Echo_Essay.docx", await docx("Text.")))!.id);
    expect(await s.jobs.emptyTrash()).toBe(2);
    expect(await s.jobs.listTrash()).toEqual([]);
  }, 20_000);
});

describe("backup", () => {
  it("one file with documents (all versions), learning, settings, rules and costs; restored into an empty app", async () => {
    const s = fresh();
    const job = await s.jobs.create("Alpha_Study Plan.docx", await docx("My name is Alpha Tester."));
    await s.jobs.addVersion(job.id, await docx("edited"), { label: "Your edits", kind: "edit" });
    await s.learn.files.write("records/r1.json", JSON.stringify({ id: "r1" }));
    await s.learn.files.write("state.json", JSON.stringify({ dismissed: ["x"] }));
    await s.jobs.saveSettings({ ...(await s.jobs.getSettings()), authorName: "Reviewer X." });
    await s.jobs.logUsage({ at: "2026-10-01T00:00:00Z", jobId: job.id, model: "m", costUsd: 0.1 });
    await s.config.saveStyleGuide("# My rulebook\n");
    const deleted = await s.jobs.create("Gone.docx", await docx("Deleted."));
    await s.jobs.remove(deleted.id);

    const { zip, manifest } = await createBackup(s);
    expect(manifest.counts).toMatchObject({ documents: 1, learning: 1 });
    expect(Object.keys(zip.files).some((p) => p.startsWith("data/trash/"))).toBe(false); // Recently deleted isn't in it
    const file = await zip.generateAsync({ type: "uint8array" });
    expect((await readManifest(await JSZip.loadAsync(file))).documents[0].id).toBe(job.id);

    // an empty app gets everything back (rules and settings only when asked)
    const t = fresh();
    const r = await restoreBackup(t, file, { settings: true });
    expect(r).toEqual({ documentsAdded: 1, documentsSkipped: 0, learningAdded: 1, settingsRestored: true });
    const back = await t.jobs.get(job.id);
    expect(back?.versions).toHaveLength(2);
    expect((await t.jobs.list()).map((j) => j.id)).toEqual([job.id]);
    expect(new TextDecoder().decode((await t.jobs.readVersion(job.id, 1)).slice(0, 2))).toBe("PK");
    expect((await t.jobs.getSettings()).authorName).toBe("Reviewer X.");
    expect(await t.config.styleGuide()).toBe("# My rulebook\n");
    expect(await readText(t.learn.files, "state.json")).toContain("dismissed");
    expect((await t.jobs.usage()).map((u) => u.costUsd)).toEqual([0.1]);
  }, 30_000);

  it("never overwrites: documents already here (or in Recently deleted) are skipped; costs are merged; settings stay unless asked", async () => {
    const s = fresh();
    const a = await s.jobs.create("Bravo_Essay.docx", await docx("First version."));
    const b = await s.jobs.create("Kilo_Essay.docx", await docx("Kilo."));
    await s.jobs.logUsage({ at: "2026-10-01T00:00:00Z", jobId: a.id, model: "m", costUsd: 0.1 });
    const file = await (await createBackup(s)).zip.generateAsync({ type: "uint8array" });

    // since the backup: Bravo edited, Kilo deleted, a new cost, the author name changed
    await s.jobs.addVersion(a.id, await docx("Newer."), { label: "Your edits", kind: "edit" });
    await s.jobs.remove(b.id);
    await s.jobs.logUsage({ at: "2026-10-02T00:00:00Z", jobId: a.id, model: "m", costUsd: 0.2 });
    await s.jobs.saveSettings({ ...(await s.jobs.getSettings()), authorName: "Changed" });

    const r = await restoreBackup(s, file);
    expect(r).toEqual({ documentsAdded: 0, documentsSkipped: 2, learningAdded: 0, settingsRestored: false });
    expect((await s.jobs.get(a.id))?.versions).toHaveLength(2); // the newer work is kept
    expect(await s.jobs.get(b.id)).toBeNull(); // still in Recently deleted, not duplicated
    expect((await s.jobs.usage()).map((u) => u.costUsd)).toEqual([0.1, 0.2]);
    expect((await s.jobs.getSettings()).authorName).toBe("Changed");
  }, 30_000);

  it("free up space deletes every document and Recently deleted, keeps rules, learning and settings; the summary measures it", async () => {
    const s = fresh();
    await s.jobs.create("Bravo_Essay.docx", await docx("A."));
    await s.jobs.remove((await s.jobs.create("Kilo_Essay.docx", await docx("B.")))!.id);
    await s.learn.files.write("records/r1.json", "{}");
    const before = await storageSummary(s);
    expect(before).toMatchObject({ documents: 1, trash: 1 });
    expect(before.documentsBytes).toBeGreaterThan(0);
    expect(await s.jobs.removeAllForever()).toBe(2);
    const after = await storageSummary(s);
    expect(after).toMatchObject({ documents: 0, trash: 0, documentsBytes: 0, trashBytes: 0 });
    expect(await s.learn.files.read("records/r1.json")).not.toBeNull();
  }, 20_000);

  it("refuses a file that isn't one of its backups", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await expect(restoreBackup(fresh(), await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/isn't a Karina Proofread backup/);
  });
});
