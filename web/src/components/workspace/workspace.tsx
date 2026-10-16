"use client";

import { ArrowLeft, ChevronDown, ChevronUp, Columns2, Download, FileCheck2, Link2, ListChecks, Loader2, MessageSquareText, Save, ScanText, Sparkles, Unlink2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/store/types";
import { canLocate, ChangesPanel, type PanelChange } from "./changes-panel";
import { OriginalPane } from "./original-pane";
import { useLinkedScroll } from "./use-linked-scroll";
import type { Mode } from "./doc-editor";
import { ProofreadDialog } from "./proofread-dialog";
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
  useLinkedScroll(sideBySide && scrollLock, reviewPane, originalPane, paneTick);
  const originalSd = useRef<unknown>(null);
  // Pages keep their zoom when a column narrows or widens (side by side on/off); fit them to the column again.
  useEffect(() => {
    if (phone) return;
    const fit = () => {
      refitZoom(sd.current);
      if (sideBySide) refitZoom(originalSd.current);
    };
    const t = setTimeout(fit, 120);
    return () => clearTimeout(t);
  }, [sideBySide, phone, paneTick]);

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

  /** Phone: step through all changes without opening the panel. */
  const stepAll = (dir: 1 | -1) => {
    const stops = panelChanges.filter(canLocate);
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
      <TabsList variant="line" className="h-11 w-full shrink-0 justify-start gap-3 rounded-none border-b px-4">
        <TabsTrigger value="changes" className="flex-none">
          What changed {panelChanges.length > 0 && <span className="tabular-nums text-muted-foreground">{panelChanges.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="comments" className="flex-none">
          Comments {comments > 0 && <span className="tabular-nums text-muted-foreground">{comments}</span>}
        </TabsTrigger>
        <TabsTrigger value="versions" className="flex-none">
          Versions
        </TabsTrigger>
      </TabsList>
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

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* top bar */}
      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-3 py-2 sm:px-4">
        <Link href="/" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Back to documents">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-[1.05rem] leading-tight font-semibold">{job.studentName ?? "Unnamed student"}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {job.docType === "Unknown" ? "Document" : job.docType}, {job.versions.find((v) => v.n === shown)?.label.toLowerCase()}
          </p>
        </div>
        <StatusChip status={job.status} className="hidden md:inline-flex" />

        <div className="order-last flex w-full items-center rounded-md border bg-background p-0.5 sm:order-none sm:w-auto" role="radiogroup" aria-label="Editing mode">
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
            title="The student’s file exactly as uploaded: no suggestions, no edits"
            onClick={() => {
              setSplit(false);
              setView("original");
            }}
            className={cn("h-7 flex-1 rounded px-2 text-xs transition-colors sm:flex-none sm:px-2.5", view === "original" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Original
          </button>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <Button
            size="sm"
            variant={sideBySide ? "secondary" : "outline"}
            aria-pressed={sideBySide}
            onClick={() => {
              setView("review");
              setSplit(!split);
            }}
            title={sideBySide ? "Back to one page" : "Show the original next to your review"}
          >
            <Columns2 /> <span className="hidden xl:inline">Side by side</span>
          </Button>
          {sideBySide && (
            <Button
              size="sm"
              variant={scrollLock ? "secondary" : "outline"}
              aria-pressed={scrollLock}
              onClick={() => setScrollLock(!scrollLock)}
              title={scrollLock ? "Scrolling together. Click to scroll each side on its own" : "Each side scrolls on its own. Click to scroll together"}
            >
              {scrollLock ? <Link2 /> : <Unlink2 />} <span className="hidden xl:inline">{scrollLock ? "Scroll locked" : "Lock scroll"}</span>
            </Button>
          )}
        </div>

        <Button size="sm" variant="outline" onClick={() => save({ label: "Your edits" })} disabled={!dirty || saving} title={dirty ? "Save your edits as a new version" : "No unsaved edits"}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          <span className="hidden sm:inline">{saving ? "Saving" : dirty ? "Save" : "Saved"}</span>
        </Button>
        {hasApiKey && hasBotVersion && mode !== "viewing" && (
          <Button size="sm" variant="outline" onClick={recheckSelection} disabled={rechecking} title="Select text in the document, then ask the AI to look at just that passage again">
            {rechecking ? <Loader2 className="animate-spin" /> : <ScanText />}
            <span className="hidden xl:inline">{rechecking ? "Re-checking" : "Re-check selection"}</span>
          </Button>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={markDone} disabled={job.status === "done"}>
              <FileCheck2 /> Mark as done
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 overflow-hidden bg-card md:bg-muted/50" data-split={sideBySide || undefined}>
          {/* The original sits first, so the review editor below never moves in the tree (no reload, no lost edits). */}
          {showOriginal && (
            <div
              ref={originalPane}
              data-pane="original"
              className={cn("flex min-h-0 flex-col bg-card md:bg-muted/50", sideBySide ? "w-1/2 shrink-0 border-r" : "absolute inset-0 z-10")}
            >
              <PaneLabel>{sideBySide ? "Original, as received" : "Original, as received (read only). Choose Suggesting, Editing or Viewing to go back to your review."}</PaneLabel>
              <div className="relative min-h-0 flex-1">
                <OriginalPane jobId={job.id} fileName={job.fileName} userName={authorName} reflow={phone} onReady={(s) => {
                  originalSd.current = s;
                  setPaneTick((t) => t + 1);
                }} />
              </div>
            </div>
          )}
          <div
            ref={reviewPane}
            data-pane="review"
            aria-hidden={view === "original" || undefined}
            className={cn("relative flex min-w-0 flex-1 flex-col", view === "original" && "invisible")}
            onClickCapture={(e) => activateTrackedAt(sd.current, e.clientX, e.clientY)}>
          {sideBySide && <PaneLabel>Your review</PaneLabel>}
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
        </div>
        <aside className="hidden w-[380px] shrink-0 flex-col border-l bg-card lg:flex">{panel}</aside>
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
