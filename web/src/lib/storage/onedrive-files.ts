import { Graph } from "../onedrive/graph";
import { dirOf, safePath, type AppFiles, type FileInfo } from "./files";

/** Files inside one OneDrive folder (Karina's project folder), through Microsoft Graph. */
export class OneDriveFiles implements AppFiles {
  readonly kind = "onedrive" as const;
  constructor(
    readonly graph: Graph,
    readonly rootId: string,
  ) {}

  read(p: string): Promise<Uint8Array | null> {
    return this.graph.download(this.rootId, safePath(p));
  }

  async write(p: string, data: Uint8Array | string): Promise<void> {
    await this.graph.upload(this.rootId, safePath(p), typeof data === "string" ? new TextEncoder().encode(data) : data);
  }

  async list(dir: string): Promise<FileInfo[]> {
    const items = await this.graph.childrenAt(this.rootId, dir ? safePath(dir) : "");
    return items.map((i) => ({ name: i.name, folder: !!i.folder, size: i.size ?? 0, modified: i.lastModifiedDateTime ?? "" }));
  }

  /** Deleted items go to the OneDrive recycle bin. */
  async remove(p: string): Promise<boolean> {
    const item = await this.graph.itemAt(this.rootId, safePath(p));
    if (!item) return false;
    await this.graph.remove(item.id);
    return true;
  }

  async move(from: string, to: string): Promise<boolean> {
    const item = await this.graph.itemAt(this.rootId, safePath(from));
    if (!item) return false;
    const target = safePath(to);
    const parent = dirOf(target) ? await this.graph.ensureFolder(this.rootId, dirOf(target)) : { id: this.rootId };
    await this.graph.move(item.id, parent.id, target.split("/").pop()!);
    return true;
  }
}
