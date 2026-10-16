/**
 * Karina's editable review rules. The Review rules page edits these; the rules engine, the AI prompt and the score
 * all read them. Saved as web/prompts/karina-rules.json (see config-store.ts). DEFAULT_RULES is the factory set,
 * learned from her reviewed documents, and the fallback for anything missing from the file.
 */
import type { DocType } from "./types";

export const DOC_TYPES: Exclude<DocType, "Unknown">[] = [
  "Study Plan", "Autobiography", "Personal Statement", "Statement of Purpose", "Essay", "CV/Resume", "Recommendation Letter", "Video Script",
];
const NARRATIVE_TYPES: DocType[] = ["Study Plan", "Autobiography", "Personal Statement", "Statement of Purpose", "Essay"];

export interface FormatStandard {
  font: string;
  sizePt: number;
  /** Text after the size in the reminder, e.g. "Title can be either 14pt or 16pt". */
  titleNote: string;
  alignment: "justified" | "left";
  lineSpacing: number;
  /** Spacing tighter than this is changed to `lineSpacing`. */
  minLineSpacing: number;
  margins: string;
  pageNumber: string;
  /** Document types whose body formatting is fixed automatically (tracked formatting changes). */
  autoFix: DocType[];
  /** First line of the formatting reminder in the end note. */
  reminderTitle: string;
}

export interface Toggle {
  enabled: boolean;
}
export interface NoteToggle extends Toggle {
  /** Wording of the note (placeholders in braces are filled in). */
  note: string;
}
export interface LengthLimit {
  docType: DocType;
  maxWords: number;
  /** End-note line when the document is longer. {words} and {pages} are filled in. */
  message: string;
}

export interface BuiltInRules {
  degreeCase: Toggle;
  spaceBeforeColon: Toggle;
  doubleSpace: Toggle;
  hyphenCompounds: Toggle;
  indonesianUniversity: Toggle;
  indonesianAcronyms: Toggle;
  universityAcronyms: Toggle;
  headerBlock: Toggle & { titles: Partial<Record<DocType, string>> };
  conclusionHeading: NoteToggle;
  longParagraph: NoteToggle & { maxSentences: number };
  resumeYear: NoteToggle;
  resumeLanguage: NoteToggle;
  endNote: Toggle & { heading: string };
  lengthCheck: Toggle & { limits: LengthLimit[]; withinMessage: string };
  essayLimit: Toggle & { message: string };
  paragraphBalance: Toggle & { message: string };
  listsAndTables: Toggle & { message: string };
  tooManySections: Toggle & { minSections: number; message: string };
}

/** How each grammar-checker category is used: off, part of Karina's style, or applied but flagged "beyond your style". */
export type GrammarUse = "off" | "style" | "extra";

/** A rule Karina adds herself: when something is (or isn't) in the document, do something. */
export interface CustomRule {
  id: string;
  enabled: boolean;
  /** Short name shown in the list. */
  label: string;
  /** Document types it applies to; empty = all. */
  docTypes: DocType[];
  action: "replace" | "note" | "end-note" | "ai";
  /** replace / note: the text to look for. end-note: used by the "mentions" / "doesn't mention" conditions. */
  find: string;
  match: "words" | "phrase" | "pattern";
  caseSensitive: boolean;
  /** replace / note: change only the first occurrence in the document, or every one. */
  occurrences: "first" | "all";
  /** end-note only. */
  condition: "always" | "mentions" | "missing" | "longer-than" | "shorter-than";
  words: number;
  /** replace: the new text. note / end-note: the note. ai: the instruction. */
  text: string;
}

export interface UniversityName {
  /** English names students use (each one is matched as written). */
  names: string[];
  official: string;
}
export interface Acronym {
  acronym: string;
  full: string;
}
export interface TaiwanUniversity {
  name: string;
  short: string[];
}

export interface RuleConfig {
  version: 1;
  format: FormatStandard;
  builtIn: BuiltInRules;
  grammar: Record<string, GrammarUse>;
  custom: CustomRule[];
  lists: {
    indonesianUniversities: UniversityName[];
    indonesianAcronyms: Acronym[];
    universityAcronyms: Acronym[];
    taiwanUniversities: TaiwanUniversity[];
  };
}

