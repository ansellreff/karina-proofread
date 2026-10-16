import type { BuiltInRules } from "@/lib/rules/config";

/** Plain-English names for the built-in checks on the Review rules page. */
export const TEXT_FIXES: { id: keyof BuiltInRules; label: string; example: string }[] = [
  { id: "degreeCase", label: "Degree and field names in lower case", example: "a Bachelor’s Degree in Chemistry → a bachelor's degree in chemistry (unless it starts a sentence after a full stop)" },
  { id: "spaceBeforeColon", label: "No space before a colon", example: "Thesis : → Thesis:" },
  { id: "doubleSpace", label: "No double spaces mid-sentence", example: "my  research → my research" },
  { id: "hyphenCompounds", label: "Hyphenated compounds before a noun", example: "hands on experience → hands-on experience" },
  { id: "indonesianUniversity", label: "Official names of Indonesian universities", example: "Petra Christian University → Universitas Kristen Petra Indonesia (list under Names & acronyms)" },
  { id: "universityAcronyms", label: "Write out Indonesian university acronyms", example: "IPB → Institut Pertanian Bogor (IPB)" },
  { id: "indonesianAcronyms", label: "Write out other Indonesian acronyms", example: "BUMN → BUMN (Badan Usaha Milik Negara)" },
];

export const NOTE_RULES: { id: "conclusionHeading" | "longParagraph" | "resumeYear" | "resumeLanguage"; label: string; when: string; placeholders?: string }[] = [
  { id: "conclusionHeading", label: "“Conclusion” heading in a personal document", when: "A line that only says Conclusion / Closing / Summary", placeholders: "{heading} = the heading, {doctype} = study plan, autobiography, …" },
  { id: "longParagraph", label: "Very long paragraph", when: "A paragraph with many sentences (number set below). Off by default: it rarely matched your reviews." },
  { id: "resumeYear", label: "CV: duration without a year", when: "A CV line like “Intern | Company | 6 Months” with no year" },
  { id: "resumeLanguage", label: "CV: language without a level", when: "“Languages: English …” with no level in brackets" },
];
