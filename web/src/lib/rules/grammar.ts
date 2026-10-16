import type { GrammarUse } from "./config";
import { bodyParas } from "./detect";
import { rulesOf, type RuleContext, type TextEdit } from "./types";

type HarperLinter = {
  lint(text: string, options?: { language?: "plaintext" }): Promise<HarperLint[]>;
  setup(): Promise<void>;
};
type HarperLint = {
  lint_kind(): string;
  span(): { start: number; end: number };
  suggestions(): { get_replacement_text(): string; kind(): number }[];
  get_problem_text(): string;
  message(): string;
};

let linter: Promise<HarperLinter> | null = null;

export async function getLinter(): Promise<HarperLinter> {
  if (!linter) {
    linter = (async () => {
      const harper = await import("harper.js");
      const { binaryInlined } = await import("harper.js/binaryInlined");
      const l = new harper.LocalLinter({ binary: binaryInlined, dialect: harper.Dialect.American }) as unknown as HarperLinter;
      await l.setup();
      return l;
    })();
  }
  return linter;
}

/*
 * Which lint kinds produce edits is set on the Review rules page (config.grammar). Defaults were tuned against
 * Karina's real edits (training/eval.py): Redundancy 3/3, Grammar 1/2, Spelling 5/12 (misses were US respellings,
 * now skipped) are her style. Real errors she tends not to mark ("my self" -> "myself", "passionate in" ->
 * "passionate about", a sentence starting in lower case) are "extra": applied, but flagged "beyond your style".
 * "Typo" is never used: on academic text it splits technical compounds ("multisensor" -> "multi sensor").
 * Capitalization is limited to sentence starts (elsewhere it "corrects" acronyms and names).
 */

/**
 * Only trust spelling fixes that capitalise a proper noun ("english" -> "English", "taiwan" -> "Taiwan").
 * Dictionary corrections are off: on academic text they change meaning ("prebiotic" -> "probiotic") and
 * break foreign or Indonesian words ("wushu" -> "wash"). Typos are left to the AI layer.
 */
function safeSpelling(problem: string, suggestion: string): boolean {
  return problem.toLowerCase() === suggestion.toLowerCase() && /^\p{Ll}/u.test(problem) && /^\p{Lu}/u.test(suggestion);
}

/** British vs American spelling is not something Karina changes ("programme", "behaviour" stay). */
function isSpellingVariant(problem: string, suggestion: string): boolean {
  const a = problem.toLowerCase();
  const b = suggestion.toLowerCase();
  const swaps: [RegExp, string][] = [
    [/our/g, "or"], [/is(e|ed|es|ing|ation|ations)\b/g, "iz$1"], [/ys(e|ed|es|ing)\b/g, "yz$1"], [/tre\b/g, "ter"],
    [/tres\b/g, "ters"], [/ll(ed|ing|er)\b/g, "l$1"], [/mme\b/g, "m"], [/mmes\b/g, "ms"], [/ence\b/g, "ense"], [/ogue\b/g, "og"],
  ];
  return swaps.some(([re, to]) => a.replace(re, to) === b) || swaps.some(([re, to]) => b.replace(re, to) === a);
}

/**
 * Harper (offline grammar checker) suggestions restricted to body prose.
 * Spelling suggestions are skipped for capitalised words (names, places, programs).
 */
/** A lint worth acting on (shared by the edits and the score). */
export function usableLint(kind: string, problem: string, replacement: string | null, message: string): boolean {
  if (kind === "Typo") return false;
  if (kind === "Spelling") return !/^\p{Lu}/u.test(problem) && replacement !== null && !isSpellingVariant(problem, replacement) && safeSpelling(problem, replacement);
  if (kind === "Capitalization") return /does not start with a capital/i.test(message);
  return true;
}

export async function grammarEdits(ctx: RuleContext, kinds?: Record<string, GrammarUse>): Promise<TextEdit[]> {
  const use = kinds ?? rulesOf(ctx).grammar;
  if (!Object.values(use).some((u) => u !== "off")) return [];
  const l = await getLinter();
  const out: TextEdit[] = [];
  for (const p of bodyParas(ctx)) {
    const lints = await l.lint(p.text, { language: "plaintext" });
    for (const lint of lints) {
      const kind = lint.lint_kind();
      const how = use[kind] ?? "off";
      if (how === "off") continue;
      const sugg = lint.suggestions();
      if (sugg.length === 0) continue;
      const { start, end } = lint.span();
      const problem = p.text.slice(start, end);
      const s = sugg[0];
      const repl = s.get_replacement_text();
      if (!usableLint(kind, problem, repl, lint.message())) continue;
      const beyondStyle = how === "extra";
      if (s.kind() === 2) out.push({ para: p.index, start: end, end, text: repl, rule: `harper:${kind}`, kind: "fix", beyondStyle });
      else out.push({ para: p.index, start, end, text: s.kind() === 1 ? "" : repl, rule: `harper:${kind}`, kind: "fix", beyondStyle });
    }
  }
  return out;
}