/** Grammar-checker categories with a plain-English description (shown on the rules page). */
export const GRAMMAR_KINDS: { kind: string; label: string; example: string }[] = [
  { kind: "Agreement", label: "Subject–verb and number agreement", example: "she have → she has" },
  { kind: "Grammar", label: "Grammar mistakes", example: "a apple → an apple" },
  { kind: "Spelling", label: "Proper nouns written in lower case", example: "english → English, taiwan → Taiwan" },
  { kind: "Redundancy", label: "Repeated or redundant words", example: "return back → return" },
  { kind: "Miscellaneous", label: "Other clear errors", example: "my self → myself" },
  { kind: "Eggcorn", label: "Misheard expressions", example: "for all intensive purposes → for all intents and purposes" },
  { kind: "Malapropism", label: "Wrong word that sounds similar", example: "affect ↔ effect" },
  { kind: "Usage", label: "Wrong preposition after a word", example: "passionate in → passionate about" },
  { kind: "Capitalization", label: "Sentence not starting with a capital letter", example: "you use … → You use …" },
  { kind: "Style", label: "Oxford comma (adds a comma before “and” in lists)", example: "red, green and blue → red, green, and blue" },
  { kind: "WordChoice", label: "Word choice and closed compounds", example: "guide book → guidebook" },
];

const narrative = (t: DocType) => NARRATIVE_TYPES.includes(t);

let n = 0;
const rule = (r: Partial<CustomRule> & Pick<CustomRule, "label" | "action" | "text">): CustomRule => ({
  id: `default-${++n}`,
  enabled: true,
  docTypes: [],
  find: "",
  match: "words",
  caseSensitive: false,
  occurrences: "first",
  condition: "always",
  words: 0,
  ...r,
});

