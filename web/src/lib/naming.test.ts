import { describe, expect, it } from "vitest";
import { buildFileName, DEFAULT_FILE_NAME, doneFileName, normalizeFormat } from "./naming";
import type { Job } from "./store/types";

const day = new Date(2026, 9, 7);
const job = { studentName: "Sari Dewi", docType: "Autobiography", fileName: "Autobiography_(SARI) NTU.docx" } as Job;

describe("export file name", () => {
  it("default stays Karina's DONE_<first name>_<type>_<YYYYMMDD>, the same for clean copies", () => {
    expect(doneFileName(job, "docx", DEFAULT_FILE_NAME, day)).toBe("DONE_Sari_Autobio_20261007.docx");
    expect(doneFileName(job, "pdf", undefined, day)).toBe("DONE_Sari_Autobio_20261007.pdf");
    expect(doneFileName({ ...job, studentName: null }, "docx", undefined, day)).toBe("DONE_Autobiography_(SARI)_Autobio_20261007.docx");
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
});
