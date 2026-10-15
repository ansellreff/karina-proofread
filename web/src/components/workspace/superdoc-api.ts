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
  history?: { get?: AnyFn; undo?: AnyFn };
}
type ScrollResult = { success?: boolean } | undefined;
interface UiLike {
  trackChanges?: {
    setActive?: (id: string | null) => boolean;
    scrollTo?: (id: string) => Promise<ScrollResult>;
    subscribe?: (fn: (e: { snapshot: { activeId?: string | null } }) => void) => () => void;
    getAt?: (p: { x: number; y: number }) => { id?: string } | null;
  };
  selection?: { apply?: (target: unknown) => unknown };
  viewport?: { scrollIntoView?: (input: Record<string, unknown>) => Promise<ScrollResult> };
}
interface SuperDocLike {
  activeEditor?: { doc?: DocApi } | null;
  ui?: UiLike;
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

/** Number of undo steps in the editor's history (null when unavailable). Each decide() call is one step. */
export async function undoDepth(sd: unknown): Promise<number | null> {
  try {
    const h = (await docOf(sd)?.history?.get?.()) as { undoDepth?: number } | undefined;
    return typeof h?.undoDepth === "number" ? h.undoDepth : null;
  } catch {
    return null;
  }
}

/** Undo the last `steps` editor history steps. */
export async function undoSteps(sd: unknown, steps: number): Promise<boolean> {
  const history = docOf(sd)?.history;
  if (!history?.undo) return false;
  try {
    for (let i = 0; i < steps; i++) {
      const r = (await history.undo()) as { noop?: boolean } | undefined;
      if (r?.noop) return i > 0;
    }
    return true;
  } catch {
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

/** Scroll the document to a tracked change and mark it active (SuperDoc highlights it). */
export async function focusTracked(sd: unknown, id: string): Promise<boolean> {
  const tc = sdOf(sd)?.ui?.trackChanges;
  try {
    tc?.setActive?.(id);
    if ((await tc?.scrollTo?.(id))?.success) return true;
  } catch {
    /* fall through */
  }
  try {
    return !!(await sdOf(sd)?.scrollToElement?.(id));
  } catch {
    return false;
  }
}

/** Scroll to and select the first occurrence of `text` (for changes already accepted or rejected). */
export async function focusText(sd: unknown, text: string): Promise<boolean> {
  const s = sdOf(sd);
  const match = s?.activeEditor?.doc?.query?.match;
  if (!match || !s?.ui) return false;
  try {
    const res = (await match({ select: { type: "text", pattern: text, mode: "contains", caseSensitive: true } })) as {
      items?: { target?: unknown; blocks?: { blockId: string; range: unknown }[] }[];
    };
    const hit = res.items?.[0];
    const block = hit?.blocks?.[0];
    if (!hit || !block) return false;
    s.ui.selection?.apply?.(hit.target);
    const r = await s.ui.viewport?.scrollIntoView?.({ target: { kind: "text", blockId: block.blockId, range: block.range }, block: "center" });
    return !!r?.success;
  } catch {
    return false;
  }
}

/** Mark the tracked change painted under a click point as active (clicking text alone does not). */
export function activateTrackedAt(sd: unknown, x: number, y: number): string | null {
  const tc = sdOf(sd)?.ui?.trackChanges;
  try {
    const id = tc?.getAt?.({ x, y })?.id;
    if (!id) return null;
    tc?.setActive?.(id);
    return id;
  } catch {
    return null;
  }
}

export function clearActiveTracked(sd: unknown) {
  try {
    sdOf(sd)?.ui?.trackChanges?.setActive?.(null);
  } catch {
    /* ignore */
  }
}

/** Follow the active tracked change (set by clicking a change in the document or by focusTracked). */
export function onActiveTracked(sd: unknown, cb: (id: string | null) => void): () => void {
  try {
    return sdOf(sd)?.ui?.trackChanges?.subscribe?.(({ snapshot }) => cb(snapshot.activeId ?? null)) ?? (() => {});
  } catch {
    return () => {};
  }
}
