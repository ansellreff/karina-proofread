import { DocxPackage } from "./package";
import { MC_NS, W16DU_NS, XMLNS_NS, getW, setW, type Document, type Element } from "./xml";

/**
 * Tracked-change and comment dates. Word writes w:date as the reviewer's LOCAL time followed by "Z" (and, since
 * 2023, the true UTC time in w16du:dateUtc). The in-app editor (SuperDoc) reads that "Z" as UTC, so it showed every
 * change 8 hours late, and it stamps its own edits in true UTC with milliseconds (8 hours early in Word).
 *  - forEditor: the copy the editor opens has w:date without "Z", which it shows as the written time, like Word.
 *  - toWord: on save and download, a date without "Z" gets it back, and an editor-made date (true UTC with
 *    milliseconds) becomes local time + "Z", with its UTC copy in w16du:dateUtc. Word's own dates pass unchanged.
 */

const pad = (n: number) => String(n).padStart(2, "0");
/** Word's date form: to the minute, seconds always 00. */
export function w3c(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`;
}

/** Declare the w16du namespace (Word 2023+ UTC revision dates) on a part's root if possible. */
export function ensureW16du(doc: Document): boolean {
  const root = doc.documentElement!;
  if (root.getAttribute("xmlns:w16du")) return true;
  const ignorable = root.getAttributeNS(MC_NS, "Ignorable");
  if (!root.getAttribute("xmlns:mc")) return false;
  root.setAttributeNS(XMLNS_NS, "xmlns:w16du", W16DU_NS);
  root.setAttributeNS(MC_NS, "mc:Ignorable", ignorable ? `${ignorable} w16du` : "w16du");
  return true;
}

/** Parts that carry tracked changes or comments. */
const PARTS = /^word\/(document|comments|footnotes|endnotes|header\d*|footer\d*)\.xml$/;
/** A date the editor stamped itself: true UTC, with milliseconds (Word never writes those). */
const EDITOR_MADE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/;
const NO_ZONE = /^\d{4}-\d\d-\d\dT[\d:.]+$/;

/** Change every w:date in the dated parts with `fix` (null = leave it). Returns whether anything changed. */
async function eachDate(pkg: DocxPackage, fix: (value: string, el: Element, doc: Document) => string | null): Promise<boolean> {
  let changed = false;
  for (const path of pkg.paths().filter((p) => PARTS.test(p))) {
    const doc = await pkg.xml(path);
    if (!doc) continue;
    for (const el of Array.from(doc.getElementsByTagName("*"))) {
      const value = getW(el, "date");
      if (!value) continue;
      const next = fix(value, el, doc);
      if (next !== null && next !== value) {
        setW(el, "date", next);
        changed = true;
      }
    }
  }
  return changed;
}

/** The copy of a document the in-app editor opens (never saved as it is). */
export async function forEditor(data: Uint8Array, utcOffsetMinutes: number): Promise<Uint8Array> {
  const pkg = await DocxPackage.load(data);
  const changed = await eachDate(pkg, (v) => {
    if (EDITOR_MADE.test(v)) return w3c(new Date(Date.parse(v) + utcOffsetMinutes * 60_000)).slice(0, -1); // older in-app edits
    return v.endsWith("Z") ? v.slice(0, -1) : null;
  });
  return changed ? pkg.save() : data;
}

/** Dates back in Word's form (in place, on a loaded package). */
export async function datesToWord(pkg: DocxPackage, utcOffsetMinutes: number): Promise<boolean> {
  return eachDate(pkg, (v, el, doc) => {
    if (EDITOR_MADE.test(v)) {
      const t = new Date(Date.parse(v));
      if (!el.getAttributeNS(W16DU_NS, "dateUtc") && ensureW16du(doc)) el.setAttributeNS(W16DU_NS, "w16du:dateUtc", w3c(t));
      return w3c(new Date(t.getTime() + utcOffsetMinutes * 60_000));
    }
    return NO_ZONE.test(v) ? `${v}Z` : null;
  });
}

/** The same for a whole file (downloads, so versions saved before this fix open at the right time in Word too). */
export async function toWord(data: Uint8Array, utcOffsetMinutes: number): Promise<Uint8Array> {
  const pkg = await DocxPackage.load(data);
  return (await datesToWord(pkg, utcOffsetMinutes)) ? pkg.save() : data;
}
