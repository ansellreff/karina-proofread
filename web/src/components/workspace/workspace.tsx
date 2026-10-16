"use client";

import { ArrowLeft, ChevronDown, ChevronUp, Columns2, Download, Eye, FileCheck2, FileText, Keyboard, ListChecks, Loader2, MessageSquareText, PanelRightClose, PanelRightOpen, Pencil, Save, ScanText, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { RenameDialog } from "@/components/documents-list";
import { setPaper, usePaper, type Paper } from "@/components/theme-provider";
import { Tip } from "@/components/tip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/store/types";
import { canLocate, ChangesPanel, type PanelChange } from "./changes-panel";
import { OriginalPane } from "./original-pane";
import { ScorePanel, scoreTone, type Scores } from "./score-panel";
import { DropZones, PaneHeader, PanelResizer, SplitDivider, usePaneDrag, usePreference, type PaneView } from "./split-view";
import { useLinkedScroll } from "./use-linked-scroll";
import type { Mode } from "./doc-editor";
import { ProofreadDialog } from "./proofread-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { useShortcuts } from "./use-shortcuts";
import {
  activateTrackedAt,
  clearActiveTracked,
  countComments,
  decide,
  exportDocx,
  focusText,
  focusTracked,
  listTracked,
  onActiveTracked,
  refitZoom,
  selectedText,
  setMode as sdSetMode,
  trackedReplace,
  undoDepth,
  undoSteps,
  type TrackedItem,
} from "./superdoc-api";
import { usePhone } from "./use-phone";
import { VersionsPanel } from "./versions-panel";

const DocEditor = dynamic(() => import("./doc-editor"), {
  ssr: false,
  loading: () => <EditorPlaceholder text="Opening the document…" />,
});

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-sans text-[11px] text-foreground">{children}</kbd>;
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return <p className="shrink-0 truncate border-b bg-card px-3 py-1.5 text-xs text-muted-foreground">{children}</p>;
}

function EditorPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> {text}
    </div>
  );
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "suggesting", label: "Suggesting", hint: "Your edits are tracked as Karina's changes" },
  { id: "editing", label: "Editing", hint: "Edit directly, no tracking" },
  { id: "viewing", label: "Viewing", hint: "Read only" },
];

const AUTOSAVE_MS = 90_000;

