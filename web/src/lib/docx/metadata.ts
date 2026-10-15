import type { DocxPackage } from "./package";
import type { Identity } from "./revise";
import { SETTINGS_ORDER, W15_NS, parseXml, putOrdered, wDescendants, wEl } from "./xml";

const pad = (n: number) => String(n).padStart(2, "0");
const w3c = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`;

const PEOPLE_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml";
const PEOPLE_REL = "http://schemas.microsoft.com/office/2011/relationships/people";
const CP_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";

/** Leave the file's metadata exactly as Word would after the reviewer saves it. */
export async function finalizeMetadata(pkg: DocxPackage, identity: Identity, now = new Date()): Promise<void> {
  const corePath = await pkg.corePropertiesPath();
  const core = corePath ? await pkg.xml(corePath) : null;
  if (core) {
    const root = core.documentElement!;
    const setText = (ns: string, qname: string, value: string) => {
      const local = qname.split(":")[1];
      let el = Array.from(root.getElementsByTagNameNS(ns, local))[0];
      if (!el) {
        el = core.createElementNS(ns, qname);
        root.appendChild(el);
      }
      el.textContent = value;
      return el;
    };
    setText(CP_NS, "cp:lastModifiedBy", identity.author);
    const rev = Array.from(root.getElementsByTagNameNS(CP_NS, "revision"))[0];
    setText(CP_NS, "cp:revision", String((Number(rev?.textContent) || 1) + 1));
    const modified = Array.from(root.getElementsByTagNameNS("http://purl.org/dc/terms/", "modified"))[0];
    if (modified) modified.textContent = w3c(now);
  }

  const settings = await pkg.xml("word/settings.xml");
  if (settings && !wDescendants(settings, "trackRevisions").length) {
    putOrdered(settings.documentElement!, wEl(settings, "trackRevisions"), SETTINGS_ORDER);
  }

  if (identity.providerId && identity.userId) await ensurePerson(pkg, identity);
}

async function ensurePerson(pkg: DocxPackage, identity: Identity): Promise<void> {
  let people = await pkg.xml("word/people.xml");
  if (!people) {
    people = parseXml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w15:people xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w15="${W15_NS}" mc:Ignorable="w15"></w15:people>`,
    );
    pkg.setXml("word/people.xml", people);

    const types = (await pkg.xml("[Content_Types].xml"))!;
    const typesRoot = types.documentElement!;
    const hasOverride = Array.from(typesRoot.getElementsByTagName("Override")).some((o) => o.getAttribute("PartName") === "/word/people.xml");
    if (!hasOverride) {
      const o = types.createElementNS(typesRoot.namespaceURI, "Override");
      o.setAttribute("PartName", "/word/people.xml");
      o.setAttribute("ContentType", PEOPLE_CT);
      typesRoot.appendChild(o);
    }
    const rels = (await pkg.xml("word/_rels/document.xml.rels"))!;
    const relsRoot = rels.documentElement!;
    const all = Array.from(relsRoot.getElementsByTagName("Relationship"));
    if (!all.some((r) => r.getAttribute("Type") === PEOPLE_REL)) {
      const ids = new Set(all.map((r) => r.getAttribute("Id")));
      let n = all.length + 1;
      while (ids.has(`rId${n}`)) n++;
      const r = rels.createElementNS(relsRoot.namespaceURI, "Relationship");
      r.setAttribute("Id", `rId${n}`);
      r.setAttribute("Type", PEOPLE_REL);
      r.setAttribute("Target", "people.xml");
      relsRoot.appendChild(r);
    }
  }
  const root = people.documentElement!;
  const exists = Array.from(root.getElementsByTagNameNS(W15_NS, "person")).some(
    (p) => p.getAttributeNS(W15_NS, "author") === identity.author,
  );
  if (exists) return;
  const person = people.createElementNS(W15_NS, "w15:person");
  person.setAttributeNS(W15_NS, "w15:author", identity.author);
  const info = people.createElementNS(W15_NS, "w15:presenceInfo");
  info.setAttributeNS(W15_NS, "w15:providerId", identity.providerId!);
  info.setAttributeNS(W15_NS, "w15:userId", identity.userId!);
  person.appendChild(info);
  root.appendChild(person);
}
