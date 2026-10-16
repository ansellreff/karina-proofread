/**
 * Score .docx files: the student's original (all tracked changes rejected) and the reviewed version (all accepted,
 * Karina's inline notes in parentheses taken out). Used to calibrate the score.
 *
 *   npx tsx scripts/score-docs.ts <file.docx | folder> [--detail]
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { DocxPackage } from "../src/lib/docx/package";
import { wDescendants } from "../src/lib/docx/xml";
import { localStores } from "../src/lib/storage/local";
import { buildContext } from "../src/lib/rules/detect";
import { scoreDocx } from "../src/lib/score/score";

/**
 * What the app knows from a proofread, reconstructed from Karina's tracked changes: w:ids of every change,
 * her notes (inserted "( … )" text and whole inserted paragraphs of 8+ words, i.e. the end Note), and her text fixes.
 */
async function revisions(data: Uint8Array) {
  const doc = (await (await DocxPackage.load(data)).xml("word/document.xml"))!;
  const ids = new Set<string>();
  const notes: string[] = [];
  let fixes = 0;
  for (const name of ["ins", "del", "rPrChange", "pPrChange", "moveTo", "moveFrom"]) {
    for (const el of wDescendants(doc, name)) {
      const id = el.getAttribute("w:id");
      if (id) ids.add(id);
      if (el.parentNode && (el.parentNode as { localName?: string }).localName === "rPr") continue; // paragraph mark
      const t = (el.textContent ?? "").trim();
      if (name === "ins" && (/^\(.*\)$/s.test(t) || /^note:?$/i.test(t))) notes.push(t);
      else if (name === "del" || (name === "ins" && t)) fixes += name === "del" ? 1 : (el.previousSibling as { localName?: string } | null)?.localName === "del" ? 0 : 1;
    }
  }
  for (const p of wDescendants(doc, "p")) {
    const text = (p.textContent ?? "").trim();
    const inserted = wDescendants(p, "ins").map((i) => i.textContent ?? "").join("").trim();
    if (text && inserted === text && text.split(/\s+/).length >= 8) notes.push(text);
  }
  return { ids, notes, fixes };
}

async function main() {
  const args = process.argv.slice(2);
  const files: string[] = [];
  for (const a of args.filter((x) => !x.startsWith("--"))) {
    const p = path.resolve(a);
    if ((await stat(p)).isDirectory()) {
      for (const f of await readdir(p)) if (f.endsWith(".docx") && !f.startsWith("~$")) files.push(path.join(p, f));
    } else files.push(p);
  }
  const rules = await localStores().config.loadRules();
  const rows: string[] = [];
  let sumO = 0, sumF = 0;
  for (const f of files) {
    const data = new Uint8Array(await readFile(f));
    const { ids, notes, fixes } = await revisions(data);
    const name = path.basename(f);
    const docType = buildContext(name, []).docType;
    // as in the app right after proofreading: every fix is still an open problem
    const original = await scoreDocx(data, { fileName: name, docType, rules, pendingIds: ids, openFixes: Math.max(0, fixes - notes.length) });
    const final = await scoreDocx(data, { fileName: name, docType, rules, notes });
    sumO += original.total;
    sumF += final.total;
    const parts = (s: typeof original) => s.categories.map((c) => `${c.id.slice(0, 4)} ${c.score}/${c.max}`).join("  ");
    rows.push(`${String(original.total).padStart(3)} -> ${String(final.total).padStart(3)}  ${docType.padEnd(20)} | ${parts(original)} || ${parts(final)}`);
    if (args.includes("--detail")) for (const c of original.categories) for (const i of c.items.slice(0, 4)) rows.push(`        ${c.id}: ${i.message.slice(0, 120)}`);
  }
  console.log(rows.join("\n"));
  console.log(`\naverage: original ${Math.round(sumO / files.length)}, reviewed ${Math.round(sumF / files.length)} (${files.length} documents)`);
}
main();
