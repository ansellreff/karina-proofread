import type { DocxPackage } from "./package";
import { getW, wDescendants, type Document } from "./xml";

/**
 * Facts about the student's file that the AI can't see in the body text: which program made it, whether it was
 * ever edited in Word, and the header/footer text. Used as evidence by the "AI-generated document" rule.
 */
export interface FileFacts {
  /** The writing program when it is one AI chat tools use to produce Word files ("python-docx"). */
  madeBy?: string;
  /** No body paragraph carries Word's editing marks (w:rsid): the text was never typed or saved in Word. */
  neverEditedInWord: boolean;
  header: string;
  footer: string;
}

const lines = (doc: Document | null) =>
  doc ? wDescendants(doc, "p").map((p) => wDescendants(p, "t").map((t) => t.textContent ?? "").join("").trim()).filter(Boolean) : [];

async function partText(pkg: DocxPackage, kind: "header" | "footer"): Promise<string> {
  const parts = pkg.paths().filter((p) => new RegExp(`^word/${kind}\\d*\\.xml$`).test(p)).sort();
  const all = (await Promise.all(parts.map(async (p) => lines(await pkg.xml(p))))).flat();
  return [...new Set(all)].join(" / ");
}

export async function fileFacts(pkg: DocxPackage, doc: Document): Promise<FileFacts> {
  const corePath = await pkg.corePropertiesPath();
  const core = corePath ? await pkg.xml(corePath) : null;
  const creator = core?.getElementsByTagName("dc:creator")[0]?.textContent ?? "";
  const description = core?.getElementsByTagName("dc:description")[0]?.textContent ?? "";
  const madeBy = /python-docx/i.test(`${creator} ${description}`) ? "python-docx" : undefined;
  const paras = wDescendants(doc, "p").filter((p) => wDescendants(p, "t").some((t) => t.textContent?.trim()));
  const neverEditedInWord = paras.length > 5 && !paras.some((p) => getW(p, "rsidR") !== null || getW(p, "rsidRDefault") !== null);
  return { madeBy, neverEditedInWord, header: await partText(pkg, "header"), footer: await partText(pkg, "footer") };
}
