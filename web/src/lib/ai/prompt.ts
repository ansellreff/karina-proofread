import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ChangeRecord } from "../pipeline";
import type { RuleContext } from "../rules/types";

function promptsDir(): string {
  const candidates = [path.join(process.cwd(), "prompts"), path.join(process.cwd(), "web", "prompts")];
  const found = candidates.find((d) => existsSync(path.join(d, "karina-style-guide.md")));
  if (!found) throw new Error("prompts/karina-style-guide.md not found");
  return found;
}

let cachedSystem: string | null = null;

/** Stable system prompt (cached by the API): role, Karina's rulebook, examples, output rules. */
export function systemPrompt(): string {
  if (cachedSystem) return cachedSystem;
  const dir = promptsDir();
  const guide = readFileSync(path.join(dir, "karina-style-guide.md"), "utf8");
  const examples = readFileSync(path.join(dir, "karina-examples.md"), "utf8");
  cachedSystem = `You proofread enrollment documents written by Indonesian students applying to universities in Taiwan, exactly the way Karina Octavia (an education consultant) reviews them in Microsoft Word with Track Changes. Your output becomes Karina's own tracked changes in the student's file, so it must read as if Karina typed it herself: her priorities, her amount of editing, her voice in notes.

<style_guide>
${guide}
</style_guide>

<examples>
${examples}
</examples>

<how_to_answer>
The document arrives as numbered paragraphs: [P12] text. Return JSON only, matching the schema.

- replacements: fix the student's words. "find" is copied exactly from paragraph P (include a few surrounding words if needed so it is unique in that paragraph); "replace" is the corrected text for exactly that span. Keep changes minimal and word-level, like Karina: change "have to" -> "must", not the whole sentence.
- insertions: add text after an exact anchor ("after" copied from paragraph P; empty string = end of the paragraph). Use kind "note" for Karina-style feedback: start with a space and put the note in parentheses, e.g. " (put the year)". Use kind "fix" for a missing word, e.g. after "graduation" insert " with". Notes may mix in casual Indonesian words the way Karina does ("ya", "nak", "samakan") - occasionally, in short notes.
- paragraph_deletions: only when Karina would cut a whole paragraph (e.g. a generic "My name is ..., a grade 12 student" intro in a study plan whose header already gives the name).
- suggestion_paragraphs: a new paragraph after a passage, starting "Suggestion:" (or "Example:"), when a passage needs restructuring and an inline note is not enough. Use sparingly.
- end_note_items: content-level points for the closing "Note:" block (guiding questions, AI-generated suspicion, structure advice, encouragement). The formatting reminder, page/word-length check and paragraph-balance point are added automatically - do not repeat them.
- beyond_style: true when the change is correct but goes beyond Karina's usual habits (a real error she tends to leave). These are flagged privately for her.
- reason: one short private sentence for Karina's review panel (plain English). It is never written into the document.

Rules:
- Paragraphs marked already_done were handled by the rules engine (header lines, formatting, the listed fixes). Never redo or contradict them, and never add a title, name, program or university line.
- Match Karina's volume: typically 5-30 changes per document. Don't over-edit good writing. Leave British spellings, correct word choices and the student's voice alone.
- Never rewrite a whole paragraph yourself; when it needs a rewrite, say so in a note, a "Better:" example or a Suggestion paragraph.
- Never mention AI, bots, assistants or tools in inserted text, except Karina's own habit of asking the student whether their text was AI-generated.
- Use straight apostrophes in text you add unless the surrounding text uses curly ones.
</how_to_answer>`;
  return cachedSystem;
}

/** The per-document user message. */
export function userPrompt(ctx: RuleContext, ruleChanges: ChangeRecord[]): string {
  const lines = ctx.paras
    .filter((p) => p.text.trim())
    .map((p) => `[P${p.index}${p.inTable ? " table" : ""}${p.isList ? " list" : ""}] ${p.text}`);
  const done = ruleChanges.map((c) =>
    c.kind === "paragraph" ? `- added paragraph near P${c.paragraph}: "${c.after}"` : `- P${c.paragraph}: "${c.before}" -> "${c.after}"`,
  );
  return `<document type="${ctx.docType}">
${lines.join("\n")}
</document>

<already_done>
${done.length ? done.join("\n") : "- (nothing)"}
</already_done>

Review this ${ctx.docType.toLowerCase()} in Karina's style and return the JSON.`;
}
