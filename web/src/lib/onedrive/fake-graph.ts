/**
 * An in-memory stand-in for the part of Microsoft Graph's OneDrive API the app uses (tests only): items by id and
 * by path, content up/download (also through upload sessions), children, folders, delete, move, PDF conversion.
 */
interface Item {
  id: string;
  name: string;
  parentId: string | null;
  folder: boolean;
  data?: Uint8Array;
  modified: string;
}

export class FakeGraph {
  items = new Map<string, Item>();
  calls: string[] = [];
  /** Answer the next N requests with 429 (throttling). */
  throttle = 0;
  private n = 0;
  private sessions = new Map<string, { parentId: string; name: string; parts: Uint8Array[] }>();

  constructor() {
    this.items.set("root", { id: "root", name: "root", parentId: null, folder: true, modified: new Date().toISOString() });
    this.items.set("approot", { id: "approot", name: "Karina Proofread", parentId: "root", folder: true, modified: new Date().toISOString() });
  }

  private add(parentId: string, name: string, folder: boolean, data?: Uint8Array): Item {
    const existing = this.childNamed(parentId, name);
    if (existing && !folder) {
      existing.data = data;
      existing.modified = new Date().toISOString();
      return existing;
    }
    const item = { id: `i${++this.n}`, name, parentId, folder, data, modified: new Date().toISOString() };
    this.items.set(item.id, item);
    return item;
  }

  private childNamed(parentId: string, name: string) {
    return [...this.items.values()].find((i) => i.parentId === parentId && i.name.toLowerCase() === name.toLowerCase());
  }

  private resolve(rootId: string, path: string): Item | null {
    let cur = this.items.get(rootId) ?? null;
    for (const seg of path.split("/").filter(Boolean)) cur = cur ? (this.childNamed(cur.id, decodeURIComponent(seg)) ?? null) : null;
    return cur;
  }

  /** Create the parent folders of a path, returning the parent. */
  private parentFor(rootId: string, path: string): { parent: Item; name: string } {
    const segs = path.split("/").filter(Boolean).map(decodeURIComponent);
    let cur = this.items.get(rootId)!;
    for (const s of segs.slice(0, -1)) cur = this.childNamed(cur.id, s) ?? this.add(cur.id, s, true);
    return { parent: cur, name: segs[segs.length - 1] };
  }

  private json(item: Item) {
    return {
      id: item.id,
      name: item.name,
      size: item.data?.byteLength ?? 0,
      lastModifiedDateTime: item.modified,
      eTag: `"${item.id}-${item.modified}"`,
      ...(item.folder ? { folder: { childCount: [...this.items.values()].filter((i) => i.parentId === item.id).length } } : { file: { mimeType: "application/octet-stream" } }),
      parentReference: { id: item.parentId ?? undefined },
    };
  }

  /** Use as the `fetch` of a Graph client. */
  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    this.calls.push(`${method} ${url.pathname}${url.search}`);
    if (this.throttle > 0) {
      this.throttle--;
      return new Response(JSON.stringify({ error: { code: "tooManyRequests" } }), { status: 429, headers: { "Retry-After": "0" } });
    }
    const body = init.body ? new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer()) : undefined;
    const ok = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
    const notFound = () => ok({ error: { code: "itemNotFound", message: "Item not found" } }, 404);

    if (url.host === "upload.example") {
      const s = this.sessions.get(url.pathname.slice(1))!;
      s.parts.push(body!);
      const [, , end, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(init.headers instanceof Headers ? init.headers.get("Content-Range")! : "")!;
      if (Number(end) + 1 < Number(total)) return ok({ nextExpectedRanges: [`${Number(end) + 1}-`] }, 202);
      const data = new Uint8Array(Number(total));
      let at = 0;
      for (const p of s.parts) {
        data.set(p, at);
        at += p.byteLength;
      }
      return ok(this.json(this.add(s.parentId, s.name, false, data)), 201);
    }

    const path = url.pathname.replace("/v1.0", "");
    if (path === "/me/drive/root") return ok(this.json(this.items.get("root")!));
    if (path === "/me/drive/special/approot") return ok(this.json(this.items.get("approot")!));
    let m = /^\/me\/drive\/items\/([^/:]+):\/(.+?)(?::\/(content|createUploadSession))?$/.exec(path);
    if (m) {
      const [, rootId, p, action] = m;
      if (action === "content" && method === "PUT") {
        const { parent, name } = this.parentFor(rootId, p);
        return ok(this.json(this.add(parent.id, name, false, body)), 201);
      }
      if (action === "createUploadSession") {
        const { parent, name } = this.parentFor(rootId, p);
        const key = `s${++this.n}`;
        this.sessions.set(key, { parentId: parent.id, name, parts: [] });
        return ok({ uploadUrl: `https://upload.example/${key}` });
      }
      const item = this.resolve(rootId, p);
      if (!item) return notFound();
      if (action === "content") {
        const data = url.searchParams.get("format") === "pdf" ? new TextEncoder().encode(`%PDF-1.7 converted ${item.name}`) : item.data!;
        return new Response(data as BodyInit, { status: 200 });
      }
      return ok(this.json(item));
    }
    m = /^\/me\/drive\/items\/([^/]+)\/children$/.exec(path);
    if (m) {
      const parent = this.items.get(m[1]);
      if (!parent) return notFound();
      if (method === "POST") {
        const { name } = JSON.parse(new TextDecoder().decode(body));
        if (this.childNamed(parent.id, name)) return ok({ error: { code: "nameAlreadyExists" } }, 409);
        return ok(this.json(this.add(parent.id, name, true)), 201);
      }
      return ok({ value: [...this.items.values()].filter((i) => i.parentId === parent.id).map((i) => this.json(i)) });
    }
    m = /^\/me\/drive\/items\/([^/]+)$/.exec(path);
    if (m) {
      const item = this.items.get(m[1]);
      if (!item) return notFound();
      if (method === "DELETE") {
        const drop = (id: string) => {
          for (const c of [...this.items.values()].filter((i) => i.parentId === id)) drop(c.id);
          this.items.delete(id);
        };
        drop(item.id);
        return new Response(null, { status: 204 });
      }
      if (method === "PATCH") {
        const { parentReference, name } = JSON.parse(new TextDecoder().decode(body));
        const clash = this.childNamed(parentReference.id, name);
        if (clash && clash.id !== item.id) this.items.delete(clash.id);
        Object.assign(item, { parentId: parentReference.id, name });
        return ok(this.json(item));
      }
      return ok(this.json(item));
    }
    return ok({ error: { code: "notImplemented", message: `${method} ${path}` } }, 501);
  };

  /** Make a folder at the top of the drive (her project folder). */
  folder(name: string): string {
    return this.add("root", name, true).id;
  }
}
