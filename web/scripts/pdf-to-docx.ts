/**
 * Convert PDFs to .docx with the app's converter (to check conversion quality).
 *
 *   npx tsx scripts/pdf-to-docx.ts <file.pdf ...> --out <folder> [--text]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DocxPackage } from "../src/lib/docx/package";
import { bodyParagraphs } from "../src/lib/docx/paragraphs";
import { pdfToDocx } from "../src/lib/pdf/pdf-to-docx";

async function main() {
  const args = process.argv.slice(2);
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : ".";
  const files = args.filter((a, i) => a.toLowerCase().endsWith(".pdf") && args[i - 1] !== "--out");
  await mkdir(out, { recursive: true });
  for (const f of files) {
    try {
      const t0 = Date.now();
      const res = await pdfToDocx(new Uint8Array(await readFile(f)));
      const target = path.join(out, path.basename(f).replace(/\.pdf$/i, ".docx"));
      await writeFile(target, res.docx);
      console.log(`${path.basename(f)}: ${res.pages} pages -> ${res.paragraphs} paragraphs (${Date.now() - t0} ms)`);
      if (args.includes("--text")) {
        const doc = (await (await DocxPackage.load(res.docx)).xml("word/document.xml"))!;
        for (const p of bodyParagraphs(doc).slice(0, 25)) console.log(`   | ${p.text.slice(0, 150)}`);
      }
    } catch (e) {
      console.log(`${path.basename(f)}: ${e instanceof Error ? e.message : e}`);
    }
  }
}
main();
