"use client";

import { ArchiveRestore, CheckCircle2, ChevronDown, Download, ExternalLink, MoreHorizontal, Pencil, RotateCcw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { toastDone, type Learned } from "@/components/done-toast";
import { NativeSelect } from "@/components/rules/bits";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Job, JobStatus, TrashEntry } from "@/lib/store/types";
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

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const scoreOf = (j: Job) => j.score?.total ?? j.proofread?.score?.original.total ?? null;
const tone = (n: number) => (n >= 85 ? "text-ins" : n >= 70 ? "text-foreground" : "text-del");
const COLS = "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_12.5rem_4.5rem_2.25rem]";

export function DocumentsList({ jobs, initialQuery, initialTab }: { jobs: Job[]; initialQuery: string; initialTab: Tab }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<Sort>("updated");
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // deleted, before the list refreshes
  const [renaming, setRenaming] = useState<Job | null>(null);
  const [trash, setTrash] = useState<TrashEntry[] | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

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

  const loadTrash = async () => setTrash((await (await fetch("/api/trash", { cache: "no-store" })).json()) as TrashEntry[]);

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
                      <span className="text-xs text-muted-foreground sm:hidden">{when(job.updatedAt)}</span>
                    </div>
                    <span className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">{when(job.updatedAt)}</span>
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
        </button>
        {trashOpen && (
          <div className="mt-2 overflow-hidden rounded-lg border bg-card">
            {trash === null ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
            ) : trash.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Nothing deleted. Deleted documents stay here so you can bring them back.</p>
            ) : (
              <ul className="divide-y">
                {trash.map((t) => (
                  <li key={t.entry} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.job.studentName ?? "Unnamed student"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.job.docType === "Unknown" ? "Document" : t.job.docType}, deleted {new Date(t.deletedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => restore(t.entry)}>
                      <ArchiveRestore /> Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <RenameDialog job={renaming} onClose={() => setRenaming(null)} onSaved={() => router.refresh()} />
    </>
  );
}

/** Correct the student's name (it is used in the DONE_ file names). */
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
          <DialogDescription>Shown in the list and used in the exported file names (DONE_&lt;first name&gt;_…). Use the name the student goes by.</DialogDescription>
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
