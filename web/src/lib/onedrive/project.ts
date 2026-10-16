/**
 * Karina's project folder in OneDrive:
 *   Inbox/      students' files to import (M5's email intake will drop them here); imported ones move to Inbox/Imported
 *   Done/       finished files (DONE_…docx / .pdf)
 *   App data/   the app's working files (documents and versions, rules, learning, usage)
 * The chosen folder is remembered in the app's own OneDrive folder (Apps/Karina Proofread/config.json).
 */
import { randomUUID } from "node:crypto";
import { cleanCopy } from "../docx/clean";
import { doneFileName } from "../naming";
import { readJson, type AppFiles } from "../storage/files";
import type { Stores } from "../storage/local";
import { OneDriveFiles } from "../storage/onedrive-files";
import type { Job } from "../store/types";
import type { DriveItem, Graph } from "./graph";

export const FOLDERS = { inbox: "Inbox", imported: "Inbox/Imported", done: "Done", data: "App data" } as const;

export interface AppConfig {
  folderId: string;
  folderName: string;
}

/** Create the subfolders the app uses (existing ones are left as they are). */
export async function setupProject(graph: Graph, folderId: string): Promise<void> {
  for (const f of [FOLDERS.inbox, FOLDERS.imported, FOLDERS.done, FOLDERS.data]) await graph.ensureFolder(folderId, f);
}

export async function readAppConfig(graph: Graph): Promise<AppConfig | null> {
  const app = await graph.approot();
  const files = new OneDriveFiles(graph, app.id);
  return readJson<AppConfig>(files, "config.json");
}

export async function saveAppConfig(graph: Graph, cfg: AppConfig): Promise<void> {
  const app = await graph.approot();
  await graph.upload(app.id, "config.json", new TextEncoder().encode(JSON.stringify(cfg, null, 1)));
}

/** The project folder itself (not just App data). */
function projectFiles(st: Stores): AppFiles {
  if (st.mode !== "onedrive" || !st.graph || !st.session?.folderId) throw new Error("OneDrive is not connected.");
  return new OneDriveFiles(st.graph, st.session.folderId);
}

/** A Word file as PDF, converted by OneDrive (the same rendering as Word for the web). */
export async function toPdf(st: Stores, docx: Uint8Array): Promise<Uint8Array> {
  if (!st.graph || !st.session?.folderId) throw new Error("OneDrive is not connected.");
  const tmp = `${FOLDERS.data}/tmp/${randomUUID()}.docx`;
  const files = projectFiles(st);
  await files.write(tmp, docx);
  try {
    const pdf = await st.graph.download(st.session.folderId, tmp, "pdf");
    if (!pdf || new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-") throw new Error("OneDrive could not convert the file to PDF.");
    return pdf;
  } finally {
    await files.remove(tmp).catch(() => {});
  }
}

export type DoneKind = "tracked" | "clean" | "pdf";

/** The finished file with Karina's name, saved in Done/. Returns its path in the project folder. */
export async function saveToDone(st: Stores, job: Job, kind: DoneKind): Promise<string> {
  const current = await st.jobs.readVersion(job.id, job.current);
  const data = kind === "tracked" ? current : kind === "clean" ? await cleanCopy(current) : await toPdf(st, await cleanCopy(current));
  const name = doneFileName(job, kind === "pdf" ? "pdf" : "docx", kind === "clean" ? "clean" : undefined);
  const path = `${FOLDERS.done}/${name}`;
  await projectFiles(st).write(path, data);
  return path;
}

export interface InboxFile {
  name: string;
  size: number;
  modified: string;
}

/** Word and PDF files waiting in Inbox/. */
export async function listInbox(st: Stores): Promise<InboxFile[]> {
  return (await projectFiles(st).list(FOLDERS.inbox))
    .filter((f) => !f.folder && /\.(docx|pdf)$/i.test(f.name))
    .map((f) => ({ name: f.name, size: f.size, modified: f.modified }))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/** Turn an Inbox file into a document in the app, and move it to Inbox/Imported. */
export async function importFromInbox(st: Stores, name: string): Promise<Job> {
  if (name.includes("/") || !/\.(docx|pdf)$/i.test(name)) throw new Error("Unknown file.");
  const files = projectFiles(st);
  const data = await files.read(`${FOLDERS.inbox}/${name}`);
  if (!data) throw new Error("That file is no longer in the Inbox.");
  const job = await st.jobs.create(name, data, "onedrive");
  const stamp = new Date().toISOString().slice(0, 10);
  const target = (await files.read(`${FOLDERS.imported}/${name}`)) ? `${FOLDERS.imported}/${stamp} ${name}` : `${FOLDERS.imported}/${name}`;
  await files.move(`${FOLDERS.inbox}/${name}`, target);
  return job;
}

/** Folders inside a OneDrive folder (for choosing the project folder). */
export async function subfolders(graph: Graph, parentId: string | null): Promise<{ folder: DriveItem; path: string; folders: DriveItem[] }> {
  const folder = parentId ? await graph.item(parentId) : await graph.root();
  const folders = (await graph.children(folder.id)).filter((i) => !!i.folder).sort((a, b) => a.name.localeCompare(b.name));
  const parentPath = folder.parentReference?.path?.replace(/^\/drive\/root:?/, "") ?? "";
  const path = parentId ? `${decodeURIComponent(parentPath)}/${folder.name}`.replace(/^\/+/, "") : "";
  return { folder, path, folders };
}
