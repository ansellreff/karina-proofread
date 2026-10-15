import { acceptAllRevisions } from "./accept";
import { DocxPackage } from "./package";
import { remove, wDescendants } from "./xml";

const COMMENT_PARTS = /^word\/comments(Extended|Ids|Extensible)?\.xml$/;

/** A clean copy: every tracked change accepted and every comment removed (the student's final text). */
export async function cleanCopy(input: Uint8Array): Promise<Uint8Array> {
  const pkg = await DocxPackage.load(input);
  for (const part of ["word/document.xml", ...headerFooterParts(pkg)]) {
    const doc = await pkg.xml(part);
    if (!doc) continue;
    acceptAllRevisions(doc);
    for (const name of ["commentRangeStart", "commentRangeEnd"]) for (const el of wDescendants(doc, name)) remove(el);
    for (const ref of wDescendants(doc, "commentReference")) {
      const run = ref.parentNode;
      if (run && run.localName === "r") remove(run);
      else remove(ref);
    }
  }
  const settings = await pkg.xml("word/settings.xml");
  if (settings) for (const el of wDescendants(settings, "trackRevisions")) remove(el);
  await dropParts(pkg, (p) => COMMENT_PARTS.test(p));
  return pkg.save();
}

function headerFooterParts(pkg: DocxPackage): string[] {
  return pkg.paths().filter((p) => /^word\/(header|footer)\d*\.xml$/.test(p));
}

async function dropParts(pkg: DocxPackage, match: (path: string) => boolean): Promise<void> {
  const parts = pkg.paths().filter(match);
  if (!parts.length) return;
  const rels = await pkg.xml("word/_rels/document.xml.rels");
  if (rels) {
    for (const r of Array.from(rels.getElementsByTagName("Relationship"))) {
      if (parts.includes(`word/${r.getAttribute("Target")}`)) r.parentNode!.removeChild(r);
    }
  }
  const types = await pkg.xml("[Content_Types].xml");
  if (types) {
    for (const o of Array.from(types.getElementsByTagName("Override"))) {
      if (parts.includes((o.getAttribute("PartName") ?? "").replace(/^\//, ""))) o.parentNode!.removeChild(o);
    }
  }
  for (const p of parts) pkg.removePart(p);
}
