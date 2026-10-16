import { fill, type BuiltInRules } from "./config";
import { customInlineEdits } from "./custom";
import { atSentenceStart, lowerField } from "./text";
import { NARRATIVE, rulesOf, type RuleContext, type TextEdit } from "./types";

type Rule = (ctx: RuleContext) => TextEdit[];

const each = (ctx: RuleContext, re: RegExp, make: (m: RegExpExecArray, para: number, text: string) => TextEdit | null): TextEdit[] => {
  const out: TextEdit[] = [];
  for (const p of ctx.paras) {
    if (!p.text) continue;
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(p.text))) {
      const e = make(m, p.index, p.text);
      if (e) out.push(e);
      if (m[0] === "") r.lastIndex++;
    }
  }
  return out;
};

// A field of study: capitalised words joined by and/of/&/in, stopping before institution words.
const FIELD_STOP = "(?!(?:Program|Programme|Bachelor|Master|Department|Institute|University|Universitas|Faculty|School|College)\\b)";
const FIELD_WORD = `${FIELD_STOP}[A-Z][\\p{L}&’'\\-]*`;
const DEGREE_RE = new RegExp(
  `\\b(Bachelor|Master|bachelor|master)(['’]s)?\\s+(Degree|degree)(\\s+in\\s+${FIELD_WORD}(?:\\s+(?:(?:and|of|&|in)\\s+)?${FIELD_WORD})*)?`,
  "u",
);

/** "Bachelor’s degree in Chemistry" -> "bachelor's degree in chemistry"; "Master Degree" -> "master's degree". (19/20 in Karina's files) */
const degreeCase: Rule = (ctx) =>
  each(
    ctx,
    DEGREE_RE,
    (m, para, text) => {
      if (atSentenceStart(text, m.index)) return null;
      if (text[m.index - 1] === "(") return null; // "(Master’s Degree)" in header lines
      const level = m[1].toLowerCase();
      const field = m[4] ? m[4].replace(/^(\s+in\s+)(.*)$/su, (_, lead, f) => lead + lowerField(f)) : "";
      const replacement = `${level}'s degree${field}`;
      if (replacement === m[0].replace(/’/g, "'")) return null; // already lower-case; don't touch apostrophe style
      if (!m[2] && m[1] === level && m[3] === "degree" && !m[4]) {
        // "master degree" -> only the missing 's
        return { para, start: m.index + m[1].length, end: m.index + m[1].length, text: "'s", rule: "degree-case", kind: "fix" };
      }
      return { para, start: m.index, end: m.index + m[0].length, text: replacement, rule: "degree-case", kind: "fix" };
    },
  );

/** "Thesis :" -> "Thesis:" (single space only; aligned header labels keep their spacing). */
const spaceBeforeColon: Rule = (ctx) =>
  each(ctx, /(?<=[\p{L})\]])( ):(?=\s|$)/u, (m, para, text) => {
    if (text[m.index - 1] === " ") return null;
    return { para, start: m.index, end: m.index + 1, text: "", rule: "space-before-colon", kind: "fix" };
  });

/** "communication  to" -> "communication to" (mid-sentence only). */
const doubleSpace: Rule = (ctx) =>
  each(ctx, /(?<=[\p{Ll},)])( {2,})(?=[\p{Ll}(])/u, (m, para) => ({
    para,
    start: m.index,
    end: m.index + m[0].length,
    text: " ",
    rule: "double-space",
    kind: "fix",
  }));

