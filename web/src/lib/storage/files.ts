/**
 * Where the app keeps its files. One interface, two backends: a local folder (web/.data, development and tests)
 * and a Postgres table (online, Neon). Paths are relative and use "/" ("jobs/<id>/v3.docx").
 */

export interface FileInfo {
  name: string;
  folder: boolean;
  size: number;
  modified: string;
}

export interface AppFiles {
  readonly kind: "local" | "cloud";
  /** The file's bytes, or null when it doesn't exist. */
  read(path: string): Promise<Uint8Array | null>;
  /** Create or replace a file (missing folders are created). */
  write(path: string, data: Uint8Array | string): Promise<void>;
  /** Files and folders directly inside a folder ([] when it doesn't exist). */
  list(dir: string): Promise<FileInfo[]>;
  /** Delete a file or a whole folder. False when it didn't exist. */
  remove(path: string): Promise<boolean>;
  /** Move or rename a file or folder (the target's folder is created). False when the source didn't exist. */
  move(from: string, to: string): Promise<boolean>;
}

/** Reject anything that could leave the app's folder. */
export function safePath(p: string): string {
  const clean = p.replace(/^\/+|\/+$/g, "");
  if (!clean || clean.split("/").some((s) => !s || s === "." || s === "..") || /[\\:*?"<>|]/.test(clean)) throw new Error(`Invalid path: ${p}`);
  return clean;
}

export const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");

export async function readText(files: AppFiles, path: string): Promise<string | null> {
  const data = await files.read(path);
  return data ? new TextDecoder().decode(data) : null;
}

export async function readJson<T>(files: AppFiles, path: string): Promise<T | null> {
  const text = await readText(files, path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export const writeJson = (files: AppFiles, path: string, value: unknown) => files.write(path, JSON.stringify(value, null, 1));

/** The same files seen from a subfolder ("settings" -> paths become "settings/<path>"). */
export function scoped(files: AppFiles, prefix: string): AppFiles {
  const at = (p: string) => (p ? `${prefix}/${p}` : prefix);
  return {
    kind: files.kind,
    read: (p) => files.read(at(p)),
    write: (p, d) => files.write(at(p), d),
    list: (d) => files.list(at(d)),
    remove: (p) => files.remove(at(p)),
    move: (a, b) => files.move(at(a), at(b)),
  };
}

/** Files kept in memory (unit tests). */
export class MemoryFiles implements AppFiles {
  readonly kind = "local" as const;
  readonly data = new Map<string, Uint8Array>();

  async read(p: string) {
    return this.data.get(safePath(p)) ?? null;
  }
  async write(p: string, d: Uint8Array | string) {
    this.data.set(safePath(p), typeof d === "string" ? new TextEncoder().encode(d) : d);
  }
  async list(dir: string) {
    const prefix = dir ? `${safePath(dir)}/` : "";
    const seen = new Map<string, FileInfo>();
    for (const [k, v] of this.data) {
      if (!k.startsWith(prefix)) continue;
      const [name, ...rest] = k.slice(prefix.length).split("/");
      seen.set(name, { name, folder: rest.length > 0, size: rest.length ? 0 : v.length, modified: "" });
    }
    return [...seen.values()];
  }
  async remove(p: string) {
    const path = safePath(p);
    let found = false;
    for (const k of [...this.data.keys()]) if (k === path || k.startsWith(`${path}/`)) found = this.data.delete(k) || found;
    return found;
  }
  async move(a: string, b: string) {
    const from = safePath(a);
    const to = safePath(b);
    let found = false;
    for (const [k, v] of [...this.data]) {
      if (k !== from && !k.startsWith(`${from}/`)) continue;
      this.data.delete(k);
      this.data.set(to + k.slice(from.length), v);
      found = true;
    }
    return found;
  }
}
