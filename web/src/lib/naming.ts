import type { Job } from "./store/types";

const SHORT_TYPE: Record<string, string> = {
  "Study Plan": "Study Plan",
  Autobiography: "Autobio",
  "Personal Statement": "Personal Statement",
  "Statement of Purpose": "SOP",
  Essay: "Essay",
  "CV/Resume": "Resume",
  "Recommendation Letter": "Recommendation Letter",
  "Video Script": "Video Script",
};

export const DATE_FORMATS = ["YYYYMMDD", "YYYY-MM-DD", "DD-MM-YYYY", "DDMMYYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const SEPARATORS = ["_", "-", " ", ""] as const;
export type Separator = (typeof SEPARATORS)[number];

/** One block of the export file name: Karina's own words, or a value filled in per document. */
export type NamePart =
  | { kind: "text"; text: string }
  | { kind: "firstName"; max?: number }
  | { kind: "fullName"; max?: number }
  | { kind: "docType" }
  | { kind: "date"; format: DateFormat }
  | { kind: "original"; max?: number };
export type PartKind = NamePart["kind"];

/** How exported files are named (Settings → Export file name). */
export interface FileNameFormat {
  parts: NamePart[];
  separator: Separator;
}

/** Karina's convention: DONE_<type>_<first name>_<YYYYMMDD> (the order students use: type, then name). */
export const DEFAULT_FILE_NAME: FileNameFormat = {
  parts: [{ kind: "text", text: "DONE" }, { kind: "docType" }, { kind: "firstName" }, { kind: "date", format: "YYYYMMDD" }],
  separator: "_",
};
/** The default until 2026-10-21; a saved copy of it is read as the new default (job-store getSettings). */
export const OLD_DEFAULT_FILE_NAME: FileNameFormat = {
  parts: [{ kind: "text", text: "DONE" }, { kind: "firstName" }, { kind: "docType" }, { kind: "date", format: "YYYYMMDD" }],
  separator: "_",
};

export const MAX_PARTS = 10;
export const MAX_TEXT = 40;
/** Windows/macOS refuse these in file names (and a name must not end in a dot or space). */
const BAD = /[\\/:*?"<>|\u0000-\u001f]/g;
export const cleanText = (s: string) => s.replace(BAD, "").replace(/\s+/g, " ");
const limit = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.min(60, Math.round(n)) : undefined);

/** A saved format, made safe: unknown blocks dropped, text cleaned, at most MAX_PARTS; nothing usable → the default. */
export function normalizeFormat(input: unknown): FileNameFormat {
  const raw = (input ?? {}) as { parts?: unknown; separator?: unknown };
  const separator = SEPARATORS.includes(raw.separator as Separator) ? (raw.separator as Separator) : DEFAULT_FILE_NAME.separator;
  const parts: NamePart[] = [];
  for (const p of Array.isArray(raw.parts) ? raw.parts : []) {
    const part = (p ?? {}) as Record<string, unknown>;
    switch (part.kind) {
      case "text": {
        const text = cleanText(String(part.text ?? "")).slice(0, MAX_TEXT);
        if (text.trim()) parts.push({ kind: "text", text });
        break;
      }
      case "firstName":
      case "fullName":
      case "original":
        parts.push({ kind: part.kind, ...(limit(part.max) ? { max: limit(part.max) } : {}) });
        break;
      case "docType":
        parts.push({ kind: "docType" });
        break;
      case "date":
        parts.push({ kind: "date", format: DATE_FORMATS.includes(part.format as DateFormat) ? (part.format as DateFormat) : "YYYYMMDD" });
        break;
    }
  }
  return parts.length ? { parts: parts.slice(0, MAX_PARTS), separator } : DEFAULT_FILE_NAME;
}

export function formatDate(date: Date, format: DateFormat): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return { YYYYMMDD: `${y}${m}${d}`, "YYYY-MM-DD": `${y}-${m}-${d}`, "DD-MM-YYYY": `${d}-${m}-${y}`, DDMMYYYY: `${d}${m}${y}` }[format];
}

/** What the blocks are filled with for one document. */
export interface NameValues {
  studentName: string | null;
  docType: string;
  fileName: string;
}

const cut = (s: string, max?: number) => (max ? s.slice(0, max).trim() : s);

function partValue(p: NamePart, v: NameValues, date: Date): string {
  const stem = v.fileName.replace(/\.(docx|pdf)$/i, "");
  const full = (v.studentName ?? stem).trim();
  switch (p.kind) {
    case "text":
      return p.text;
    case "firstName":
      return cut(full.split(/\s+/)[0] ?? "", p.max);
    case "fullName":
      return cut(full, p.max);
    case "docType":
      return SHORT_TYPE[v.docType] ?? "Document";
    case "date":
      return formatDate(date, p.format);
    case "original":
      return cut(stem, p.max);
  }
}

/** The file name for a download: the blocks in order, joined by the separator (empty blocks are left out). */
export function buildFileName(format: FileNameFormat, v: NameValues, ext: "docx" | "pdf", date = new Date()): string {
  const f = normalizeFormat(format);
  const pieces = f.parts.map((p) => cleanText(partValue(p, v, date)).trim()).filter(Boolean);
  const stem = pieces.join(f.separator).replace(/[. ]+$/, "").slice(0, 180) || "Document";
  return `${stem}.${ext}`;
}

/** Karina's file name for a document's download (Word, clean Word or PDF). */
export function doneFileName(job: Job, ext: "docx" | "pdf", format: FileNameFormat = DEFAULT_FILE_NAME, date = new Date()): string {
  return buildFileName(format, { studentName: job.studentName, docType: job.docType, fileName: job.fileName }, ext, date);
}