/** "Proof of Concept servers" -> "Proof-of-Concept servers"; "hands on experience" -> "hands-on experience". */
const compounds: Rule = (ctx) => [
  ...each(ctx, /\b([Pp]roof) of ([Cc]oncept)(?= [a-z])/, (m, para) => ({
    para,
    start: m.index,
    end: m.index + m[0].length,
    text: `${m[1]}-of-${m[2]}`,
    rule: "hyphen-compound",
    kind: "fix",
  })),
  ...each(ctx, /\bhands on(?= (?:experience|practice|training|learning|approach|skills?|work|exposure)\b)/, (m, para) => ({
    para,
    start: m.index,
    end: m.index + m[0].length,
    text: "hands-on",
    rule: "hyphen-compound",
    kind: "fix",
  })),
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** English name of an Indonesian university -> official Indonesian name, first mention only. */
const indonesianUniversity: Rule = (ctx) => {
  const out: TextEdit[] = [];
  for (const { names, official } of rulesOf(ctx).lists.indonesianUniversities) {
    const alts = names.map((n) => n.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!alts.length || !official.trim()) continue;
    const re = new RegExp(`\\b(?:${alts.map((a) => escapeRe(a).replace(/\s+/g, "\\s+")).join("|")})\\b`);
    for (const p of ctx.paras) {
      const m = re.exec(p.text);
      if (!m) continue;
      const tail = p.text.slice(m.index + m[0].length, m.index + m[0].length + 25);
      const text = /Indonesia/.test(tail) ? official : `${official} Indonesia`;
      out.push({ para: p.index, start: m.index, end: m.index + m[0].length, text, rule: "indonesian-university", kind: "fix" });
      break;
    }
  }
  return out;
};

/** Write out Indonesian acronyms at first mention: "UIN" -> "UIN (Universitas Islam Negeri)". */
const indonesianAcronyms: Rule = (ctx) => {
  const out: TextEdit[] = [];
  for (const { acronym: acr, full } of rulesOf(ctx).lists.indonesianAcronyms) {
    if (!acr.trim() || !full.trim() || ctx.fullText.includes(full.replace(/ \.+$/, ""))) continue;
    for (const p of ctx.paras) {
      const m = new RegExp(`\\b${escapeRe(acr)}\\b`).exec(p.text);
      if (!m) continue;
      const before = p.text.slice(0, m.index).trimEnd();
      if (/[A-Z][\p{L}]+$/u.test(before) && !atSentenceStart(p.text, m.index)) break; // part of a name ("Fordigi BUMN Hackathon")
      let at = m.index + acr.length;
      if (p.text[at] === ")") at++;
      out.push({ para: p.index, start: at, end: at, text: ` (${full})`, rule: "indonesian-acronym", kind: "note" });
      break;
    }
  }
  return out;
};

/** "IPB" -> "Institut Pertanian Bogor (IPB)" at first mention, unless the full name is already there. */
const universityAcronyms: Rule = (ctx) => {
  const out: TextEdit[] = [];
  for (const { acronym: acr, full } of rulesOf(ctx).lists.universityAcronyms) {
    if (!acr.trim() || !full.trim() || ctx.fullText.includes(full)) continue;
    for (const p of ctx.paras) {
      const m = new RegExp(`(?<![(\\w])${escapeRe(acr)}(?![\\w)])`).exec(p.text);
      if (!m) continue;
      out.push({ para: p.index, start: m.index, end: m.index + acr.length, text: `${full} (${acr})`, rule: "university-acronym", kind: "fix" });
      break;
    }
  }
  return out;
};

/** A "Conclusion" heading in a personal document. */
const conclusionHeading: Rule = (ctx) => {
  if (!NARRATIVE.includes(ctx.docType)) return [];
  const kind = ctx.docType === "Autobiography" ? "autobiography" : ctx.docType.toLowerCase();
  for (const p of ctx.paras) {
    const m = /^\s*(?:\d+\.\s*|[IVX]+\.\s*)?(Conclusion|CONCLUSION|Closing|Summary)\s*$/.exec(p.text);
    if (m) {
      const at = p.text.trimEnd().length;
      const note = fill(rulesOf(ctx).builtIn.conclusionHeading.note, { heading: m[1], doctype: kind });
      return [{ para: p.index, start: at, end: at, text: ` (${note})`, rule: "conclusion-heading", kind: "note" }];
    }
  }
  return [];
};

/** Very long paragraph: Karina's inline reminder. Off by default: never matched her on the hold-out set (0/1). */
const longParagraph: Rule = (ctx) => {
  if (!NARRATIVE.includes(ctx.docType)) return [];
  const { note, maxSentences } = rulesOf(ctx).builtIn.longParagraph;
  return ctx.paras
    .filter((p) => !p.inTable && p.sentences >= maxSentences)
    .map((p) => {
      const at = p.text.trimEnd().length;
      return { para: p.index, start: at, end: at, text: ` (${note})`, rule: "long-paragraph", kind: "note" as const };
    });
};

/** Resume: durations without a year. */
const resumeYear: Rule = (ctx) => {
  if (ctx.docType !== "CV/Resume") return [];
  const note = rulesOf(ctx).builtIn.resumeYear.note;
  return ctx.paras
    .filter((p) => p.words < 20 && /\|/.test(p.text) && /\b\d+\s*(?:months?|days?|years?)\b/i.test(p.text) && !/\b(?:19|20)\d{2}\b/.test(p.text))
    .map((p) => {
      const at = p.text.trimEnd().length;
      return { para: p.index, start: at, end: at, text: ` (${note})`, rule: "resume-year", kind: "note" as const };
    });
};

/** Resume: a language without its level. */
const resumeLanguage: Rule = (ctx) => {
  if (ctx.docType !== "CV/Resume") return [];
  const note = rulesOf(ctx).builtIn.resumeLanguage.note;
  const out: TextEdit[] = [];
  for (const p of ctx.paras) {
    const lang = /^\s*Languages?\s*:.*?\bEnglish\b(?!\s*\()/i.exec(p.text);
    if (lang) {
      const at = lang.index + lang[0].length;
      out.push({ para: p.index, start: at, end: at, text: ` (${note})`, rule: "resume-language", kind: "note" });
    }
  }
  return out;
};

/** Built-in inline rules in priority order (earlier wins an overlap), each switchable on the Review rules page. */
const BUILT_IN: [keyof BuiltInRules | "custom", Rule][] = [
  ["degreeCase", degreeCase],
  ["spaceBeforeColon", spaceBeforeColon],
  ["doubleSpace", doubleSpace],
  ["hyphenCompounds", compounds],
  ["indonesianUniversity", indonesianUniversity],
  ["universityAcronyms", universityAcronyms],
  ["indonesianAcronyms", indonesianAcronyms],
  ["custom", customInlineEdits], // Karina's own replace/note rules
  ["conclusionHeading", conclusionHeading],
  ["longParagraph", longParagraph],
  ["resumeYear", resumeYear],
  ["resumeLanguage", resumeLanguage],
];

/** All inline edits the enabled rules make. */
export function inlineEdits(ctx: RuleContext): TextEdit[] {
  const b = rulesOf(ctx).builtIn;
  return BUILT_IN.flatMap(([id, r]) => (id === "custom" || b[id].enabled ? r(ctx) : []));
}