export const DEFAULT_RULES: RuleConfig = {
  version: 1,
  format: {
    font: "Times New Roman",
    sizePt: 12,
    titleNote: "Title can be either 14pt or 16pt",
    alignment: "justified",
    lineSpacing: 1.5,
    minLineSpacing: 1.15,
    margins: "1 inch (2.54 cm) on all sides",
    pageNumber: "Bottom center or bottom right",
    autoFix: NARRATIVE_TYPES,
    reminderTitle: "ALWAYS REMEMBER BASIC WRITING FORMAT",
  },
  builtIn: {
    degreeCase: { enabled: true },
    spaceBeforeColon: { enabled: true },
    doubleSpace: { enabled: true },
    hyphenCompounds: { enabled: true },
    indonesianUniversity: { enabled: true },
    indonesianAcronyms: { enabled: true },
    universityAcronyms: { enabled: true },
    headerBlock: {
      enabled: true,
      titles: { "Study Plan": "STUDY PLAN", Autobiography: "AUTOBIOGRAPHY", "Personal Statement": "PERSONAL STATEMENT", "Statement of Purpose": "STATEMENT OF PURPOSE", Essay: "ESSAY" },
    },
    conclusionHeading: { enabled: true, note: "no need to write the title “{heading}”. It is not a report, but your personal {doctype}" },
    longParagraph: { enabled: false, maxSentences: 10, note: "the paragraph is too long, shorten it! 1 paragraph min. 3 sentences, max 5-6 sentences" },
    resumeYear: { enabled: true, note: "put the year" },
    resumeLanguage: { enabled: true, note: "how’s the level" },
    endNote: { enabled: true, heading: "Note:" },
    lengthCheck: {
      enabled: true,
      limits: [
        { docType: "Study Plan", maxWords: 1100, message: "Please check again the max required pages for the study plan in the guidebook. If not mentioned, usually 2-3 pages (4 pages max) or around 1000 words. This one is around {pages} pages ({words} words), try to make it shorter, compact and straight forward." },
        { docType: "Autobiography", maxWords: 850, message: "Usually, autobio consists of only 1-2 pages. This one is around {pages} pages, if you can shorten it into 2 pages, it will be good." },
        { docType: "Personal Statement", maxWords: 850, message: "Please check in the guidebook about the number of pages or words. If not mentioned, try to make it into 2 pages max." },
        { docType: "Statement of Purpose", maxWords: 850, message: "Please check in the guidebook about the number of pages or words. If not mentioned, try to make it into 2 pages max." },
      ],
      withinMessage: "Please check in the guidebook whether they specified certain limitation of pages or words. If not, you can proceed.",
    },
    essayLimit: { enabled: true, message: "The {ordinal} essay exceeds the max words of {limit}. Please check again, I found it is around {words} words." },
    paragraphBalance: { enabled: true, message: "Try to balance the number of sentences in each paragraph, I found some paragraphs are very long but others are just 1-2 sentences. For each paragraph, try to write min. 3 sentences and max 5-6 sentences." },
    listsAndTables: { enabled: true, message: "It is better to make narrative paragraphs rather than bullet points or tables, could save you more space and feel more personal." },
    tooManySections: { enabled: true, minSections: 6, message: "Does the university ask you to make it into {sections} points? Try to make it shorter, only into 3-4 points max." },
  },
  grammar: {
    Agreement: "style",
    Grammar: "style",
    Spelling: "style",
    Redundancy: "style",
    Miscellaneous: "extra",
    Eggcorn: "extra",
    Malapropism: "extra",
    Usage: "extra",
    Capitalization: "extra",
    Style: "off",
    WordChoice: "off",
  },
  custom: [
    rule({
      label: "CV: ask for the university's resume guidelines",
      docTypes: ["CV/Resume"],
      action: "end-note",
      text: "Could you send me the guidelines from the uni for the resume? If not, try to make it with Resume builder with ATS Friendly Concept.",
    }),
    rule({
      label: "Study plan: ask for the 1st and 2nd year plan",
      docTypes: ["Study Plan"],
      action: "end-note",
      condition: "missing",
      find: "first year; first-year; second year; second-year; 1st year; 1st-year; 2nd year; 2nd-year; year 1; year1; year 2; year2; first semester; second semester; 1st semester; 2nd semester",
      text: "What are you going to do during your studies? 1st year, 2nd year, you must put in detail to convince the committee that you have good preparation.",
    }),
    rule({
      label: "Ask “Why Taiwan?” when Taiwan is never mentioned",
      docTypes: ["Study Plan", "Autobiography", "Personal Statement", "Statement of Purpose"],
      action: "end-note",
      condition: "missing",
      match: "phrase",
      find: "Taiwan",
      text: "Why Taiwan? You didn’t mention why you chose Taiwan. What motivates you to pursue a degree in Taiwan?",
    }),
    rule({
      label: "Ask about the future plan",
      docTypes: ["Study Plan", "Personal Statement", "Statement of Purpose"],
      action: "end-note",
      condition: "missing",
      find: "future; career; after graduation; after graduating; after I graduate; after graduate; after completing; after finishing; long-term; long term; short-term; short term",
      text: "How’s your plan in the future? How will studying this major help you to find a suitable career or job?",
    }),
    rule({
      label: "“your university” → ask for the real university name",
      action: "note",
      find: "your university; your campus",
      text: "mention the university name, example: at National Taiwan University (NTU)",
    }),
  ],
  lists: {
    indonesianUniversities: [
      { names: ["Petra Christian University"], official: "Universitas Kristen Petra" },
      { names: ["Krida Wacana Christian University"], official: "Universitas Kristen Krida Wacana" },
      { names: ["Satya Wacana Christian University"], official: "Universitas Kristen Satya Wacana" },
      { names: ["Duta Wacana Christian University"], official: "Universitas Kristen Duta Wacana" },
      { names: ["Maranatha Christian University"], official: "Universitas Kristen Maranatha" },
      { names: ["Indonesia Christian University", "Christian University of Indonesia"], official: "Universitas Kristen Indonesia" },
      { names: ["Widya Mandala Catholic University", "Widya Mandala Surabaya Catholic University"], official: "Universitas Katolik Widya Mandala" },
      { names: ["Parahyangan Catholic University"], official: "Universitas Katolik Parahyangan" },
      { names: ["Soegijapranata Catholic University"], official: "Universitas Katolik Soegijapranata" },
      { names: ["Atma Jaya Catholic University of Indonesia"], official: "Universitas Katolik Indonesia Atma Jaya" },
      { names: ["Atma Jaya Yogyakarta University", "University of Atma Jaya Yogyakarta"], official: "Universitas Atma Jaya Yogyakarta" },
      { names: ["Jenderal Soedirman University"], official: "Universitas Jenderal Soedirman" },
      { names: ["Gadjah Mada University"], official: "Universitas Gadjah Mada" },
      { names: ["Airlangga University"], official: "Universitas Airlangga" },
      { names: ["Brawijaya University"], official: "Universitas Brawijaya" },
      { names: ["Diponegoro University"], official: "Universitas Diponegoro" },
      { names: ["Padjadjaran University"], official: "Universitas Padjadjaran" },
      { names: ["Hasanuddin University"], official: "Universitas Hasanuddin" },
      { names: ["Sebelas Maret University"], official: "Universitas Sebelas Maret" },
      { names: ["Bina Nusantara University"], official: "Universitas Bina Nusantara" },
      { names: ["Tarumanagara University"], official: "Universitas Tarumanagara" },
      { names: ["Pelita Harapan University"], official: "Universitas Pelita Harapan" },
      { names: ["Ciputra University"], official: "Universitas Ciputra" },
      { names: ["Prasetiya Mulya University"], official: "Universitas Prasetiya Mulya" },
      { names: ["Sanata Dharma University"], official: "Universitas Sanata Dharma" },
      { names: ["University of Indonesia"], official: "Universitas Indonesia" },
      { names: ["University of North Sumatra"], official: "Universitas Sumatera Utara" },
      { names: ["Andalas University"], official: "Universitas Andalas" },
      { names: ["Udayana University"], official: "Universitas Udayana" },
      { names: ["Sriwijaya University"], official: "Universitas Sriwijaya" },
      { names: ["Sepuluh Nopember Institute of Technology"], official: "Institut Teknologi Sepuluh Nopember" },
      { names: ["Bandung Institute of Technology"], official: "Institut Teknologi Bandung" },
      { names: ["Bogor Agricultural University"], official: "Institut Pertanian Bogor" },
      { names: ["Syarif Hidayatullah State Islamic University Jakarta", "Syarif Hidayatullah State Islamic University"], official: "Universitas Islam Negeri Syarif Hidayatullah Jakarta" },
      { names: ["Sunan Kalijaga State Islamic University"], official: "Universitas Islam Negeri Sunan Kalijaga" },
      { names: ["Islamic University of Indonesia"], official: "Universitas Islam Indonesia" },
      { names: ["Muhammadiyah University of Yogyakarta"], official: "Universitas Muhammadiyah Yogyakarta" },
    ],
    indonesianAcronyms: [
      { acronym: "UIN", full: "Universitas Islam Negeri" },
      { acronym: "BUMN", full: "Badan Usaha Milik Negara" },
      { acronym: "OJK", full: "Otoritas Jasa Keuangan" },
      { acronym: "SNI", full: "Standar Nasional Indonesia" },
      { acronym: "HIMA", full: "Himpunan Mahasiswa ...." },
    ],
    universityAcronyms: [
      { acronym: "IPB", full: "Institut Pertanian Bogor" },
      { acronym: "ITB", full: "Institut Teknologi Bandung" },
      { acronym: "ITS", full: "Institut Teknologi Sepuluh Nopember" },
      { acronym: "UGM", full: "Universitas Gadjah Mada" },
      { acronym: "UNAIR", full: "Universitas Airlangga" },
      { acronym: "UNDIP", full: "Universitas Diponegoro" },
      { acronym: "UNPAD", full: "Universitas Padjadjaran" },
      { acronym: "UNS", full: "Universitas Sebelas Maret" },
      { acronym: "UNHAS", full: "Universitas Hasanuddin" },
      { acronym: "UNY", full: "Universitas Negeri Yogyakarta" },
      { acronym: "UNJ", full: "Universitas Negeri Jakarta" },
      { acronym: "UPI", full: "Universitas Pendidikan Indonesia" },
      { acronym: "USU", full: "Universitas Sumatera Utara" },
      { acronym: "UNUD", full: "Universitas Udayana" },
      { acronym: "BINUS", full: "Universitas Bina Nusantara" },
      { acronym: "UPH", full: "Universitas Pelita Harapan" },
      { acronym: "UKRIDA", full: "Universitas Kristen Krida Wacana" },
      { acronym: "UAJY", full: "Universitas Atma Jaya Yogyakarta" },
      { acronym: "UMY", full: "Universitas Muhammadiyah Yogyakarta" },
      { acronym: "UNSOED", full: "Universitas Jenderal Soedirman" },
    ],
    taiwanUniversities: [
      { name: "National Taiwan University", short: ["NTU"] },
      { name: "National Cheng Kung University", short: ["NCKU"] },
      { name: "National Tsing Hua University", short: ["NTHU"] },
      { name: "National Yang Ming Chiao Tung University", short: ["NYCU"] },
      { name: "National Chengchi University", short: ["NCCU"] },
      { name: "National Taiwan University of Science and Technology", short: ["NTUST", "Taiwan Tech"] },
      { name: "National Taiwan Normal University", short: ["NTNU"] },
      { name: "National Sun Yat-sen University", short: ["NSYSU"] },
      { name: "National Central University", short: ["NCU"] },
      { name: "National Chung Hsing University", short: ["NCHU"] },
      { name: "National Taipei University of Technology", short: ["Taipei Tech", "NTUT"] },
      { name: "National Taipei University", short: ["NTPU"] },
      { name: "National Dong Hwa University", short: ["NDHU"] },
      { name: "National Changhua University of Education", short: ["NCUE"] },
      { name: "National Kaohsiung University of Science and Technology", short: ["NKUST"] },
      { name: "National Chung Cheng University", short: ["CCU"] },
      { name: "National Chiayi University", short: ["NCYU"] },
      { name: "National Pingtung University of Science and Technology", short: ["NPUST"] },
      { name: "National Ilan University", short: ["NIU"] },
      { name: "National United University", short: ["NUU"] },
      { name: "National University of Kaohsiung", short: ["NUK"] },
      { name: "National Taiwan Ocean University", short: ["NTOU"] },
      { name: "National Yunlin University of Science and Technology", short: ["YunTech"] },
      { name: "Southern Taiwan University of Science and Technology", short: ["STUST"] },
      { name: "Yuan Ze University", short: ["YZU"] },
      { name: "Chung Yuan Christian University", short: ["CYCU"] },
      { name: "Feng Chia University", short: ["FCU"] },
      { name: "Tunghai University", short: ["THU"] },
      { name: "Fu Jen Catholic University", short: ["FJU"] },
      { name: "Tamkang University", short: ["TKU"] },
      { name: "Asia University", short: [] },
      { name: "Chang Gung University", short: ["CGU"] },
      { name: "Kaohsiung Medical University", short: ["KMU"] },
      { name: "Taipei Medical University", short: ["TMU"] },
      { name: "China Medical University", short: ["CMU"] },
      { name: "Ming Chuan University", short: ["MCU"] },
      { name: "I-Shou University", short: ["ISU"] },
      { name: "Chaoyang University of Technology", short: ["CYUT"] },
      { name: "Ming Chi University of Technology", short: ["MCUT"] },
      { name: "Lunghwa University of Science and Technology", short: ["LHU"] },
    ],
  },
};

