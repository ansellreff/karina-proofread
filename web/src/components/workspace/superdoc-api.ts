/**
 * Thin, defensive wrapper over the SuperDoc v2 Document API (superdoc.activeEditor.doc).
 * In v2 the API runs in a worker, so every call is async. Kept in one place so the rest of the UI
 * does not depend on SuperDoc's internal shapes.
 */

export interface TrackedItem {
  id: string;
  type: string;
  author?: string;
  insertedText?: string | null;
  deletedText?: string | null;
  excerpt?: string;
  wordIds: string[];
}

type AnyFn = (...args: unknown[]) => unknown;
interface DocApi {
  trackChanges?: { list?: AnyFn; decide?: AnyFn };
  comments?: { list?: AnyFn };
  selection?: { current?: AnyFn };
  query?: { match?: AnyFn };
  replace?: AnyFn;
}
interface SuperDocLike {
  activeEditor?: { doc?: DocApi } | null;
  setDocumentMode?: (m: string) => void;
  export?: (o: Record<string, unknown>) => Promise<Blob>;
  scrollToElement?: (id: string) => Promise<boolean>;
}

const sdOf = (sd: unknown) => sd as SuperDocLike | null;
const docOf = (sd: unknown): DocApi | undefined => sdOf(sd)?.activeEditor?.doc;

export async function listTracked(sd: unknown): Promise<TrackedItem[]> {
  try {
    const res = (await docOf(sd)?.trackChanges?.list?.({ limit: 5000 })) as { items?: unknown[] } | undefined;
    const items = (res?.items ?? []) as Record<string, unknown>[];
    return items.map((it) => {
      const src = (it.sourceIds ?? {}) as { wordIdInsert?: string; wordIdDelete?: string; wordIdOther?: string[] };
      const legacy = (it.wordRevisionIds ?? {}) as { insert?: string; delete?: string };
      return {
        id: String(it.id ?? ""),
        type: String(it.type ?? ""),
        author: it.author as string | undefined,
        insertedText: it.insertedText as string | null | undefined,
        deletedText: it.deletedText as string | null | undefined,
        excerpt: it.excerpt as string | undefined,
        wordIds: [src.wordIdInsert, src.wordIdDelete, legacy.insert, legacy.delete, ...(src.wordIdOther ?? [])].filter(Boolean).map(String),
      };
    });
  } catch {
    return [];
  }
}

export async function decide(sd: unknown, decision: "accept" | "reject", ids: string[] | "all"): Promise<boolean> {
  const api = docOf(sd)?.trackChanges;
  if (!api?.decide) return false;
  try {
    if (ids === "all") await api.decide({ decision, target: { kind: "all" } });
    else if (ids.length === 1) await api.decide({ decision, target: { kind: "id", id: ids[0] } });
    else if (ids.length > 1) await api.decide({ decision, target: { kind: "ids", ids } });
    return true;
  } catch (e) {
    // fall back to one by one (ids can shift after a grouped decision)
    if (ids !== "all" && ids.length > 1) {
      let ok = false;
      for (const id of ids) {
        try {
          await api.decide({ decision, target: { kind: "id", id } });
          ok = true;
        } catch {
          /* already resolved */
        }
      }
      return ok;
    }
    console.warn("decide failed", e);
    return false;
  }
}

export async function countComments(sd: unknown): Promise<number> {
  try {
    const res = (await docOf(sd)?.comments?.list?.({})) as { items?: unknown[]; total?: number } | undefined;
    return res?.total ?? res?.items?.length ?? 0;
  } catch {
    return 0;
  }
}

/** The text Karina has selected in the editor ("" when nothing is selected). */
export async function selectedText(sd: unknown): Promise<string> {
  try {
    const info = (await docOf(sd)?.selection?.current?.({ includeText: true })) as { text?: string } | undefined;
    return (info?.text ?? "").trim();
  } catch {
    return "";
  }
}

/** Replace the first occurrence of `find` with `replace` as a tracked change (author = the editor user). */
export async function trackedReplace(sd: unknown, find: string, replace: string): Promise<boolean> {
  const doc = docOf(sd);
  if (!doc?.query?.match || !doc.replace) return false;
  try {
    const m = (await doc.query.match({ select: { type: "text", pattern: find, mode: "contains", caseSensitive: true } })) as {
      items?: { handle?: { ref?: string } }[];
    };
    const ref = m.items?.[0]?.handle?.ref;
    if (!ref) return false;
    await doc.replace({ ref, text: replace }, { changeMode: "tracked" });
    return true;
  } catch {
    return false;
  }
}

export function setMode(sd: unknown, mode: string) {
  try {
    sdOf(sd)?.setDocumentMode?.(mode);
  } catch {
    /* ignore */
  }
}

export async function exportDocx(sd: unknown): Promise<Blob> {
  const s = sdOf(sd);
  if (!s?.export) throw new Error("The editor is not ready yet.");
  return s.export({ exportType: ["docx"], triggerDownload: false, commentsType: "external", isFinalDoc: false });
}

export async function scrollTo(sd: unknown, id: string) {
  try {
    await sdOf(sd)?.scrollToElement?.(id);
  } catch {
    /* ignore */
  }
}
