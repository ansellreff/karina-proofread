import { describe, expect, it } from "vitest";
import { buildFileName, DEFAULT_FILE_NAME, doneFileName, normalizeFormat, OLD_DEFAULT_FILE_NAME } from "./naming";
import { writeJson, MemoryFiles } from "./storage/files";
import { FileJobStore, guessNameFromFile } from "./store/job-store";
import type { Job } from "./store/types";

const day = new Date(2026, 9, 7);
const job = { studentName: "Sari Dewi", docType: "Autobiography", fileName: "Autobiography_(SARI) NTU.docx" } as Job;

describe("export file name", () => {
  it("default is DONE_<type>_<first name>_<YYYYMMDD>, the same for clean copies", () => {
    expect(doneFileName(job, "docx", DEFAULT_FILE_NAME, day)).toBe("DONE_Autobio_Sari_20261007.docx");
    expect(doneFileName(job, "pdf", undefined, day)).toBe("DONE_Autobio_Sari_20261007.pdf");
    const ruddy = { studentName: guessNameFromFile("Study Plan_Ruddy_20261005.docx"), docType: "Study Plan", fileName: "Study Plan_Ruddy_20261005.docx" } as Job;
    expect(doneFileName(ruddy, "docx", undefined, new Date(2026, 9, 21))).toBe("DONE_Study Plan_Ruddy_20261021.docx");
  });

  it("blocks in any order and number, with the chosen separator, date format and lengths", () => {
    const f = normalizeFormat({
      parts: [{ kind: "fullName", max: 4 }, { kind: "text", text: "REVISED" }, { kind: "date", format: "DD-MM-YYYY" }, { kind: "original", max: 12 }],
      separator: " ",
    });
    expect(doneFileName(job, "docx", f, day)).toBe("Sari REVISED 07-10-2026 Autobiograph.docx");
    expect(doneFileName(job, "docx", { parts: [{ kind: "docType" }, { kind: "firstName" }], separator: "" }, day)).toBe("AutobioSari.docx");
    expect(doneFileName(job, "docx", { parts: [{ kind: "date", format: "YYYY-MM-DD" }], separator: "-" }, day)).toBe("2026-10-07.docx");
  });

  it("keeps names safe: bad characters, empty blocks, unknown blocks and an empty format", () => {
    const f = normalizeFormat({ parts: [{ kind: "text", text: 'A/B:"C"?' }, { kind: "text", text: "  " }, { kind: "evil" }, { kind: "firstName", max: -3 }], separator: "/" });
    expect(f).toEqual({ parts: [{ kind: "text", text: "ABC" }, { kind: "firstName" }], separator: "_" });
    expect(normalizeFormat({ parts: [] })).toEqual(DEFAULT_FILE_NAME);
    expect(normalizeFormat(null)).toEqual(DEFAULT_FILE_NAME);
    expect(normalizeFormat({ parts: Array.from({ length: 20 }, () => ({ kind: "docType" })) }).parts).toHaveLength(10);
    expect(buildFileName({ parts: [{ kind: "text", text: "x." }], separator: "_" }, { studentName: null, docType: "Essay", fileName: "a.docx" }, "pdf")).toBe("x.pdf");
  });

  it("a saved copy of the old default reads as the new default; a customised format is kept", async () => {
    const files = new MemoryFiles();
    const store = new FileJobStore(files);
    await writeJson(files, "settings.json", { fileName: OLD_DEFAULT_FILE_NAME });
    expect((await store.getSettings()).fileName).toEqual(DEFAULT_FILE_NAME);
    const mine = { parts: [{ kind: "firstName" }, { kind: "text", text: "DONE" }], separator: "-" };
    await writeJson(files, "settings.json", { fileName: mine });
    expect((await store.getSettings()).fileName).toEqual(mine);
  });
});

describe("student name from the file name", () => {
  it("skips document types, dates and numbers, and words like DONE", () => {
    expect(guessNameFromFile("Study Plan_Ruddy_20261005.docx")).toBe("Ruddy");
    expect(guessNameFromFile("Study Plan_Ruddy_2026-10-05.docx")).toBe("Ruddy");
    expect(guessNameFromFile("Autobiography_Ruddy_05.10.2026_v2.docx")).toBe("Ruddy");
    expect(guessNameFromFile("DONE_Study Plan_Ruddy_20261021.docx")).toBe("Ruddy");
    expect(guessNameFromFile("SOP_Ruddy.docx")).toBe("Ruddy");
    expect(guessNameFromFile("Ruddy_Study Plan_20261005.docx")).toBe("Ruddy");
    // as before
    expect(guessNameFromFile("StudyPlan_(SINTA) NYUST.docx")).toBe("SINTA");
    expect(guessNameFromFile("Sinta_Autobiography.docx")).toBe("Sinta");
    expect(guessNameFromFile("StatementofPurpose_TSE NTHU_Someone.docx")).toBe("Someone");
    expect(guessNameFromFile("Study Plan_20261005.docx")).toBeNull();
  });

  it("a name saved earlier as a date is guessed again from the file name", async () => {
    const files = new MemoryFiles();
    const store = new FileJobStore(files);
    const id = "00000000-0000-4000-8000-000000000001";
    const now = new Date().toISOString();
    const saved = { id, fileName: "Study Plan_Ruddy_20261005.docx", docType: "Study Plan", studentName: "20261005", status: "ready", source: "upload", createdAt: now, updatedAt: now, versions: [], current: 0 };
    await store.save(saved as unknown as Job);
    expect((await store.get(id))?.studentName).toBe("Ruddy");
    expect((await store.list())[0].studentName).toBe("Ruddy");
  });
});
