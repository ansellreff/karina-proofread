/** Small text utilities shared by the rules. */

const ABBREV = /\b(?:Prof|Dr|Mr|Mrs|Ms|St|Vol|No|Fig|etc|e\.g|i\.e|vs|Jr|Sr|Inc|Ltd|Co|S\.Kom|M\.MSI|Ph\.D|M\.A|B\.A|M\.Sc|B\.Sc)\.$/i;

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? []).length;
}

export function countSentences(text: string): number {
  let n = 0;
  const re = /[.!?]+(?=\s+[“"(]?[A-Z0-9]|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 8), m.index + 1);
    if (ABBREV.test(before) || /\d\.$/.test(before) && /^\.\d/.test(text.slice(m.index, m.index + 2))) continue;
    n++;
  }
  return Math.max(n, text.trim() ? 1 : 0);
}

/** True when the match at `index` begins a sentence (start of paragraph or after . ! ? :). */
export function atSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd();
  return before === "" || /[.!?:]["”’)]?$/.test(before);
}

const PROPER = new Set([
  "islamic", "english", "indonesian", "chinese", "mandarin", "japanese", "korean", "arabic", "asian", "european",
  "american", "taiwan", "taiwanese", "indonesia", "malay", "javanese", "sundanese", "french", "german", "spanish",
]);

/** Lower-case a field-of-study phrase the way Karina does (keeps proper adjectives and acronyms). */
export function lowerField(phrase: string): string {
  return phrase.replace(/[\p{L}][\p{L}'’\-]*/gu, (w) => {
    if (/^[A-Z0-9&]{2,}$/.test(w)) return w; // acronym
    if (PROPER.has(w.toLowerCase())) return w;
    return w.toLowerCase();
  });
}
