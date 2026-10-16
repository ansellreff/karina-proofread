/**
 * Minimal Microsoft Graph client for Karina's OneDrive (delegated access with her sign-in). Server only.
 * Retries throttling (429/503/504, honouring Retry-After) and follows content downloads.
 */

export const GRAPH = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  eTag?: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { id?: string; path?: string };
}

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Files above this go through an upload session (Graph's simple upload is for small files). */
export const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024;
const CHUNK = 10 * 320 * 1024; // upload session chunks must be multiples of 320 KiB

/** OneDrive path segments, each URL-encoded ("App data/jobs" -> "App%20data/jobs"). */
export const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export class Graph {
  constructor(
    private token: string,
    private fetcher: Fetch = fetch,
    private retryDelayMs = 1000,
  ) {}

  /** A Graph request with throttling retries. Returns the raw response (callers check status). */
  async raw(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const full = url.startsWith("https://") ? url : `${GRAPH}${url}`;
    const headers = new Headers(init.headers);
    if (full.startsWith(GRAPH)) headers.set("Authorization", `Bearer ${this.token}`);
    const res = await this.fetcher(full, { ...init, headers });
    if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 4) {
      const wait = Number(res.headers.get("Retry-After")) * 1000 || this.retryDelayMs * 2 ** attempt;
      await sleep(Math.min(wait, 30_000));
      return this.raw(url, init, attempt + 1);
    }
    return res;
  }

  async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.raw(url, init);
    if (!res.ok) throw await graphError(res);
    return (res.status === 204 ? null : await res.json()) as T;
  }

  me() {
    return this.json<{ id: string; displayName?: string; userPrincipalName?: string; mail?: string }>("/me?$select=id,displayName,userPrincipalName,mail");
  }

  item(id: string) {
    return this.json<DriveItem>(`/me/drive/items/${id}`);
  }

  /** An item by path under a folder, or null. */
  async itemAt(rootId: string, path: string): Promise<DriveItem | null> {
    const res = await this.raw(`/me/drive/items/${rootId}:/${encodePath(path)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await graphError(res);
    return res.json();
  }

  /** Everything inside a folder (all pages). */
  async children(folderId: string): Promise<DriveItem[]> {
    const out: DriveItem[] = [];
    let url: string | undefined = `/me/drive/items/${folderId}/children?$top=999&$select=id,name,size,lastModifiedDateTime,eTag,folder,file,parentReference`;
    while (url) {
      const page: { value: DriveItem[]; "@odata.nextLink"?: string } = await this.json(url);
      out.push(...page.value);
      url = page["@odata.nextLink"];
    }
    return out;
  }

  /** Children of a folder given by path under a root, or [] when the folder doesn't exist. */
  async childrenAt(rootId: string, path: string): Promise<DriveItem[]> {
    if (!path) return this.children(rootId);
    const folder = await this.itemAt(rootId, path);
    return folder?.folder ? this.children(folder.id) : [];
  }

  /** File bytes by path (Graph answers with a redirect to a short-lived download URL), or null. */
  async download(rootId: string, path: string, format?: "pdf"): Promise<Uint8Array | null> {
    const res = await this.raw(`/me/drive/items/${rootId}:/${encodePath(path)}:/content${format ? `?format=${format}` : ""}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await graphError(res);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Create or replace a file by path (OneDrive creates missing folders). */
  async upload(rootId: string, path: string, data: Uint8Array): Promise<DriveItem> {
    const at = `/me/drive/items/${rootId}:/${encodePath(path)}`;
    if (data.byteLength <= SIMPLE_UPLOAD_MAX) {
      return this.json<DriveItem>(`${at}:/content`, { method: "PUT", body: data as BodyInit, headers: { "Content-Type": "application/octet-stream" } });
    }
    const session = await this.json<{ uploadUrl: string }>(`${at}:/createUploadSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
    });
    let item: DriveItem | null = null;
    for (let start = 0; start < data.byteLength; start += CHUNK) {
      const end = Math.min(start + CHUNK, data.byteLength);
      // the upload URL is pre-authenticated: no Authorization header (raw() only adds it for graph.microsoft.com)
      const res = await this.raw(session.uploadUrl, {
        method: "PUT",
        body: data.slice(start, end) as BodyInit,
        headers: { "Content-Range": `bytes ${start}-${end - 1}/${data.byteLength}`, "Content-Length": String(end - start) },
      });
      if (!res.ok && res.status !== 202) throw await graphError(res);
      if (res.status === 200 || res.status === 201) item = await res.json();
    }
    if (!item) throw new GraphError(500, "uploadIncomplete", "The upload did not finish.");
    return item;
  }

  /** A folder by path under a root, created (with its parents) when missing. */
  async ensureFolder(rootId: string, path: string): Promise<DriveItem> {
    let parent = await this.item(rootId);
    for (const name of path.split("/").filter(Boolean)) {
      const existing = await this.itemAt(parent.id, name);
      if (existing) {
        parent = existing;
        continue;
      }
      const res = await this.raw(`/me/drive/items/${parent.id}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      });
      if (res.status === 409) {
        // created meanwhile by another request: use that one
        const made = await this.itemAt(parent.id, name);
        if (!made) throw new GraphError(409, "conflict", `Could not create the folder "${name}".`);
        parent = made;
      } else if (res.ok) parent = await res.json();
      else throw await graphError(res);
    }
    return parent;
  }

  async remove(itemId: string): Promise<void> {
    const res = await this.raw(`/me/drive/items/${itemId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw await graphError(res);
  }

  /** Move/rename an item into a folder. */
  async move(itemId: string, parentId: string, name: string): Promise<DriveItem> {
    return this.json<DriveItem>(`/me/drive/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentReference: { id: parentId }, name, "@microsoft.graph.conflictBehavior": "replace" }),
    });
  }

  /** The app's own folder (Apps/Karina Proofread), for its small config file. */
  approot() {
    return this.json<DriveItem>("/me/drive/special/approot");
  }

  root() {
    return this.json<DriveItem>("/me/drive/root");
  }
}

async function graphError(res: Response): Promise<GraphError> {
  let code = "error";
  let message = `OneDrive answered ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    /* not JSON */
  }
  return new GraphError(res.status, code, message);
}
