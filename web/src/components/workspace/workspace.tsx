"use client";

import { ArrowLeft, ChevronDown, Download, FileCheck2, ListChecks, Loader2, MessageSquareText, Save, ScanText, Sparkles } from "lucide-react";
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
import { ChangesPanel, type PanelChange } from "./changes-panel";
import type { Mode } from "./doc-editor";
import { ProofreadDialog } from "./proofread-dialog";
import { countComments, decide, exportDocx, listTracked, scrollTo, selectedText, setMode as sdSetMode, trackedReplace, type TrackedItem } from "./superdoc-api";
import { usePhone } from "./use-phone";
import { VersionsPanel } from "./versions-panel";

const DocEditor = dynamic(() => import("./doc-editor"), {
  ssr: false,
  loading: () => <EditorPlaceholder text="Opening the document…" />,
});

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
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

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
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasBotVersion = job.versions.some((v) => v.kind === "bot");
  const phone = usePhone();

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

  const apply = async (decision: "accept" | "reject", items: PanelChange[]) => {
    const ids = items.flatMap((c) => c.live.map((t) => t.id));
    if (!ids.length) return;
    if (!(await decide(sd.current, decision, ids))) toast.error("That change could not be updated in the editor.");
    setDirty(true);
    refresh();
  };

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
            onAccept={(c) => apply("accept", [c])}
            onReject={(c) => apply("reject", [c])}
            onAcceptAll={() => apply("accept", panelChanges)}
            onRejectAll={() => apply("reject", panelChanges)}
            onRestoreRemoved={(items) => apply("reject", items)}
            onFocus={(c) => c.live[0] && scrollTo(sd.current, c.live[0].id)}
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
              aria-checked={mode === m.id}
              title={m.hint}
              onClick={() => changeMode(m.id)}
              className={cn("h-7 flex-1 rounded px-2 text-xs transition-colors sm:flex-none sm:px-2.5", mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {m.label}
            </button>
          ))}
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
        <div className="relative min-w-0 flex-1 overflow-hidden bg-card md:bg-muted/50">
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
                sdSetMode(s, mode);
                refresh();
                setDirty(false);
              }}
              onUpdate={onUpdate}
              onError={(m) => toast.error(m)}
            />
          ) : (
            <EditorPlaceholder text="Opening the document…" />
          )}
        </div>
        <aside className="hidden w-[380px] shrink-0 flex-col border-l bg-card lg:flex">{panel}</aside>
      </div>

      {/* phone / tablet: panel as a bottom sheet */}
      <div className="no-print fixed inset-x-0 bottom-4 z-30 flex justify-center lg:hidden">
        <Button className="shadow-lg" onClick={() => setSheetOpen(true)}>
          {tab === "versions" ? <ListChecks /> : <MessageSquareText />} {panelChanges.length ? `${panelChanges.length} changes` : "Review panel"}
        </Button>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[75dvh] gap-0 p-0">
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
