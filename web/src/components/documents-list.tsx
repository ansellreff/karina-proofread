"use client";

import { ArchiveRestore, CheckCircle2, ChevronDown, Download, ExternalLink, MoreHorizontal, Pencil, RotateCcw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { toastDone, type Learned } from "@/components/done-toast";
import { NativeSelect } from "@/components/rules/bits";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TRASH_DAYS, type Job, type JobStatus, type TrashEntry } from "@/lib/store/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Tab = "all" | "new" | "ready" | "done";
type Sort = "updated" | "name" | "score";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "Waiting" },
  { id: "ready", label: "Ready to review" },
  { id: "done", label: "Done" },
];
const inTab = (j: Job, t: Tab) => t === "all" || j.status === t || (t === "new" && j.status === "proofreading");

/**
 * Last updated, as Karina reads dates: "Tue, 2026/10/27". In UTC while rendering on the server (online it runs in
 * UTC), in her own time zone once in the browser, so the two never disagree.
 */
export function when(iso: string, local = true) {
  const d = new Date(iso);
  const timeZone = local ? undefined : "UTC";
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", timeZone });
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(d).split("-");
  return `${weekday}, ${y}/${m}/${day}`;
}
/** The exact time, on hover. */
const whenExactly = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const scoreOf = (j: Job) => j.score?.total ?? j.proofread?.score?.original.total ?? null;
const tone = (n: number) => (n >= 85 ? "text-ins" : n >= 70 ? "text-foreground" : "text-del");
const COLS = "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_12.5rem_7.25rem_2.25rem]";

/** "deleted forever in 6 days" / "tomorrow" / "today". */
function foreverIn(expiresAt: string) {
  const days = Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000);
  return days <= 0 ? "deleted forever today" : days === 1 ? "deleted forever tomorrow" : `deleted forever in ${days} days`;
}

