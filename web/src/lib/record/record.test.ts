import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "../backup";
import { MemoryFiles } from "../storage/files";
import { storesOn } from "../storage/local";
import { levelOf, LEVELS } from "./levels";
import { summarize, type RecordEntry } from "./store";
import { recordState } from "./view";

async function docx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}
const fresh = () => storesOn(new MemoryFiles(), "online");

describe("Proofread record", () => {
  it("counts a document once, when first proofread; Mark as done ticks it finished; reopening clears the tick", async () => {
    const s = fresh();
    const a = await s.jobs.create("Bravo Tester_Essay.docx", await docx("An essay."));
    expect(await s.record.count(a, "rules")).toBe(1);
    expect(await s.record.count(a, "ai")).toBeNull(); // proofread again: not counted twice, method stays the first
    expect((await s.record.get(a.id))?.method).toBe("rules");
    expect((await s.record.get(a.id))?.firstName).toBe("Bravo");
    expect(await s.record.markDone(a)).toBeNull();
    expect((await s.record.summary()).finished).toBe(1);
    await s.record.unfinish(a.id);
    expect(await s.record.summary()).toMatchObject({ worked: 1, finished: 0 });
  });

  it("a document never counted is counted as manual when marked as done", async () => {
    const s = fresh();
    const b = await s.jobs.create("Kilo_Study Plan.docx", await docx("A plan."));
    expect(await s.record.markDone(b)).toBe(1);
    expect(await s.record.get(b.id)).toMatchObject({ method: "manual" });
    expect((await s.record.get(b.id))?.finishedAt).toBeTruthy();
  });

  it("finished documents stay when deleted, Recently deleted is emptied, or all documents are deleted", async () => {
    const s = fresh();
    const a = await s.jobs.create("Bravo_Essay.docx", await docx("A."));
    const b = await s.jobs.create("Kilo_Essay.docx", await docx("B."));
    await s.record.markDone(a);
    await s.record.markDone(b);
    await s.jobs.remove(a.id);
    await s.jobs.emptyTrash();
    await s.jobs.removeAllForever();
    expect((await recordState(s)).summary).toMatchObject({ worked: 2, finished: 2 });
  });

  it("safety net: an unfinished document deleted stops counting (back if restored) and leaves the record when deleted for good; a finished one stays", async () => {
    const s = fresh();
    const open = await s.jobs.create("Bravo_Essay.docx", await docx("Not finished."));
    const done = await s.jobs.create("Kilo_Essay.docx", await docx("Finished."));
    await s.record.count(open, "ai");
    await s.record.markDone(done);
    expect((await recordState(s)).summary).toMatchObject({ worked: 2, finished: 1 });

    // both deleted: the unfinished one stops counting while in Recently deleted, the finished one still counts
    const openEntry = (await s.jobs.remove(open.id))!;
    await s.jobs.remove(done.id);
    let state = await recordState(s);
    expect(state.summary).toMatchObject({ worked: 1, finished: 1 });
    expect(state.rows.find((r) => r.id === open.id)?.doc).toBe("trash");

    // restored: it counts again
    await s.jobs.restore(openEntry);
    expect((await recordState(s)).summary).toMatchObject({ worked: 2, finished: 1 });

    // deleted for good (Delete forever, the 7-day cleanup, Delete all documents): the unfinished entry is gone
    await s.jobs.remove(open.id);
    await s.jobs.emptyTrash();
    state = await recordState(s);
    expect(state.summary).toMatchObject({ worked: 1, finished: 1 });
    expect(await s.record.get(open.id)).toBeNull();
    expect(state.rows.find((r) => r.id === done.id)?.doc).toBe("deleted");

    // also after the 7-day cleanup
    const later = await s.jobs.create("Tango_Essay.docx", await docx("Started."));
    await s.record.count(later, "rules");
    await s.jobs.remove(later.id);
    await recordState(s, new Date(Date.now() + 8 * 86_400_000));
    expect(await s.record.get(later.id)).toBeNull();
  });

  it("goes into backups, and a restore adds missing entries without changing existing ones", async () => {
    const s = fresh();
    const a = await s.jobs.create("Bravo_Essay.docx", await docx("A."));
    await s.record.count(a, "ai");
    const file = await (await createBackup(s)).zip.generateAsync({ type: "uint8array" });
    const t = fresh();
    expect((await restoreBackup(t, file)).recordAdded).toBe(1);
    expect(await t.record.get(a.id)).toMatchObject({ method: "ai" });
    await t.record.markDone({ ...a });
    expect((await restoreBackup(t, file)).recordAdded).toBe(0);
    expect((await t.record.get(a.id))?.finishedAt).toBeTruthy(); // not overwritten by the older backup
  });

  it("counts students by first name among finished documents, per method, per type and per month; remove from record", async () => {
    const at = "2026-10-05T10:00:00Z";
    const e = (id: string, firstName: string | null, method: RecordEntry["method"], finished: boolean, docType = "Essay"): RecordEntry => ({
      id: id.padEnd(36, "0"), firstName, docType, method, countedAt: at, ...(finished ? { finishedAt: at } : {}),
    });
    const sum = summarize([e("a", "Bravo", "ai", true, "SOP"), e("b", "bravo", "rules", true), e("c", "Kilo", "manual", true), e("d", "Tango", "ai", false)], new Date("2026-10-20T00:00:00Z"));
    expect(sum).toMatchObject({ worked: 4, finished: 3, students: 2, byMethod: { ai: 2, rules: 1, manual: 1 } });
    expect(sum.byType[0]).toEqual({ docType: "Essay", worked: 3, finished: 2 });
    expect(sum.byMonth).toHaveLength(12);
    expect(sum.byMonth.at(-1)).toEqual({ month: "2026-10", worked: 4, finished: 3 });

    const s = fresh();
    const a = await s.jobs.create("Bravo_Essay.docx", await docx("A."));
    await s.record.count(a, "rules");
    expect(await s.record.remove(a.id)).toBe(true);
    expect((await s.record.summary()).worked).toBe(0);
  });

  it("levels go by finished documents", () => {
    expect(levelOf(0).level.id).toBe("ready");
    expect(levelOf(1).level.id).toBe("first");
    expect(levelOf(9)).toMatchObject({ level: { id: "first" }, next: { id: "bronze", at: 10 } });
    expect(levelOf(50).level.id).toBe("gold");
    expect(levelOf(5000)).toMatchObject({ level: { id: "hall" }, next: null });
    expect(LEVELS.map((l) => l.at)).toEqual([...LEVELS.map((l) => l.at)].sort((x, y) => x - y));
  });
});
