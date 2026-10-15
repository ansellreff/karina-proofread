import JSZip from "jszip";
import { parseXml, serializeXml, type Document } from "./xml";

/** A .docx file: zip parts with lazily parsed, cached XML. */
export class DocxPackage {
  private parsed = new Map<string, Document>();

  private constructor(private zip: JSZip) {}

  static async load(data: Uint8Array | ArrayBuffer): Promise<DocxPackage> {
    return new DocxPackage(await JSZip.loadAsync(data));
  }

  has(path: string): boolean {
    return this.zip.file(path) !== null;
  }

  async xml(path: string): Promise<Document | null> {
    const cached = this.parsed.get(path);
    if (cached) return cached;
    const file = this.zip.file(path);
    if (!file) return null;
    const doc = parseXml(await file.async("string"));
    this.parsed.set(path, doc);
    return doc;
  }

  /** Register a new or replaced XML part. */
  setXml(path: string, doc: Document): void {
    this.parsed.set(path, doc);
  }

  /** Path of the core-properties part (usually docProps/core.xml; some generators use package/services/...). */
  async corePropertiesPath(): Promise<string | null> {
    const rels = await this.xml("_rels/.rels");
    if (rels) {
      for (const r of Array.from(rels.getElementsByTagName("Relationship"))) {
        if ((r.getAttribute("Type") ?? "").endsWith("/metadata/core-properties")) {
          const target = (r.getAttribute("Target") ?? "").replace(/^\//, "");
          if (this.has(target)) return target;
        }
      }
    }
    return this.has("docProps/core.xml") ? "docProps/core.xml" : null;
  }

  async save(): Promise<Uint8Array> {
    // Word never writes folder entries into the zip; createFolders:false keeps the layout identical.
    for (const [path, doc] of this.parsed) this.zip.file(path, serializeXml(doc), { createFolders: false });
    // Drop folder entries only (zip.remove() on a folder would delete its contents too).
    for (const name of Object.keys(this.zip.files)) if (this.zip.files[name].dir) delete this.zip.files[name];
    return this.zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }
}
