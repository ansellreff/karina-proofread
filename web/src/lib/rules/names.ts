import type { BuiltInRules, RuleConfig } from "./config";
import type { DocType } from "./types";

const NAMES: Record<string, string> = {
  "degree-case": "Degree name in lower case", "space-before-colon": "Space before a colon", "double-space": "Double space",
  "hyphen-compound": "Hyphenated compound", "indonesian-university": "Official university name", "university-acronym": "University acronym",
  "indonesian-acronym": "Indonesian acronym", "conclusion-heading": "Conclusion heading", "long-paragraph": "Long paragraph",
  "resume-year": "CV: year", "resume-language": "CV: language level", "header-title": "Header: title", "header-fields": "Header lines", "end-note": "End Note block",
  "ai:fix": "AI: fixes", "ai:note": "AI: notes", "ai:delete": "AI: paragraph cuts", "ai:suggestion": "AI: suggestion paragraphs",
};

/** Built-in check behind each rule id the engine writes into its change list. */
export const BUILT_IN_OF: Record<string, keyof BuiltInRules> = {
  "degree-case": "degreeCase", "space-before-colon": "spaceBeforeColon", "double-space": "doubleSpace", "hyphen-compound": "hyphenCompounds",
  "indonesian-university": "indonesianUniversity", "indonesian-acronym": "indonesianAcronyms", "university-acronym": "universityAcronyms",
  "conclusion-heading": "conclusionHeading", "long-paragraph": "longParagraph", "resume-year": "resumeYear", "resume-language": "resumeLanguage",
  "header-title": "headerBlock", "header-fields": "headerBlock", "end-note": "endNote",
};

/** Plain name of a rule id ("degree-case", "harper:Agreement", "custom:<id>", "ai:fix"). */
export function ruleName(rule: string, rules?: RuleConfig): string {
  if (rule.startsWith("harper:")) return `Grammar checker (${rule.slice(7)})`;
  if (rule.startsWith("custom:")) {
    const r = rules?.custom.find((x) => x.id === rule.slice(7));
    return r ? `Your rule: ${r.label || r.find || r.text}` : "Your rule (since deleted)";
  }
  return NAMES[rule] ?? rule;
}

/** Can this rule be switched off on the Review rules page (and is it still on)? AI edits can't be, per rule. */
export function canSwitchOff(rule: string, rules: RuleConfig, docType?: DocType): boolean {
  if (rule.startsWith("harper:")) return !docType && (rules.grammar[rule.slice(7)] ?? "off") !== "off";
  if (rule.startsWith("custom:")) {
    const r = rules.custom.find((x) => x.id === rule.slice(7));
    if (!r?.enabled) return false;
    return !docType || r.docTypes.length === 0 || r.docTypes.includes(docType);
  }
  const key = BUILT_IN_OF[rule];
  return !!key && !docType && rules.builtIn[key].enabled;
}

/** The rules with that rule switched off (for one document type: only "Your rules" can be narrowed). */
export function switchOff(rules: RuleConfig, rule: string, docType: DocType | undefined, allTypes: DocType[]): RuleConfig {
  const next = structuredClone(rules);
  if (rule.startsWith("harper:")) next.grammar[rule.slice(7)] = "off";
  else if (rule.startsWith("custom:")) {
    const r = next.custom.find((x) => x.id === rule.slice(7));
    if (r && docType) r.docTypes = (r.docTypes.length ? r.docTypes : allTypes).filter((t) => t !== docType);
    else if (r) r.enabled = false;
  } else {
    const key = BUILT_IN_OF[rule];
    if (key) next.builtIn[key].enabled = false;
  }
  return next;
}
