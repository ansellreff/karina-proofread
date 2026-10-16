/**
 * What the bot could learn from Karina's finished documents. Computed fresh from all learned records every time;
 * nothing changes in her rules until she approves a proposal on the Review rules page.
 */
import { customPattern, DOC_TYPES, formatReminder, type CustomRule, type RuleConfig } from "../rules/config";
import { canSwitchOff, ruleName } from "../rules/names";
import type { DocType } from "../rules/types";
import { norm, words } from "./diff";
import { applyIn, overlaps, type LearnedRecord, type NetEdit, type Outcome } from "./record";

/** A before/after excerpt: the sentence around an edit, with the student's name removed. */
export interface Sample {
  lead: string;
  before: string;
  after: string;
  tail: string;
  docType: DocType;
}

export interface LearnedExample {
  key: string;
  docType: DocType;
  kind: "note" | "rewrite";
  /** "[-deleted-]{+inserted+}" in its sentence, like prompts/karina-examples.md. */
  text: string;
  addedAt: string;
}

export interface LearnState {
  /** Proposal keys Karina dismissed: never proposed again. */
  dismissed: string[];
  /** Approved examples for the AI (sent with every AI proofread). */
  examples: LearnedExample[];
}

interface Base {
  key: string;
  /** Learned records the evidence comes from. */
  records: string[];
  samples: Sample[];
}

export type Proposal =
  | (Base & { type: "replace"; rule: CustomRule; times: number; docs: number; matches: number; right: number })
  | (Base & { type: "end-note"; rule: CustomRule; docs: number; ofDocs: number })
  | (Base & { type: "switch-off"; ruleId: string; label: string; docType?: DocType; n: number; kept: number; changed: number; rejected: number })
  | (Base & { type: "example"; example: Omit<LearnedExample, "addedAt"> });

export interface Tally {
  n: number;
  kept: number;
  changed: number;
  rejected: number;
}

export interface RuleStat extends Tally {
  rule: string;
  label: string;
}

export interface LearnStats {
  documents: number;
  byType: Partial<Record<DocType, number>>;
  /** Every bot suggestion in the learned documents. */
  suggestions: Tally;
  /** Edits Karina made that the bot hadn't suggested. */
  ownEdits: number;
  rules: RuleStat[];
}

/** Thresholds. A proposal needs repeated, consistent evidence, the way the built-in rules were chosen. */
export const LEARN = {
  replace: { times: 3, docs: 2, precision: 0.8 },
  endNote: { docs: 2, share: 0.25 },
  switchOff: { n: 4, useful: 0.3 },
  examples: { perType: 5, perRecord: 2, max: 30 },
};

// ---------------------------------------------------------------------------------------------- helpers