export function DocumentsList({ jobs, trashCount, initialQuery, initialTab }: { jobs: Job[]; trashCount: number; initialQuery: string; initialTab: Tab }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<Sort>("updated");
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // deleted, before the list refreshes
  const [renaming, setRenaming] = useState<Job | null>(null);
  const [trash, setTrash] = useState<TrashEntry[] | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashTotal, setTrashTotal] = useState(trashCount);
  const [seenCount, setSeenCount] = useState(trashCount);
  if (seenCount !== trashCount) {
    // the server's count after a refresh (a delete or restore elsewhere)
    setSeenCount(trashCount);
    setTrashTotal(trashCount);
  }
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "one"; entry: TrashEntry } | { kind: "all" } | null>(null);

  const keepInUrl = (q: string, t: Tab) => {
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    if (t !== "all") url.searchParams.set("status", t);
    else url.searchParams.delete("status");
    window.history.replaceState(null, "", url);
  };

  const visible = jobs.filter((j) => !hidden.has(j.id));
  const counts = Object.fromEntries(TABS.map((t) => [t.id, visible.filter((j) => inTab(j, t.id)).length])) as Record<Tab, number>;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = visible.filter((j) => inTab(j, tab) && (!q || [j.studentName ?? "", j.fileName, j.docType].some((s) => s.toLowerCase().includes(q))));
    if (sort === "name") list.sort((a, b) => (a.studentName ?? a.fileName).localeCompare(b.studentName ?? b.fileName));
    else if (sort === "score") list.sort((a, b) => (scoreOf(a) ?? 101) - (scoreOf(b) ?? 101)); // lowest score first: needs most work
    return list;
  }, [visible, tab, query, sort]);

  const loadTrash = async () => {
    const list = (await (await fetch("/api/trash", { cache: "no-store" })).json()) as TrashEntry[];
    setTrash(list);
    setTrashTotal(list.length);
  };

  async function deleteForever() {
    const c = confirmDelete;
    setConfirmDelete(null);
    if (!c) return;
    const res = await fetch(c.kind === "one" ? `/api/trash/${encodeURIComponent(c.entry.entry)}` : "/api/trash", { method: "DELETE" });
    if (!res.ok) return toast.error("Could not delete.");
    toast.success(c.kind === "one" ? "Deleted forever" : "Recently deleted is empty");
    void loadTrash();
  }

  async function setStatus(job: Job, status: JobStatus) {
    const res = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) return toast.error("Could not update the document.");
    if (status === "done") toastDone(((await res.json()) as { learned?: Learned }).learned, () => router.push("/rules?tab=learned"));
    else toast.success("Back in review");
    router.refresh();
  }

  async function restore(entry: string) {
    const res = await fetch(`/api/trash/${encodeURIComponent(entry)}`, { method: "POST" });
    const body = (await res.json()) as { id?: string; error?: string };
    if (!res.ok) return toast.error(body.error ?? "Could not restore.");
    setHidden((h) => {
      const n = new Set(h);
      if (body.id) n.delete(body.id);
      return n;
    });
    toast.success("Document restored");
    router.refresh();
    if (trashOpen) void loadTrash();
  }

  async function remove(job: Job) {
    setHidden((h) => new Set(h).add(job.id));
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    const { trashed } = (await res.json().catch(() => ({}))) as { trashed?: string | null };
    if (!res.ok || !trashed) {
      setHidden((h) => {
        const n = new Set(h);
        n.delete(job.id);
        return n;
      });
      return toast.error("Could not delete the document.");
    }
    toast(`Moved “${job.studentName ?? job.fileName}” to Recently deleted`, { action: { label: "Undo", onClick: () => void restore(trashed) } });
    router.refresh();
    if (trashOpen) void loadTrash();
  }

  return (
    <>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Show documents" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                keepInUrl(query, t.id);
              }}
              className={cn(
                "h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                tab === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {t.label} <span className="tabular-nums opacity-75">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2 sm:justify-end">
          <div className="relative min-w-0 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                keepInUrl(e.target.value, tab);
              }}
              placeholder="Search student, file or type"
              aria-label="Search documents"
              className="pl-8"
            />
          </div>
          <NativeSelect
            ariaLabel="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "updated", label: "Latest first" },
              { value: "name", label: "Student A–Z" },
              { value: "score", label: "Lowest score first" },
            ]}
          />
        </div>
      </div>

      <section className="mt-4 overflow-hidden rounded-lg border bg-card" aria-label="Documents">
        <div className={cn("hidden gap-x-4 border-b py-2 pr-2 pl-5 text-xs text-muted-foreground sm:grid", COLS)}>
          <span>Student</span>
          <span>Type</span>
          <span>Status and score</span>
          <span className="text-right">Updated</span>
          <span className="sr-only">Actions</span>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {visible.length === 0 ? "No documents yet. Drop a student’s Word or PDF file above to start." : query ? `Nothing matches “${query}”.` : "Nothing in this list."}
          </p>
        ) : (
          <ul className="divide-y">
            {shown.map((job) => {
              const changes = job.proofread?.changeCount ?? job.proofread?.changes.length;
              const score = scoreOf(job);
              return (
                <li key={job.id} className={cn("group grid grid-cols-[1fr_auto] items-center gap-x-2 pr-2 pl-4 transition-colors focus-within:bg-secondary/50 hover:bg-secondary/50 sm:gap-x-4 sm:pl-5", COLS)}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="col-span-1 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-sm py-3.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:col-span-4 sm:grid-cols-subgrid"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-serif text-[1.02rem] font-semibold">{job.studentName ?? "Unnamed student"}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {job.sourceFile ? `${job.sourceFile.name} (PDF)` : job.fileName}
                      </p>
                    </div>
                    <div className="col-start-2 row-start-1 justify-self-end text-right sm:col-start-auto sm:row-start-auto sm:justify-self-start sm:text-left">
                      <p className="text-sm">{job.docType === "Unknown" ? "Document" : job.docType}</p>
                      {changes !== undefined && (
                        <p className="hidden text-xs text-muted-foreground sm:block">
                          {changes} changes{job.proofread?.ai ? ", with AI" : ""}
                        </p>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center gap-2.5 sm:col-span-1">
                      <StatusChip status={job.status} />
                      {score !== null && (
                        <span className="inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums" title="Score out of 100: original → latest">
                          {job.proofread?.score && job.proofread.score.original.total !== score && <span>{job.proofread.score.original.total} →</span>}
                          <span className={cn("font-serif text-sm font-semibold", tone(score))}>{score}</span>
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground sm:hidden" title={mounted ? whenExactly(job.updatedAt) : undefined}>
                        {when(job.updatedAt, mounted)}
                      </span>
                    </div>
                    <span className="hidden text-right text-sm whitespace-nowrap text-muted-foreground tabular-nums sm:block" title={mounted ? whenExactly(job.updatedAt) : undefined}>
                      {when(job.updatedAt, mounted)}
                    </span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${job.studentName ?? job.fileName}`} />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => router.push(`/jobs/${job.id}`)}>
                        <ExternalLink /> Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRenaming(job)}>
                        <Pencil /> Rename student
                      </DropdownMenuItem>
                      {job.status === "done" ? (
                        <DropdownMenuItem onClick={() => setStatus(job, job.versions.length > 1 ? "ready" : "new")}>
                          <RotateCcw /> Reopen
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setStatus(job, "done")} disabled={job.versions.length < 2}>
                          <CheckCircle2 /> Mark as done
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => window.open(`/api/jobs/${job.id}/file?v=current&download=tracked`, "_self")}>
                        <Download /> Download Word file
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => remove(job)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-label="Recently deleted">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            aria-expanded={trashOpen}
            onClick={() => {
              setTrashOpen(!trashOpen);
              if (!trashOpen) void loadTrash();
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronDown className={cn("size-4 transition-transform", !trashOpen && "-rotate-90")} /> Recently deleted
            {trashTotal > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{trashTotal}</span>}
          </button>
          <p className="text-xs text-muted-foreground">Deleted documents are kept here for {TRASH_DAYS} days, then deleted forever.</p>
        </div>
        {trashOpen && (
          <div className="mt-2 overflow-hidden rounded-lg border bg-card">
            {trash === null ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
            ) : trash.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Nothing deleted. A deleted document stays here for {TRASH_DAYS} days so you can bring it back.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2">
                  <p className="text-xs text-muted-foreground">Restore a document to bring it back, or delete it forever now to free up space.</p>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete({ kind: "all" })}>
                    <Trash2 /> Empty Recently deleted
                  </Button>
                </div>
                <ul className="divide-y">
                  {trash.map((t) => (
                    <li key={t.entry} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.job.studentName ?? "Unnamed student"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.job.docType === "Unknown" ? "Document" : t.job.docType}, deleted {new Date(t.deletedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {", "}
                          <span data-expires>{foreverIn(t.expiresAt)}</span>
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => restore(t.entry)}>
                          <ArchiveRestore /> Restore
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete({ kind: "one", entry: t })}>
                          <Trash2 /> Delete forever
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.kind === "one" ? `Delete “${confirmDelete.entry.job.studentName ?? confirmDelete.entry.job.fileName}” forever?` : `Delete all ${trash?.length ?? trashTotal} documents in Recently deleted forever?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "one" ? "The document and all its versions" : "These documents and all their versions"} are removed for good and can’t be restored, unless they are in a backup you downloaded
              (Settings → Backup).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteForever()}>
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RenameDialog job={renaming} onClose={() => setRenaming(null)} onSaved={() => router.refresh()} />
    </>
  );
}

/** Correct the student's name (it is used in the export file names). */
export function RenameDialog({ job, onClose, onSaved }: { job: { id: string; studentName: string | null } | null; onClose: () => void; onSaved: (name: string | null) => void }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  if (job && open !== job.id) {
    setOpen(job.id);
    setName(job.studentName ?? "");
  }
  async function save() {
    if (!job) return;
    const res = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentName: name }) });
    if (!res.ok) return toast.error("Could not rename.");
    const updated = (await res.json()) as { studentName: string | null };
    toast.success("Name updated");
    onSaved(updated.studentName);
    close();
  }
  const close = () => {
    setOpen(null);
    onClose();
  };
  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Student’s name</DialogTitle>
          <DialogDescription>Shown in the list and used in the exported file names (set in Settings → Export file name). Use the name the student goes by.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex items-center gap-2"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Student’s name" placeholder="e.g. Sari Wijaya" />
          {name && (
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setName("")} aria-label="Clear">
              <X />
            </Button>
          )}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save}>Save name</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
