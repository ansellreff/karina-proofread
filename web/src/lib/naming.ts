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

/** Karina's naming convention: DONE_<Name>_<DocType>_<YYYYMMDD>.<ext> */
export function doneFileName(job: Job, ext: "docx" | "pdf", variant?: "clean", date = new Date()): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const name = (job.studentName ?? job.fileName.replace(/\.docx$/i, "")).split(/\s+/)[0].replace(/[\\/:*?"<>|]/g, "");
  const type = SHORT_TYPE[job.docType] ?? "Document";
  return `DONE_${name}_${type}_${ymd}${variant === "clean" ? "_clean" : ""}.${ext}`;
}
