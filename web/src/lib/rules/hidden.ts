/**
 * Hidden characters: invisible Unicode that copy-paste (from AI chats, web pages, PDFs) leaves in a text, unusual
 * space characters, and look-alike letters from another alphabet hidden inside an English word. The rule removes
 * or replaces them as ordinary tracked changes, each with a private note in the review panel saying what it was;
 * nothing is reworded. The same cleaner keeps the AI's own suggestions free of them (lib/ai/map.ts).
 */
import type { RuleContext, TextEdit } from "./types";

/** Invisible characters and what to call them in the review panel. */
const INVISIBLE: [RegExp, string][] = [
  [/​/u, "zero-width space"],
  [/‌/u, "zero-width non-joiner"],
  [/‍/u, "zero-width joiner"],
  [/⁠/u, "word joiner"],
  [/﻿/u, "byte-order mark"],
  [/­/u, "soft hyphen"],
  [/[‎‏]/u, "text-direction mark"],
  [/[‪-‮⁦-⁩]/u, "text-direction control"],
  [/[⁡-⁤]/u, "invisible maths sign"],
  [/᠎/u, "Mongolian vowel separator"],
  [/[\u{E0000}-\u{E007F}]/u, "hidden tag character"],
];
const ANY_INVISIBLE = /[​-‏⁠-⁤﻿­‪-‮⁦-⁩᠎]|[\u{E0000}-\u{E007F}]/u;
/** Unusual spaces that should be a normal space (the ordinary non-breaking space and the Chinese full-width space are left alone). */
const ODD_SPACE = /[ -   ]/u;

/** Cyrillic and Greek letters that look like Latin ones (only fixed inside a word that is otherwise Latin). */
const LOOKALIKE: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", һ: "h", ӏ: "l",
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", І: "I", Ј: "J", Ѕ: "S",
  ο: "o", ν: "v", ι: "i", Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};
const LATIN = /\p{Script=Latin}/u;

/** A joiner next to an emoji or a script that needs it (emoji sequences, Arabic, Indic…) is real, not leftover. */
function joinerIsReal(text: string, at: number): boolean {
  const near = (text[at - 1] ?? "") + (text[at + 1] ?? "");
  return /[\p{Extended_Pictographic}️\p{M}]|[^\p{Script=Latin}\p{Script=Han}\p{Script=Common}]/u.test(near);
}

const nameOf = (ch: string) => INVISIBLE.find(([re]) => re.test(ch))?.[1] ?? "hidden character";

/** One paragraph's fixes: [start, end, replacement, what it was]. */
function findHidden(text: string): { start: number; end: number; text: string; reason: string }[] {
  const out: { start: number; end: number; text: string; reason: string }[] = [];
  // invisible characters (a run of them is one fix); code points, not code units (tag characters are surrogate pairs)
  const chars = [...text];
  let pos = 0;
  let run: { start: number; end: number; names: string[] } | null = null;
  const flush = () => {
    if (!run) return;
    const kinds = [...new Set(run.names)].join(", ");
    out.push({ start: run.start, end: run.end, text: "", reason: `Removed ${run.names.length === 1 ? "a hidden character" : `${run.names.length} hidden characters`} (${kinds}), probably left by copy-paste. It can’t be seen, but it can break spacing, spell-checking and search.` });
    run = null;
  };
  for (const ch of chars) {
    const len = ch.length;
    const invisible = ANY_INVISIBLE.test(ch) && !((ch === "‍" || ch === "‌") && joinerIsReal(text, pos));
    if (invisible) {
      if (run && run.end === pos) {
        run.end += len;
        run.names.push(nameOf(ch));
      } else {
        flush();
        run = { start: pos, end: pos + len, names: [nameOf(ch)] };
      }
    } else if (ODD_SPACE.test(ch)) {
      flush();
      out.push({ start: pos, end: pos + len, text: " ", reason: "Replaced an unusual space character (from copy-paste) with a normal space." });
    }
    pos += len;
  }
  flush();
  // look-alike letters inside an otherwise Latin word
  for (const m of text.matchAll(/[\p{L}\p{M}]+/gu)) {
    const word = m[0];
    if (!LATIN.test(word)) continue;
    [...word].forEach((ch, i) => {
      const latin = LOOKALIKE[ch];
      if (!latin) return;
      const at = m.index! + [...word].slice(0, i).join("").length;
      out.push({ start: at, end: at + ch.length, text: latin, reason: `Replaced a look-alike letter from another alphabet (“${ch}”, ${/\p{Script=Cyrillic}/u.test(ch) ? "Cyrillic" : "Greek"}) with the normal “${latin}”: it looks the same but breaks spell-checking and search.` });
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The rule (Review rules → Text fixes → Remove hidden characters). */
export function hiddenCharacters(ctx: RuleContext): TextEdit[] {
  return ctx.paras.flatMap((p) => (p.text ? findHidden(p.text).map((f) => ({ para: p.index, start: f.start, end: f.end, text: f.text, rule: "hidden-characters", kind: "fix" as const, reason: f.reason })) : []));
}

/** The same clean-up for text the app writes itself (the AI's suggestions). */
export function stripHidden(text: string): string {
  let out = "";
  let at = 0;
  for (const f of findHidden(text)) {
    out += text.slice(at, f.start) + f.text;
    at = f.end;
  }
  return out + text.slice(at);
}