export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace the student's name (each part of 3+ letters) with "[Name]". */
export function anonymise(s: string, names: string[]): string {
  const parts = [...new Set(names.flatMap((n) => n.split(/\s+/)).filter((p) => p.length >= 3))];
  let out = s;
  for (const p of parts) out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(p)}(?![\\p{L}])`, "giu"), "[Name]");
  return out.replace(/\[Name\](?:\s+\[Name\])+/g, "[Name]");
}

function paragraphOf(rec: LearnedRecord, at: number): { start: number; end: number } {
  let i = rec.starts.length - 1;
  while (i > 0 && rec.starts[i] > at) i--;
  const start = rec.starts[i] ?? 0;
  const next = rec.starts[i + 1];
  return { start, end: next === undefined ? rec.text.length : next - 1 };
}

/** The sentence around [start, end) with the edit marked. */
export function sampleOf(rec: LearnedRecord, start: number, end: number, after: string): Sample {
  const p = paragraphOf(rec, start);
  const para = rec.text.slice(p.start, p.end);
  const s = start - p.start;
  const e = end - p.start;
  let a = 0;
  for (const m of para.slice(0, s).matchAll(/[.!?]["”’)]?\s+/g)) a = m.index + m[0].length;
  const stop = para.slice(e).search(/[.!?](?:\s|$)/);
  const b = stop < 0 ? para.length : e + stop + 1;
  const clip = (t: string, max: number, fromEnd: boolean) => (t.length <= max ? t : fromEnd ? `…${t.slice(-max)}` : `${t.slice(0, max)}…`);
  const anon = (t: string) => anonymise(t, rec.names);
  return {
    lead: anon(clip(para.slice(Math.max(a, 0), s), 120, true)),
    before: anon(rec.text.slice(start, end)),
    after: anon(after),
    tail: anon(clip(para.slice(e, b), 120, false)),
    docType: rec.docType,
  };
}

export const redline = (x: Sample) => `${x.lead}${x.before ? `[-${x.before}-]` : ""}${x.after ? `{+${x.after}+}` : ""}${x.tail}`.trim();

/** Karina's edits the bot hadn't suggested (no bot suggestion at that place). */
function ownEdits(rec: LearnedRecord): NetEdit[] {
  return rec.edits.filter((e) => !rec.outcomes.some((o) => (o.kind === "paragraph") === !!e.paragraphs && overlaps(o, e)));
}

function safePattern(r: Pick<CustomRule, "find" | "match" | "caseSensitive">, global = false): RegExp | null {
  try {
    return customPattern(r, global);
  } catch {
    return null;
  }
}

const mostCommon = (xs: string[]) => {
  const count = new Map<string, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
};

const firstWords = (s: string, n = 6) => norm(s).replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");

function tally(outcomes: Outcome[]): Tally {
  return {
    n: outcomes.length,
    kept: outcomes.filter((o) => o === "kept").length,
    changed: outcomes.filter((o) => o === "changed").length,
    rejected: outcomes.filter((o) => o === "rejected").length,
  };
}

// ---------------------------------------------------------------------------------------------- proposals

function replaceProposals(records: LearnedRecord[], rules: RuleConfig): Proposal[] {
  const groups = new Map<string, { rec: LearnedRecord; e: NetEdit }[]>();
  for (const rec of records) {
    for (const e of ownEdits(rec)) {
      if (e.paragraphs || e.category !== "fix" || e.before.includes("\n") || e.after.includes("\n")) continue;
      const before = e.before.trim();
      if (!/\p{L}/u.test(before) || words(before) > 4 || words(e.after) > 5) continue;
      if (anonymise(before, rec.names) !== before) continue; // the student's name
      const caseOnly = before.toLowerCase() === e.after.trim().toLowerCase();
      const key = caseOnly ? `c:${before}→${e.after.trim()}` : `${norm(before)}→${norm(e.after)}`;
      groups.set(key, [...(groups.get(key) ?? []), { rec, e }]);
    }
  }
  const out: Proposal[] = [];
  for (const [key, hits] of groups) {
    const docs = new Set(hits.map((h) => h.rec.id));
    if (hits.length < LEARN.replace.times || docs.size < LEARN.replace.docs) continue;
    const before = mostCommon(hits.map((h) => h.e.before.trim()));
    const after = mostCommon(hits.map((h) => h.e.after.trim()));
    const caseOnly = key.startsWith("c:");
    const alts = [before, before.replace(/’/g, "'"), before.replace(/'/g, "’")];
    const find = [...new Set(alts)].join("; ");
    const types = [...new Set(hits.map((h) => h.rec.docType))].filter((t) => t !== "Unknown");
    const docTypes: DocType[] = types.length >= 3 || !types.length ? [] : types;
    const covered = rules.custom.some((r) => {
      if (!r.enabled || r.action !== "replace") return false;
      const re = safePattern(r);
      return !!re && re.test(before) && norm(r.text) === norm(after);
    });
    if (covered) continue;

    // Precision: everywhere the rule would fire in the learned documents, did Karina make this change?
    const re = safePattern({ find, match: "words", caseSensitive: caseOnly }, true);
    if (!re) continue;
    let matches = 0;
    let right = 0;
    for (const rec of records) {
      if (docTypes.length && !docTypes.includes(rec.docType)) continue;
      for (const m of rec.text.matchAll(re)) {
        const ms = m.index;
        const me = ms + m[0].length;
        matches++;
        const near = rec.edits.filter((x) => !x.paragraphs && overlaps(x, { start: ms, end: me }));
        if (!near.length) continue;
        const w0 = Math.min(ms, ...near.map((x) => x.start));
        const w1 = Math.max(me, ...near.map((x) => x.end));
        const hers = applyIn(rec.text, w0, w1, near);
        const rule = applyIn(rec.text, w0, w1, [{ start: ms, end: me, after }]);
        const same = caseOnly ? hers.replace(/\s+/g, " ") === rule.replace(/\s+/g, " ") : norm(hers) === norm(rule);
        if (same) right++;
      }
    }
    if (right < LEARN.replace.times || right / Math.max(1, matches) < LEARN.replace.precision) continue;
    const label = after ? `“${before}” → “${after}”` : `Remove “${before}”`;
    out.push({
      type: "replace",
      key: `rule:${key}`,
      records: [...docs],
      samples: hits.slice(0, 3).map((h) => sampleOf(h.rec, h.e.start, h.e.end, h.e.after)),
      times: hits.length,
      docs: docs.size,
      matches,
      right,
      rule: {
        id: `r-learned-${hash(key)}`, enabled: true, label: `Learned: ${label}`, docTypes, action: "replace", find, match: "words",
        caseSensitive: caseOnly, occurrences: "all", condition: "always", words: 0, text: after,
      },
    });
  }
  return out.sort((a, b) => (b as { times: number }).times - (a as { times: number }).times);
}

/** End-note lines the engine writes itself (formatting reminder, length checks…), so they are never proposed. */
function builtInLines(rules: RuleConfig): Set<string> {
  const b = rules.builtIn;
  const lines = [
    ...formatReminder(rules.format), b.lengthCheck.withinMessage, ...b.lengthCheck.limits.map((l) => l.message),
    b.essayLimit.message, b.paragraphBalance.message, b.listsAndTables.message, b.tooManySections.message,
  ];
  return new Set(lines.map((l) => firstWords(l)));
}

function endNoteProposals(records: LearnedRecord[], rules: RuleConfig): Proposal[] {
  const known = builtInLines(rules);
  for (const r of rules.custom) if (r.action === "end-note") known.add(firstWords(r.text));
  const groups = new Map<string, { rec: LearnedRecord; line: string; e: NetEdit }[]>();
  for (const rec of records) {
    const bot = new Set(rec.outcomes.filter((o) => o.kind === "paragraph").flatMap((o) => o.after.split("\n").map((l) => norm(l))));
    for (const e of rec.edits.filter((x) => x.category === "end-note")) {
      for (const raw of e.after.split("\n")) {
        const line = raw.trim();
        if (words(line) < 4 || bot.has(norm(line))) continue;
        const k = firstWords(line);
        if (known.has(k)) continue;
        const key = `${rec.docType}|${k}`;
        const list = groups.get(key) ?? [];
        if (!list.some((x) => x.rec.id === rec.id)) groups.set(key, [...list, { rec, line, e }]);
      }
    }
  }
  const ofType = (t: DocType) => records.filter((r) => r.docType === t).length;
  const out: Proposal[] = [];
  for (const [key, hits] of groups) {
    const docType = hits[0].rec.docType;
    const of = ofType(docType);
    if (hits.length < LEARN.endNote.docs || hits.length < LEARN.endNote.share * of || docType === "Unknown") continue;
    const text = mostCommon(hits.map((h) => anonymise(h.line, h.rec.names)));
    out.push({
      type: "end-note",
      key: `end:${key}`,
      records: hits.map((h) => h.rec.id),
      samples: hits.slice(0, 3).map((h) => ({ lead: "", before: "", after: anonymise(h.line, h.rec.names), tail: "", docType })),
      docs: hits.length,
      ofDocs: of,
      rule: {
        id: `r-learned-${hash(key)}`, enabled: true, label: `Learned: ${docType} end note “${firstWords(text, 5)}…”`, docTypes: [docType], action: "end-note",
        find: "", match: "words", caseSensitive: false, occurrences: "first", condition: "always", words: 0, text,
      },
    });
  }
  return out.sort((a, b) => (b as { docs: number }).docs - (a as { docs: number }).docs);
}

function switchOffProposals(records: LearnedRecord[], rules: RuleConfig): Proposal[] {
  const byRule = new Map<string, { rec: LearnedRecord; o: LearnedRecord["outcomes"][number] }[]>();
  for (const rec of records) for (const o of rec.outcomes) byRule.set(o.rule, [...(byRule.get(o.rule) ?? []), { rec, o }]);
  const out: Proposal[] = [];
  const unhelpful = (t: Tally, min: number) => t.n >= min && (t.kept + t.changed) / t.n <= LEARN.switchOff.useful;
  // Her habits change: a rule she ignored in older reviews may be one she uses now. Only propose switching it
  // off when it is just as unhelpful in the newest half of the documents.
  const recentHalf = (list: { rec: LearnedRecord; o: LearnedRecord["outcomes"][number] }[]) => {
    const recs = [...new Set(list.map((x) => x.rec))].sort((a, b) => (b.reviewedAt ?? b.learnedAt).localeCompare(a.reviewedAt ?? a.learnedAt));
    const keep = new Set(recs.slice(0, Math.max(2, Math.ceil(recs.length / 2))));
    return list.filter((x) => keep.has(x.rec));
  };
  const useless = (list: { rec: LearnedRecord; o: LearnedRecord["outcomes"][number] }[]) =>
    unhelpful(tally(list.map((x) => x.o.outcome)), LEARN.switchOff.n) && unhelpful(tally(recentHalf(list).map((x) => x.o.outcome)), 2);
  const make = (ruleId: string, list: { rec: LearnedRecord; o: LearnedRecord["outcomes"][number] }[], docType?: DocType): Proposal => {
    const t = tally(list.map((x) => x.o.outcome));
    return {
      type: "switch-off",
      key: `off:${ruleId}:${docType ?? "all"}`,
      records: [...new Set(list.map((x) => x.rec.id))],
      samples: list.filter((x) => x.o.outcome === "rejected").slice(0, 3).map((x) => sampleOf(x.rec, x.o.start, x.o.end, x.o.after)),
      ruleId,
      label: ruleName(ruleId, rules),
      docType,
      ...t,
    };
  };
  for (const [ruleId, list] of byRule) {
    if (ruleId.startsWith("ai:")) continue;
    if (useless(list)) {
      if (canSwitchOff(ruleId, rules)) out.push(make(ruleId, list));
      continue;
    }
    if (!ruleId.startsWith("custom:")) continue;
    for (const t of DOC_TYPES) {
      const sub = list.filter((x) => x.rec.docType === t);
      if (useless(sub) && canSwitchOff(ruleId, rules, t)) out.push(make(ruleId, sub, t));
    }
  }
  return out;
}

function exampleProposals(records: LearnedRecord[], state: LearnState): Proposal[] {
  const have = new Set(state.examples.map((x) => x.key));
  const cands: { p: Proposal & { type: "example" }; score: number; rec: string }[] = [];
  for (const rec of records) {
    for (const e of ownEdits(rec)) {
      if (e.paragraphs || e.before.includes("\n") || e.after.includes("\n")) continue;
      const wb = words(e.before);
      const wa = words(e.after);
      let kind: "note" | "rewrite";
      if (e.category === "inline-note" && wa >= 2 && wa <= 40) kind = "note";
      else if (e.category === "fix" && wb + wa >= 3 && wb <= 25 && wa <= 25 && norm(e.before) !== norm(e.after)) kind = "rewrite";
      else continue;
      const key = `ex:${hash(`${rec.docType}|${norm(e.before)}→${norm(e.after)}`)}`;
      if (have.has(key)) continue;
      const sample = sampleOf(rec, e.start, e.end, e.after);
      cands.push({
        p: { type: "example", key, records: [rec.id], samples: [sample], example: { key, docType: rec.docType, kind, text: redline(sample) } },
        // notes carry her voice; then rewrites of a few words (the size the AI should copy)
        score: (kind === "note" ? 2 : 1) - Math.abs(wb + wa - 8) / 40,
        rec: rec.id,
      });
    }
  }
  const out: Proposal[] = [];
  const perType = new Map<string, number>();
  const perRec = new Map<string, number>();
  const seen = new Set<string>();
  for (const c of cands.sort((a, b) => b.score - a.score)) {
    const t = c.p.example.docType;
    if (seen.has(c.p.key) || (perType.get(t) ?? 0) >= LEARN.examples.perType || (perRec.get(c.rec) ?? 0) >= LEARN.examples.perRecord) continue;
    seen.add(c.p.key);
    perType.set(t, (perType.get(t) ?? 0) + 1);
    perRec.set(c.rec, (perRec.get(c.rec) ?? 0) + 1);
    out.push(c.p);
  }
  return out;
}

export function learnStats(records: LearnedRecord[], rules: RuleConfig): LearnStats {
  const byType: Partial<Record<DocType, number>> = {};
  for (const r of records) byType[r.docType] = (byType[r.docType] ?? 0) + 1;
  const all = records.flatMap((r) => r.outcomes);
  const ids = [...new Set(all.map((o) => o.rule))];
  return {
    documents: records.length,
    byType,
    suggestions: tally(all.map((o) => o.outcome)),
    ownEdits: records.reduce((n, r) => n + ownEdits(r).length, 0),
    rules: ids
      .map((rule) => ({ rule, label: ruleName(rule, rules), ...tally(all.filter((o) => o.rule === rule).map((o) => o.outcome)) }))
      .sort((a, b) => b.n - a.n),
  };
}

export function propose(records: LearnedRecord[], rules: RuleConfig, state: LearnState): Proposal[] {
  const dismissed = new Set(state.dismissed);
  return [
    ...replaceProposals(records, rules),
    ...endNoteProposals(records, rules),
    ...switchOffProposals(records, rules),
    ...exampleProposals(records, state),
  ].filter((p) => !dismissed.has(p.key));
}
