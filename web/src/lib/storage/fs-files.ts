import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { safePath, type AppFiles, type FileInfo } from "./files";

/** A local folder (web/.data while developing; the tests use temporary folders). */
export class FsFiles implements AppFiles {
  readonly kind = "local" as const;
  constructor(readonly root: string) {}

  private full(p: string) {
    return path.join(this.root, ...safePath(p).split("/"));
  }

  async read(p: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.full(p)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "EISDIR") return null;
      throw e;
    }
  }

  async write(p: string, data: Uint8Array | string): Promise<void> {
    const file = this.full(p);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async list(dir: string): Promise<FileInfo[]> {
    const folder = dir ? this.full(dir) : this.root;
    let names: string[];
    try {
      names = await readdir(folder);
    } catch {
      return [];
    }
    return Promise.all(
      names.map(async (name) => {
        const s = await stat(path.join(folder, name));
        return { name, folder: s.isDirectory(), size: s.isDirectory() ? 0 : s.size, modified: s.mtime.toISOString() };
      }),
    );
  }

  async remove(p: string): Promise<boolean> {
    const file = this.full(p);
    try {
      await stat(file);
    } catch {
      return false;
    }
    await rm(file, { recursive: true, force: true });
    return true;
  }

  async move(from: string, to: string): Promise<boolean> {
    const target = this.full(to);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await rename(this.full(from), target);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }
}