/** The current time, refreshed every `ms` (for "saved 2 min ago"). */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function ago(iso: string, now: number) {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `at ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** One accept/reject made from the panel: how many editor history steps it took and which cards it resolved. */
interface Decision {
  decision: "accept" | "reject";
  label: string;
  keys: string[];
  steps: number;
  /** Editor undo depth right after it; if the depth differs later, Karina edited the document since. */
  depthAfter: number;
}
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
/** First non-empty line, short enough for a text search. */
const searchable = (s: string) => (s.split("\n").map((l) => l.trim()).find(Boolean) ?? "").slice(0, 80);

export function Workspace({ initialJob, aiDefault, hasApiKey, authorName }: { initialJob: Job; aiDefault: boolean; hasApiKey: boolean; authorName: string }) {
  const [job, setJob] = useState(initialJob);
  /** The version file fetched into the editor (changing it reloads the editor). */
  const [loaded, setLoadedState] = useState(initialJob.current);
  /** The version the editor content corresponds to (moves forward on save without a reload). */
  const [shown, setShown] = useState(initialJob.current);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>(initialJob.versions.length > 1 ? "suggesting" : "viewing");
  const [tracked, setTracked] = useState<TrackedItem[]>([]);
  const [comments, setComments] = useState(0);
  /** Last save in this session (null: show the time of the version on screen). */
  const [lastSave, setLastSave] = useState<{ at: string; auto: boolean } | null>(null);
  const now = useNow(30_000);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tipsSeen, setTipsSeen] = usePreference("tips-seen", false);
  const paper = usePaper();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proofreadOpen, setProofreadOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<string>("changes");
  const [editorError, setEditorError] = useState<string | null>(null);
  const setLoaded = useCallback((n: number) => {
    setFile(null);
    setEditorError(null);
    setLoadedState(n);
    setShown(n);
    setLastSave(null);
  }, []);
  const sd = useRef<unknown>(null);
  /** Tracked change highlighted in the editor (clicked in the document or jumped to from the panel). */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Panel item last jumped to; used when it has no live tracked change (already accepted or rejected). */
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const unfollow = useRef<() => void>(() => {});
  /** Accept/reject decisions made from the panel, newest last, so a misclick can be undone. */
  const [decisions, setDecisionsState] = useState<Decision[]>([]);
  const decisionsRef = useRef<Decision[]>([]); // read by toast callbacks, which outlive renders
  const setDecisions = (d: Decision[]) => {
    decisionsRef.current = d;
    setDecisionsState(d);
  };
  const resetDecisions = () => setDecisions([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasBotVersion = job.versions.some((v) => v.kind === "bot");
  const phone = usePhone();

  // ---- comparing with the original: full view, side by side, scroll lock
  /** "original" shows the student's file as received, on top of the (still loaded) review editor. */
  const [view, setView] = useState<"review" | "original">("review");
  const [split, setSplit] = useState(false);
  const [scrollLock, setScrollLock] = useState(true);
  const [paneTick, setPaneTick] = useState(0);
  const sideBySide = split && !phone; // a phone is too narrow for two pages
  const showOriginal = view === "original" || sideBySide;
  const originalPane = useRef<HTMLDivElement>(null);
  const reviewPane = useRef<HTMLDivElement>(null);
  const splitBox = useRef<HTMLDivElement>(null);
  useLinkedScroll(sideBySide && scrollLock, reviewPane, originalPane, paneTick);
  const originalSd = useRef<unknown>(null);
  /** Which side the original is on, the left side's share of the width, and whether the review panel is open (remembered). */
  const [originalSide, setOriginalSide] = usePreference<"left" | "right">("original-side", "left");
  const [savedRatio, saveRatio] = usePreference("split-ratio", 0.5);
  const [liveRatio, setLiveRatio] = useState<number | null>(null); // while dragging the divider
  const ratio = liveRatio ?? savedRatio;
  const [panelOpen, setPanelOpen] = usePreference("panel-open", true);
  const [savedPanelWidth, savePanelWidth] = usePreference("panel-width", 380);
  const [livePanelWidth, setLivePanelWidth] = useState<number | null>(null); // while dragging its edge
  const panelWidth = livePanelWidth ?? savedPanelWidth;
  const swapSides = () => setOriginalSide(originalSide === "left" ? "right" : "left");
  // drag a side by its title bar: dropping the original on a half puts it there; the review goes opposite
  const { drag: paneDrag, handlers: paneDragHandlers } = usePaneDrag({
    container: splitBox,
    pane: (which) => (which === "original" ? originalPane.current : reviewPane.current),
    onDrop: (which, side) => setOriginalSide(which === "original" ? side : side === "left" ? "right" : "left"),
  });
  // Pages keep their zoom when a column narrows or widens (side by side, resizing, panel); fit them to the column again.
  useEffect(() => {
    if (phone) return;
    const fit = () => {
      refitZoom(sd.current);
      if (sideBySide) refitZoom(originalSd.current);
    };
    const t = setTimeout(fit, 120);
    return () => clearTimeout(t);
  }, [sideBySide, phone, paneTick, savedRatio, panelOpen, savedPanelWidth]);

  // ---- load the requested version into the editor
  useEffect(() => {
    let cancelled = false;
    sd.current = null;
    fetch(`/api/jobs/${job.id}/file?v=${loaded}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("The document file could not be loaded.");
        return r.blob();
      })
      .then((b) => !cancelled && setFile(new File([b], job.fileName, { type: b.type })))
      .catch((e) => !cancelled && setEditorError(e.message));
    return () => {
      cancelled = true;
    };
  }, [job.id, job.fileName, loaded]);

  const refresh = useCallback(() => {
    const s = sd.current;
    void Promise.all([listTracked(s), countComments(s)]).then(([t, c]) => {
      if (sd.current !== s) return; // a different version was loaded meanwhile
      setTracked(t);
      setComments(c);
    });
  }, []);

  const save = useCallback(
    async (opts: { autosave?: boolean; label?: string } = {}) => {
      if (!sd.current) return job;
      setSaving(true);
      try {
        const blob = await exportDocx(sd.current);
        const form = new FormData();
        form.append("file", new File([blob], job.fileName));
        if (opts.autosave) form.append("autosave", "1");
        if (opts.label) form.append("label", opts.label);
        const res = await fetch(`/api/jobs/${job.id}/versions`, { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.json()).error ?? "Saving failed.");
        const updated = (await res.json()) as Job;
        setJob(updated);
        setShown(updated.current); // the editor already shows this content; no reload
        setDirty(false);
        setLastSave({ at: new Date().toISOString(), auto: !!opts.autosave });
        if (!opts.autosave) toast.success("Saved as a new version");
        return updated;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Saving failed.");
        return job;
      } finally {
        setSaving(false);
      }
    },
    [job],
  );

  const onUpdate = useCallback(() => {
    setDirty(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 400);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void save({ autosave: true }), AUTOSAVE_MS);
  }, [refresh, save]);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    unfollow.current();
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---- link the bot's change list to the live tracked changes in the editor
  const panelChanges: PanelChange[] = useMemo(() => {
    const pr = job.proofread;
    if (!pr || shown < pr.version) return [];
    const items: PanelChange[] = pr.changes.map((c, i) => {
      const ids = new Set(c.revisionIds ?? []);
      let live = tracked.filter((t) => t.wordIds.some((w) => ids.has(w)));
      if (!live.length && c.kind !== "paragraph" && (c.before || c.after)) {
        live = tracked.filter((t) => norm(t.deletedText) === norm(c.before) && norm(t.insertedText) === norm(c.after));
      }
      return { ...c, key: `${i}`, live };
    });
    if (pr.formatting.deviated) {
      // the bot's font/size/alignment/spacing changes, grouped into one review item
      const fmt = tracked.filter((t) => t.type === "formatting" && t.author === authorName);
      items.unshift({
        rule: "format", kind: "format", paragraph: -1, start: 0, end: 0, before: "",
        after: `Times New Roman 12 pt, justified, 1.5 line spacing (${pr.formatting.runs + pr.formatting.paragraphs} formatting changes)`,
        key: "format", live: fmt,
      });
    }
    return items;
  }, [job.proofread, shown, tracked, authorName]);
  const linked = new Set(panelChanges.flatMap((c) => c.live.map((t) => t.id)));
  const otherOpen = tracked.filter((t) => !linked.has(t.id)).length;
  const activeKey = activeId ? (panelChanges.find((c) => c.live.some((t) => t.id === activeId))?.key ?? null) : pickedKey;

  /** Scroll the document to a change from the panel and highlight it there. */
  const focusChange = async (c: PanelChange) => {
    setPickedKey(c.key);
    if (phone) setSheetOpen(false); // the sheet would cover the document
    let found = false;
    if (c.live[0]) found = await focusTracked(sd.current, c.live[0].id);
    else {
      clearActiveTracked(sd.current);
      setActiveId(null);
    }
    if (!c.live[0] && c.kind !== "format") {
      // resolved: look for the text that stayed (accepted -> new text, rejected -> old text)
      for (const text of [c.after, c.before].map(searchable).filter((t) => t.length >= 3)) {
        if ((found = await focusText(sd.current, text))) break;
      }
    }
    if (!found) toast(c.live.length ? "Could not scroll to this change." : "This change is already resolved and its text is no longer in the document.");
  };

  // ---- live score: re-scored a moment after every change (accept, reject, typing), from the editor's content
  const [scores, setScores] = useState<Scores | null>(null);
  const [scoring, setScoring] = useState(false);
  const scoreRun = useRef(0);
  const canScore = !!job.proofread && shown >= job.proofread.version;
  // what is still open, from the panel (exact even after undo, when the editor gives restored changes new ids)
  const pending = useMemo(
    () => ({
      ids: panelChanges.flatMap((c) => c.live.flatMap((t) => t.wordIds)),
      fixes: panelChanges.filter((c) => (c.kind === "fix" || c.kind === "delete") && c.live.length > 0).length,
    }),
    [panelChanges],
  );
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!canScore || !sd.current) return;
    const run = ++scoreRun.current;
    const t = setTimeout(async () => {
      if (!sd.current) return;
      setScoring(true);
      try {
        const blob = await exportDocx(sd.current);
        const form = new FormData();
        form.append("file", new File([blob], job.fileName));
        form.append("pending", JSON.stringify(pendingRef.current.ids));
        form.append("openFixes", String(pendingRef.current.fixes));
        const res = await fetch(`/api/jobs/${job.id}/score`, { method: "POST", body: form });
        if (res.ok && run === scoreRun.current) setScores((await res.json()) as Scores);
      } catch {
        /* the score is a helper; never interrupt the review over it */
      } finally {
        if (run === scoreRun.current) setScoring(false);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [tracked, canScore, job.id, job.fileName]);

  async function showScoreItem(text: string) {
    if (phone) setSheetOpen(false);
    clearActiveTracked(sd.current);
    setActiveId(null);
    // an open tracked change inside the passage splits the text, so also try the words before and after it
    const words = text.split(/\s+/);
    const half = Math.ceil(words.length / 2);
    const tries = [text, words.slice(0, half).join(" "), words.slice(half - 1).join(" ")].filter((t, i, a) => t.length >= 6 && a.indexOf(t) === i);
    for (const t of tries) if (await focusText(sd.current, t)) return;
    toast("That passage has changed since, so it can’t be found any more.");
  }

  /** Phone arrows (all changes) and J/K (only the ones still open): step without opening the panel. */
  const stepAll = (dir: 1 | -1, openOnly = false) => {
    const stops = panelChanges.filter((c) => canLocate(c) && (!openOnly || c.live.length > 0));
    if (!stops.length) return;
    const at = stops.findIndex((c) => c.key === activeKey);
    const next = at < 0 ? (dir === 1 ? 0 : stops.length - 1) : (at + dir + stops.length) % stops.length;
    void focusChange(stops[next]);
  };

  const apply = async (decision: "accept" | "reject", items: PanelChange[], label: string) => {
    const ids = items.flatMap((c) => c.live.map((t) => t.id));
    if (!ids.length) return;
    const before = await undoDepth(sd.current);
    if (!(await decide(sd.current, decision, ids))) toast.error("That change could not be updated in the editor.");
    const after = await undoDepth(sd.current);
    setDirty(true);
    refresh();
    if (before !== null && after !== null && after > before) {
      const next = [...decisionsRef.current, { decision, label, keys: items.map((c) => c.key), steps: after - before, depthAfter: after }].slice(-50);
      setDecisions(next);
      const index = next.length - 1;
      toast(label, { action: { label: "Undo", onClick: () => void undoDecision(index) } });
    }
  };

  /**
   * Undo panel decision `index` (default: the latest) and any made after it, through the editor's history.
   * Refuses when Karina has edited the document since: history undo would take her typing back first.
   */
  async function undoDecision(index?: number) {
    const list = decisionsRef.current;
    const i = index ?? list.length - 1;
    if (i < 0 || i >= list.length) return;
    if ((await undoDepth(sd.current)) !== list[list.length - 1].depthAfter) {
      resetDecisions();
      return toast("The document was edited after that. Use Ctrl+Z or the undo arrow in the toolbar to step back.");
    }
    const undone = list.slice(i);
    setDecisions(list.slice(0, i));
    const ok = await undoSteps(sd.current, undone.reduce((n, d) => n + d.steps, 0));
    setDirty(true);
    refresh();
    const later = undone.length - 1;
    if (ok) toast.success(`Undone: ${undone[0].label.toLowerCase()}${later ? `, plus ${later} later decision${later === 1 ? "" : "s"}` : ""}`);
    else toast.error("That could not be undone. Try Ctrl+Z in the document.");
  }

  /** For each resolved card decided in this session: its decision and how many later decisions an undo would also take back. */
  const undoable = new Map<string, { decision: Decision["decision"]; index: number; later: number }>();
  decisions.forEach((d, index) => d.keys.forEach((k) => undoable.set(k, { decision: d.decision, index, later: decisions.length - 1 - index })));

  const [rechecking, setRechecking] = useState(false);
  async function recheckSelection() {
    const text = await selectedText(sd.current);
    if (!text) return toast("Select a sentence or paragraph in the document first, then re-check it.");
    setRechecking(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/recheck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const body = (await res.json()) as { edits?: { find: string; replace: string }[]; costUsd?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Re-check failed.");
      let applied = 0;
      for (const e of body.edits ?? []) if (await trackedReplace(sd.current, e.find, e.replace)) applied++;
      const skipped = (body.edits?.length ?? 0) - applied;
      toast.success(
        applied === 0 && !skipped
          ? "Re-checked: nothing to change in this passage."
          : `Re-checked: ${applied} new change${applied === 1 ? "" : "s"}${skipped ? `, ${skipped} could not be placed` : ""} (US$${(body.costUsd ?? 0).toFixed(3)})`,
      );
      setDirty(true);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-check failed.");
    } finally {
      setRechecking(false);
    }
  }

  const changeMode = (m: Mode) => {
    setView("review");
    setMode(m);
    sdSetMode(sd.current, m);
  };
  const showOriginalFull = () => {
    setSplit(false);
    setView("original");
  };

  async function exportAs(kind: "tracked" | "clean" | "pdf" | "pdf-markup") {
    const latest = dirty ? await save({ label: "Your edits" }) : job;
    if (kind === "pdf" || kind === "pdf-markup") {
      window.open(`/jobs/${job.id}/print?v=${latest.current}&markup=${kind === "pdf-markup" ? 1 : 0}`, "_blank", "noopener");
      return;
    }
    const a = document.createElement("a");
    a.href = `/api/jobs/${job.id}/file?v=${latest.current}&download=${kind}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function restore(n: number) {
    const res = await fetch(`/api/jobs/${job.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: n }),
    });
    if (!res.ok) return toast.error("Restore failed.");
    const updated = (await res.json()) as Job;
    setJob(updated);
    setDirty(false);
    setLoaded(updated.current);
    toast.success(n === 0 ? "The original document is back" : "Version restored");
  }

  async function markDone() {
    const latest = dirty ? await save({ label: "Your edits" }) : job;
    const res = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
    if (res.ok) {
      setJob({ ...(await res.json()), current: latest.current });
      toast.success("Marked as done");
    }
  }

  const panel = (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex h-11 shrink-0 items-center border-b pr-1.5">
      <TabsList variant="line" className="h-11 min-w-0 flex-1 justify-start gap-1 overflow-x-auto rounded-none px-2.5">
        <TabsTrigger value="changes" className="flex-none">
          What changed {panelChanges.length > 0 && <span className="tabular-nums text-muted-foreground">{panelChanges.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="score" className="flex-none">
          Score {scores && <span className={cn("tabular-nums", scoreTone(scores.current.total))}>{scores.current.total}</span>}
        </TabsTrigger>
        <TabsTrigger value="comments" className="flex-none">
          Comments {comments > 0 && <span className="tabular-nums text-muted-foreground">{comments}</span>}
        </TabsTrigger>
        <TabsTrigger value="versions" className="flex-none">
          Versions
        </TabsTrigger>
      </TabsList>
        <Button size="icon-sm" variant="ghost" className="hidden shrink-0 lg:inline-flex" onClick={() => setPanelOpen(false)} title="Hide the review panel" aria-label="Hide the review panel">
          <PanelRightClose />
        </Button>
      </div>
      <TabsContent value="changes" className="min-h-0 flex-1">
        {panelChanges.length > 0 ? (
          <ChangesPanel
            changes={panelChanges}
            otherOpen={otherOpen}
            onAccept={(c) => apply("accept", [c], "Change accepted")}
            onReject={(c) => apply("reject", [c], c.before ? "Change rejected, original text restored" : "Change rejected")}
            onAcceptAll={() => apply("accept", panelChanges, "All changes accepted")}
            onRejectAll={() => apply("reject", panelChanges, "All changes rejected")}
            onRestoreRemoved={(items) => apply("reject", items, "Removed text restored")}
            undoLabel={decisions.at(-1)?.label ?? null}
            onUndo={() => void undoDecision()}
            undoable={undoable}
            onUndoAt={(index) => void undoDecision(index)}
            onFocus={focusChange}
            activeKey={activeKey}
          />
        ) : (
          <div className="space-y-3 px-4 py-6 text-sm text-muted-foreground">
            {hasBotVersion ? (
              <p>This version has no bot changes to list. Open the latest bot version from Versions to see them.</p>
            ) : (
              <>
                <p>This is the student&apos;s original, untouched.</p>
                <Button onClick={() => setProofreadOpen(true)}>
                  <Sparkles /> Proofread this document
                </Button>
              </>
            )}
          </div>
        )}
      </TabsContent>
      <TabsContent value="score" className="min-h-0 flex-1">
        {canScore ? (
          <ScorePanel scores={scores} busy={scoring} onShow={(i) => i.find && void showScoreItem(i.find)} />
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {job.proofread ? "Open the latest bot version from Versions to see its score." : "Proofread the document to see its score out of 100."}
          </p>
        )}
      </TabsContent>
      <TabsContent value="comments" className="min-h-0 flex-1 space-y-2 px-4 py-4 text-sm text-muted-foreground">
        <p>Select text in the document, then use the comment button in the toolbar (or right-click) to add a Word comment.</p>
        <p>Comments are saved in the file as comments by {authorName}, so students see them in Word. Reply and resolve from the comment bubble.</p>
        <p className="tabular-nums">{comments === 0 ? "No comments yet." : `${comments} comment${comments === 1 ? "" : "s"} in this version.`}</p>
      </TabsContent>
      <TabsContent value="versions" className="min-h-0 flex-1">
        <VersionsPanel
          versions={job.versions}
          current={job.current}
          shown={shown}
          onOpen={async (n) => {
            if (dirty) await save({ autosave: true });
            setLoaded(n);
          }}
          onRestore={restore}
        />
      </TabsContent>
    </Tabs>
  );

  const shownVersion = job.versions.find((v) => v.n === shown);
  const activeChange = panelChanges.find((c) => c.key === activeKey);

  // ---- keyboard shortcuts (letters only when the cursor is not in the document text)
  useShortcuts((action) => {
    switch (action) {
      case "next":
        return stepAll(1, true);
      case "prev":
        return stepAll(-1, true);
      case "accept":
      case "reject": {
        if (!activeChange?.live.length) {
          toast("Highlight an open change first: press J, or click one in What changed.");
          return;
        }
        const label = action === "accept" ? "Change accepted" : activeChange.before ? "Change rejected, original text restored" : "Change rejected";
        void apply(action, [activeChange], label).then(() => stepAll(1, true));
        return;
      }
      case "undo":
        return void undoDecision();
      case "save":
        if (dirty && !saving) void save({ label: "Your edits" });
        return;
      case "togglePanel":
        return setPanelOpen(!panelOpen);
      case "toggleOriginal":
        return view === "original" ? setView("review") : showOriginalFull();
      case "toggleSplit":
        if (!phone) {
          setView("review");
          setSplit(!split);
        }
        return;
      case "toggleLock":
        if (sideBySide) setScrollLock(!scrollLock);
        return;
      case "help":
        return setShortcutsOpen(true);
      case "escape":
        if (view === "original") setView("review");
        return;
    }
  });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* top bar */}
      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-3 py-2 sm:px-4">
        <Link href="/" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Back to documents">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-[1.05rem] leading-tight font-semibold">
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              title="Rename the student (used in the exported file names)"
              className="group/name inline-flex max-w-full items-center gap-1.5 rounded-sm text-left hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="truncate">{job.studentName ?? "Unnamed student"}</span>
              <Pencil className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-70 group-focus-visible/name:opacity-70" />
            </button>
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {job.docType === "Unknown" ? "Document" : job.docType}, {job.versions.find((v) => v.n === shown)?.label.toLowerCase()}
          </p>
        </div>
        {job.sourceFile && (
          <a
            href={`/api/jobs/${job.id}/file?source=1`}
            target="_blank"
            rel="noopener"
            title={`The PDF exactly as the student sent it. ${job.sourceFile.notes.join(" ")}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <FileText className="size-3.5" /> <span className="hidden sm:inline">Student’s PDF</span>
          </a>
        )}
        <StatusChip status={job.status} className="hidden md:inline-flex" />
        {scores && canScore && (
          <button
            type="button"
            onClick={() => {
              setTab("score");
              if (phone || window.innerWidth < 1024) setSheetOpen(true);
            }}
            title="Score out of 100: original → now"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-xs tabular-nums hover:bg-secondary"
          >
            <span className="text-muted-foreground">Score</span>
            <span className="text-muted-foreground">{scores.original.total} →</span>
            <span className={cn("font-serif text-base leading-none font-semibold", scoreTone(scores.current.total))}>{scores.current.total}</span>
          </button>
        )}

        <div className={cn("order-last flex w-full items-center rounded-md border bg-background p-0.5 sm:order-none sm:w-auto", sideBySide && "hidden")} role="radiogroup" aria-label="Editing mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={view === "review" && mode === m.id}
              title={m.hint}
              onClick={() => changeMode(m.id)}
              className={cn("h-7 flex-1 rounded px-2 text-xs transition-colors sm:flex-none sm:px-2.5", view === "review" && mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {m.label}
            </button>
          ))}
          <button
            role="radio"
            aria-checked={view === "original"}
            title="The student’s file exactly as uploaded: no suggestions, no edits (O)"
            onClick={showOriginalFull}
            className={cn("h-7 flex-1 rounded px-2 text-xs transition-colors sm:flex-none sm:px-2.5", view === "original" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Original
          </button>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <Tip label={sideBySide ? "Back to one page" : "Show the original next to your review"} keys="S">
            <Button
              size="sm"
              variant={sideBySide ? "secondary" : "outline"}
              aria-pressed={sideBySide}
              onClick={() => {
                setView("review");
                setSplit(!split);
              }}
            >
              <Columns2 /> <span className="hidden xl:inline">Side by side</span>
            </Button>
          </Tip>
          <DropdownMenu>
            <Tip label="View options">
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" aria-label="View options" />}>
                <Eye />
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>View</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={view === "original"} onCheckedChange={(c) => (c ? showOriginalFull() : setView("review"))}>
                  Original, full screen <DropdownMenuShortcut>O</DropdownMenuShortcut>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={sideBySide} onCheckedChange={(c) => { setView("review"); setSplit(c); }}>
                  Side by side <DropdownMenuShortcut>S</DropdownMenuShortcut>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={sideBySide && scrollLock} disabled={!sideBySide} onCheckedChange={(c) => setScrollLock(c)}>
                  Lock scroll (side by side) <DropdownMenuShortcut>L</DropdownMenuShortcut>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={panelOpen} onCheckedChange={(c) => setPanelOpen(c)} className="hidden lg:flex">
                  Review panel <DropdownMenuShortcut>\</DropdownMenuShortcut>
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Paper in dark mode</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={paper} onValueChange={(v) => setPaper(v as Paper)}>
                  <DropdownMenuRadioItem value="white">White (as printed)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Dark (easier at night)</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
                <Keyboard /> Keyboard shortcuts <DropdownMenuShortcut>?</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs whitespace-nowrap text-muted-foreground lg:inline" aria-live="polite">
            {saving ? "Saving…" : dirty ? (
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--mark)]" /> Unsaved changes</span>
            ) : lastSave ? `${lastSave.auto ? "Autosaved" : "Saved"} ${ago(lastSave.at, now)}` : shownVersion ? `Saved ${ago(shownVersion.createdAt, now)}` : null}
          </span>
          <Tip label={dirty ? "Save your edits as a new version" : "No unsaved edits"} keys="Ctrl S">
            <Button size="sm" variant="outline" onClick={() => save({ label: "Your edits" })} disabled={!dirty || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              <span className="hidden sm:inline">{saving ? "Saving" : dirty ? "Save" : "Saved"}</span>
            </Button>
          </Tip>
        </div>
        {hasApiKey && hasBotVersion && mode !== "viewing" && (
          <Tip label="Select text in the document, then ask the AI to look at just that passage again">
            <Button size="sm" variant="outline" onClick={recheckSelection} disabled={rechecking}>
              {rechecking ? <Loader2 className="animate-spin" /> : <ScanText />}
              <span className="hidden xl:inline">{rechecking ? "Re-checking" : "Re-check selection"}</span>
            </Button>
          </Tip>
        )}
        <Button size="sm" variant={hasBotVersion ? "outline" : "default"} onClick={() => setProofreadOpen(true)}>
          <Sparkles /> <span className="hidden sm:inline">{hasBotVersion ? "Proofread again" : "Proofread"}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" />}>
            <Download /> <span className="hidden sm:inline">Export</span> <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => exportAs("tracked")}>Word file with tracked changes</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAs("clean")}>Clean Word file (changes accepted)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportAs("pdf")}>PDF, clean</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAs("pdf-markup")}>PDF with markup</DropdownMenuItem>
            {job.sourceFile && (
              <DropdownMenuItem onClick={() => window.open(`/api/jobs/${job.id}/file?source=1`, "_blank", "noopener")}>The student’s PDF, as sent</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={markDone} disabled={job.status === "done"}>
              <FileCheck2 /> Mark as done
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={splitBox} className="relative flex min-w-0 flex-1 overflow-hidden bg-card md:bg-muted/50" data-split={sideBySide || undefined}>
          {/* The panes keep their place in the tree; CSS order puts them left or right, so the review editor never
              reloads (no lost edits) when the sides are swapped, resized or split. */}
          {showOriginal && (
            <div
              ref={originalPane}
              data-pane="original"
              data-side={sideBySide ? originalSide : undefined}
              className={cn("flex min-h-0 min-w-0 flex-col bg-card transition-opacity md:bg-muted/50", sideBySide ? "shrink-0" : "absolute inset-0 z-10", paneDrag?.which === "original" && "opacity-35")}
              style={sideBySide ? { order: originalSide === "left" ? 0 : 2, width: `${(originalSide === "left" ? ratio : 1 - ratio) * 100}%` } : undefined}
            >
              {sideBySide ? (
                <PaneHeader
                  which="original"
                  value="original"
                  onPick={(v) => {
                    if (v === "original") return;
                    swapSides(); // the review comes to this side, the original goes to the other
                    changeMode(v);
                  }}
                  onSwap={swapSides}
                  drag={paneDragHandlers("original")}
                />
              ) : (
                <PaneLabel>Original, as received (read only). Choose Suggesting, Editing or Viewing to go back to your review.</PaneLabel>
              )}
              <div className="relative min-h-0 flex-1">
                <OriginalPane jobId={job.id} fileName={job.fileName} userName={authorName} reflow={phone} onReady={(s) => {
                  originalSd.current = s;
                  setPaneTick((t) => t + 1);
                }} />
              </div>
            </div>
          )}
          {sideBySide && <SplitDivider container={splitBox} ratio={ratio} onRatio={setLiveRatio} onCommit={(r) => {
            setLiveRatio(null);
            saveRatio(r);
          }} order={1} locked={scrollLock} onToggleLock={() => setScrollLock(!scrollLock)} />}
          <div
            ref={reviewPane}
            data-pane="review"
            data-side={sideBySide ? (originalSide === "left" ? "right" : "left") : undefined}
            aria-hidden={view === "original" || undefined}
            className={cn("relative flex min-w-0 flex-1 flex-col transition-opacity", view === "original" && "invisible", paneDrag?.which === "review" && "opacity-35")}
            style={sideBySide ? { order: originalSide === "left" ? 2 : 0 } : undefined}
            onClickCapture={(e) => activateTrackedAt(sd.current, e.clientX, e.clientY)}>
          {sideBySide && (
            <PaneHeader
              which="review"
              value={mode as PaneView}
              onPick={(v) => (v === "original" ? swapSides() : changeMode(v))}
              onSwap={swapSides}
              drag={paneDragHandlers("review")}
            />
          )}
          <div className="relative min-h-0 flex-1">
          {/* the phone (web) layout does not mark the active change itself; a rule survives its re-renders */}
          {activeId && <style>{`.superdoc-web-flow-run[data-track-change-id="${activeId.replace(/["\\]/g, "\\$&")}"]{outline:2px solid var(--primary);outline-offset:1px;border-radius:2px}`}</style>}
          {editorError ? (
            <EditorPlaceholder text={editorError} />
          ) : file ? (
            <DocEditor
              key={`${loaded}-${file.size}-${phone ? "web" : "print"}`}
              reflow={phone}
              file={file}
              mode={mode}
              userName={authorName}
              onReady={(s) => {
                sd.current = s;
                if (process.env.NODE_ENV !== "production") (window as unknown as { __superdoc?: unknown }).__superdoc = s; // e2e checks
                unfollow.current();
                unfollow.current = onActiveTracked(s, setActiveId);
                resetDecisions();
                sdSetMode(s, mode);
                refresh();
                setDirty(false);
                setPaneTick((t) => t + 1);
              }}
              onUpdate={onUpdate}
              onError={(m) => toast.error(m)}
            />
          ) : (
            <EditorPlaceholder text="Opening the document…" />
          )}
          </div>
          </div>
          {sideBySide && paneDrag && <DropZones drag={paneDrag} />}
          {!tipsSeen && !phone && file && (
            <div role="note" className="no-print absolute bottom-4 left-4 z-20 hidden w-80 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg md:block">
              <p className="mb-1.5 font-medium">Quick tips</p>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Click a change on the right to jump to it; <Kbd>J</Kbd> / <Kbd>K</Kbd> step through them.</li>
                <li><Kbd>A</Kbd> accepts, <Kbd>R</Kbd> rejects, <Kbd>U</Kbd> undoes, when the cursor isn’t in the text.</li>
                <li>Side by side: drag a page by its title bar to swap the sides.</li>
              </ul>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" onClick={() => setShortcutsOpen(true)} className="text-xs text-primary hover:underline">
                  All shortcuts (?)
                </button>
                <Button size="sm" variant="secondary" onClick={() => setTipsSeen(true)}>
                  Got it
                </Button>
              </div>
            </div>
          )}
        </div>
        {panelOpen ? (
          <aside className="relative hidden shrink-0 flex-col border-l bg-card lg:flex" style={{ width: panelWidth, maxWidth: "55vw", minWidth: 300 }}>
            <PanelResizer width={panelWidth} onWidth={setLivePanelWidth} onCommit={(w) => {
              setLivePanelWidth(null);
              savePanelWidth(w);
            }} />
            {panel}
          </aside>
        ) : (
          <aside className="hidden w-11 shrink-0 flex-col items-center gap-2 border-l bg-card py-2 lg:flex" aria-label="Review panel (collapsed)">
            <Button size="icon-sm" variant="ghost" onClick={() => setPanelOpen(true)} title="Show the review panel" aria-label="Show the review panel">
              <PanelRightOpen />
            </Button>
            {panelChanges.length > 0 && (
              <button type="button" onClick={() => { setTab("changes"); setPanelOpen(true); }} title="What changed" className="flex flex-col items-center rounded px-1 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                <MessageSquareText className="size-4" />
                <span className="tabular-nums">{panelChanges.filter((c) => c.live.length > 0).length}</span>
              </button>
            )}
            {scores && canScore && (
              <button type="button" onClick={() => { setTab("score"); setPanelOpen(true); }} title="Score" className={cn("rounded px-1 py-1.5 font-serif text-sm font-semibold tabular-nums hover:bg-secondary", scoreTone(scores.current.total))}>
                {scores.current.total}
              </button>
            )}
          </aside>
        )}
      </div>

      {/* phone / tablet: panel as a bottom sheet */}
      <div className="no-print fixed inset-x-0 bottom-4 z-30 flex justify-center gap-1.5 lg:hidden">
        {panelChanges.length > 0 && (
          <Button size="icon" variant="outline" className="bg-card shadow-lg" onClick={() => stepAll(-1)} aria-label="Previous change">
            <ChevronUp />
          </Button>
        )}
        <Button className="shadow-lg" onClick={() => setSheetOpen(true)}>
          {tab === "versions" ? <ListChecks /> : <MessageSquareText />} {panelChanges.length ? `${panelChanges.length} changes` : "Review panel"}
        </Button>
        {panelChanges.length > 0 && (
          <Button size="icon" variant="outline" className="bg-card shadow-lg" onClick={() => stepAll(1)} aria-label="Next change">
            <ChevronDown />
          </Button>
        )}
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="gap-0 p-0 data-[side=bottom]:h-[75dvh]">
          <SheetTitle className="sr-only">Review panel</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>

      <RenameDialog job={renameOpen ? job : null} onClose={() => setRenameOpen(false)} onSaved={(name) => setJob((j) => ({ ...j, studentName: name }))} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <ProofreadDialog
        job={job}
        open={proofreadOpen}
        onOpenChange={setProofreadOpen}
        aiDefault={aiDefault}
        hasApiKey={hasApiKey}
        onDone={(updated) => {
          setJob(updated);
          setDirty(false);
          setMode("suggesting");
          setLoaded(updated.current);
          setTab("changes");
          toast.success(`Proofread: ${updated.proofread?.changes.length ?? 0} changes${updated.proofread?.costUsd ? `, cost US$${updated.proofread.costUsd.toFixed(2)}` : ""}`);
        }}
      />
    </div>
  );
}
