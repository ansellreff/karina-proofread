import type { NewParagraph } from "../docx/revise";

export type DocType =
  | "Study Plan"
  | "Autobiography"
  | "Personal Statement"
  | "Statement of Purpose"
  | "Essay"
  | "CV/Resume"
  | "Recommendation Letter"
  | "Video Script"
  | "Unknown";

/** Narrative application documents: Karina applies header, formatting and end-note checks to these. */
export const NARRATIVE: DocType[] = ["Study Plan", "Autobiography", "Personal Statement", "Statement of Purpose", "Essay"];

export interface ParaInfo {
  index: number;
  text: string;
  words: number;
  sentences: number;
  inTable: boolean;
  isList: boolean;
  /** Short line that looks like a heading or header field rather than body text. */
  isShort: boolean;
}

export interface RuleContext {
  fileName: string;
  docType: DocType;
  paras: ParaInfo[];
  fullText: string;
}

/** A text change inside one paragraph, in that paragraph's original character offsets. */
export interface TextEdit {
  para: number;
  start: number;
  end: number;
  text: string;
  rule: string;
  /** "fix" changes the student's text; "note" inserts Karina-style "( … )" feedback. */
  kind: "fix" | "note";
  /** Correct, but beyond Karina's usual habits. Flagged privately in the app, never in the document. */
  beyondStyle?: boolean;
}

export interface ParagraphInsert {
  /** Insert before or after paragraph `para`. */
  position: "before" | "after";
  para: number;
  paragraphs: NewParagraph[];
  rule: string;
}

export interface RuleOutput {
  edits: TextEdit[];
  inserts: ParagraphInsert[];
}