// ---------------------------------------------------------------------------------------------------------------

/** Fill anything missing from a saved file with the defaults (new built-in rules appear after an update). */
export function withDefaults(saved: Partial<RuleConfig> | null | undefined): RuleConfig {
  const d = DEFAULT_RULES;
  if (!saved) return structuredClone(d);
  const builtIn = { ...d.builtIn } as BuiltInRules;
  for (const k of Object.keys(d.builtIn) as (keyof BuiltInRules)[]) {
    (builtIn as unknown as Record<string, unknown>)[k] = { ...d.builtIn[k], ...(saved.builtIn?.[k] ?? {}) };
  }
  return structuredClone({
    version: 1,
    format: { ...d.format, ...(saved.format ?? {}) },
    builtIn,
    grammar: { ...d.grammar, ...(saved.grammar ?? {}) },
    custom: (saved.custom ?? d.custom).map((r) => ({ ...rule({ label: "", action: "note", text: "" }), ...r })),
    lists: { ...d.lists, ...(saved.lists ?? {}) },
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The regular expression for a custom rule's "find" text (throws on an invalid pattern). */
export function customPattern(r: Pick<CustomRule, "find" | "match" | "caseSensitive">, global = false): RegExp {
  const flags = `${r.caseSensitive ? "" : "i"}u${global ? "g" : ""}`;
  if (r.match === "pattern") return new RegExp(r.find, flags);
  // several alternatives separated by ";" (longest first, so "long-term plan" wins over "long-term")
  const alts = findAlternatives(r.find)
    .sort((a, b) => b.length - a.length)
    .map((a) => a.split(/\s+/).map(escapeRe).join("\\s+"));
  const any = alts.length ? `(?:${alts.join("|")})` : "";
  if (r.match === "phrase") return new RegExp(any, flags);
  return new RegExp(`(?<![\\p{L}\\p{N}])${any}(?![\\p{L}\\p{N}])`, flags);
}

/** "first year; 1st year" -> ["first year", "1st year"] (patterns are not split). */
export const findAlternatives = (find: string) => find.split(";").map((s) => s.trim()).filter(Boolean);

/** Problems that would stop the rules from working (shown on the page, and the file is not saved). */
export function validateRules(c: RuleConfig): string[] {
  const errors: string[] = [];
  const f = c.format;
  if (!f.font.trim()) errors.push("Formatting: the font name is empty.");
  if (!(f.sizePt >= 6 && f.sizePt <= 30)) errors.push("Formatting: the font size should be between 6 and 30 pt.");
  if (!(f.lineSpacing >= 1 && f.lineSpacing <= 3)) errors.push("Formatting: line spacing should be between 1 and 3.");
  if (!(f.minLineSpacing >= 1 && f.minLineSpacing <= f.lineSpacing)) errors.push("Formatting: the minimum line spacing should be between 1 and the standard spacing.");
  for (const l of c.builtIn.lengthCheck.limits) if (!(l.maxWords > 0)) errors.push(`Length check (${l.docType}): the word limit must be a number above 0.`);
  c.custom.forEach((r, i) => {
    const name = `Your rule ${i + 1}${r.label ? ` (“${r.label}”)` : ""}`;
    const needsFind = r.action === "replace" || r.action === "note" || (r.action === "end-note" && (r.condition === "mentions" || r.condition === "missing"));
    if (needsFind && !r.find.trim()) errors.push(`${name}: say which text to look for.`);
    if (needsFind && r.find.trim()) {
      try {
        if ("".match(customPattern(r)) || " ".match(customPattern(r))) errors.push(`${name}: the pattern matches empty text, so it would fire everywhere.`);
      } catch {
        errors.push(`${name}: the pattern is not valid.`);
      }
    }
    if (r.action !== "replace" && !r.text.trim()) errors.push(`${name}: the ${r.action === "ai" ? "instruction" : "note"} is empty.`);
    if (r.action === "end-note" && (r.condition === "longer-than" || r.condition === "shorter-than") && !(r.words > 0)) errors.push(`${name}: the word count must be above 0.`);
  });
  return errors;
}

/** Lines of the formatting reminder, generated from the standard so they always match what is enforced. */
export function formatReminder(f: FormatStandard): string[] {
  return [
    f.reminderTitle,
    `Font: ${f.font}`,
    `Font Size: ${f.sizePt} pt${f.titleNote ? ` (${f.titleNote})` : ""}`,
    `Line Spacing: ${f.lineSpacing}`,
    `Alignment: ${f.alignment === "justified" ? "Justified" : "Left"}`,
    `Margins: ${f.margins}`,
    `Page Number: ${f.pageNumber}`,
  ].filter((l) => l.trim());
}

/** Fill {placeholders} in a message. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

export const isNarrative = narrative;
