import { KARINA } from "../identity";
import { finalizeMetadata } from "./metadata";
import { DocxPackage } from "./package";

/**
 * A document saved from the in-app editor gets the same treatment as a bot output:
 * Word-identical metadata (application, last modified by, track changes on, author entry)
 * and no editor-specific traces.
 */
export async function normalizeSaved(saved: Uint8Array, original: Uint8Array, author = KARINA.author): Promise<Uint8Array> {
  const pkg = await DocxPackage.load(saved);
  const orig = await DocxPackage.load(original);

  // Application name: keep what Word wrote in the student's file (or Word's own value).
  const app = await pkg.xml("docProps/app.xml");
  const origApp = await orig.xml("docProps/app.xml");
  if (app) {
    const el = Array.from(app.getElementsByTagName("Application"))[0];
    const want = origApp ? Array.from(origApp.getElementsByTagName("Application"))[0]?.textContent : null;
    const value = want && /word/i.test(want) ? want : "Microsoft Office Word";
    if (el && el.textContent !== value) el.textContent = value;
    for (const tag of ["AppVersion"]) {
      const v = Array.from(app.getElementsByTagName(tag))[0];
      const ov = origApp ? Array.from(origApp.getElementsByTagName(tag))[0]?.textContent : null;
      if (v && ov) v.textContent = ov;
    }
  }

  // Custom document properties added by an editor (anything mentioning superdoc/harbour).
  const custom = await pkg.xml("docProps/custom.xml");
  if (custom) {
    for (const p of Array.from(custom.getElementsByTagName("property"))) {
      if (/superdoc|harbour/i.test(p.getAttribute("name") ?? "")) p.parentNode!.removeChild(p);
    }
  }

  await finalizeMetadata(pkg, { ...KARINA, author });
  return pkg.save();
}
