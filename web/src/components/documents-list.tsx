"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowUpToLine,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { menuOrigin, popReopen } from "@/components/done-pop";
import { toastDone, type Learned } from "@/components/done-toast";
import { NativeSelect } from "@/components/rules/bits";
import { StatusChip } from "@/components/status-chip";
import { EASE_OUT, useListMotion } from "@/components/use-list-motion";
import { usePreference } from "@/components/use-preference";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ARCHIVE_DAYS, archivedSince, archivesIn, isArchived } from "@/lib/store/archive";
import { isOpen, priorityList, queueNumbers } from "@/lib/store/priority";
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

type Tab = "all" | "priority" | "new" | "ready" | "done" | "archived";
type Sort = "updated" | "queue" | "newest" | "name" | "score";
const SORTS: { value: Sort; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "queue", label: "Upload order" }, // oldest first: the queue
  { value: "newest", label: "Newest uploads" },
  { value: "name", label: "Student A–Z" },
  { value: "score", label: "Lowest score first" },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "priority", label: "Priority" },
  { id: "new", label: "Waiting" },
  { id: "ready", label: "Ready to review" },
  { id: "done", label: "Done" },
  { id: "archived", label: "Archived" },
];
/** Archived documents (done for ARCHIVE_DAYS days, or added by hand) are only in Archived; Priority = starred open ones. */
const inTab = (j: Job, t: Tab, now: number, ranks: Map<string, number>) => {
  const archived = isArchived(j, now);
  if (t === "archived" || archived) return t === "archived" && archived;
  if (t === "priority") return ranks.has(j.id);
  return t === "all" || j.status === t || (t === "new" && j.status === "proofreading");
};

/**
 * A time as Karina reads dates: "Thu, 2026/10/29" and "21:00" (24-hour). In UTC while rendering on the server
 * (online it runs in UTC), in her own time zone once in the browser, so the two never disagree.
 */
export function when(iso: string, local = true) {
  const d = new Date(iso);
  const timeZone = local ? undefined : "UTC";
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", timeZone });
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(d).split("-");
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(d);
  return { date: `${weekday}, ${y}/${m}/${day}`, weekday, day: `${y}/${m}/${day}`, time };
}
/** Newest first by the exact moment (date and time), whatever form the stored time stamp has. */
const newestFirst = (pick: (j: Job) => string) => (a: Job, b: Job) => (Date.parse(pick(b)) || 0) - (Date.parse(pick(a)) || 0);
/** The exact time, on hover. */
const whenExactly = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const matches = (j: Job, q: string) => !q || [j.studentName ?? "", j.fileName, j.docType].some((s) => s.toLowerCase().includes(q));
const scoreOf = (j: Job) => j.score?.total ?? j.proofread?.score?.original.total ?? null;
const tone = (n: number) => (n >= 85 ? "text-ins" : n >= 70 ? "text-foreground" : "text-del");
const nameOf = (j: Job) => j.studentName ?? j.fileName;
/** Columns from tablet-landscape width up; narrower screens stack each document as a small card. The Priority list adds a handle column. */
const COLS = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_10rem_10.5rem_4.5rem] lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_11rem_13rem_4.5rem]";
const PCOLS = "md:grid-cols-[3.25rem_minmax(0,2fr)_minmax(0,1.2fr)_10rem_10.5rem_4.5rem] lg:grid-cols-[3.25rem_minmax(0,2fr)_minmax(0,1.2fr)_11rem_13rem_4.5rem]";

/** "deleted forever in 6 days" / "tomorrow" / "today". */
function foreverIn(expiresAt: string) {
  const days = Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000);
  return days <= 0 ? "deleted forever today" : days === 1 ? "deleted forever tomorrow" : `deleted forever in ${days} days`;
}

type Drag = { id: string; startY: number; startTop: number; dy: number; el: HTMLElement; order: string[]; from: string[] };
/** Keeps the picked-up row under the pointer, wherever the list has put it meanwhile. */
function follow(d: Drag) {
  d.el.style.transform = `translateY(${d.startTop + d.dy - d.el.offsetTop}px)`;
}

export function DocumentsList({ jobs, trashCount, initialQuery, initialTab, now }: { jobs: Job[]; trashCount: number; initialQuery: string; initialTab: Tab; now: number }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [savedSort, setSort] = usePreference<Sort>("documents-sort", "updated");
  const sort = SORTS.some((s) => s.value === savedSort) ? savedSort : "updated";
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
  // Priority list saved but not refreshed yet (id -> place, undefined = star taken off), and the order while dragging
  const [pending, setPending] = useState<Map<string, number | undefined> | null>(null);
  const [jobsSeen, setJobsSeen] = useState(jobs);
  if (jobsSeen !== jobs) {
    setJobsSeen(jobs);
    setPending(null);
  }
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const dragging = useRef<string | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  useListMotion(box, ghosts, dragging);
  const tabsRef = useRef<HTMLDivElement>(null);
  const glider = useRef<HTMLSpanElement>(null);

  const keepInUrl = (q: string, t: Tab) => {
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    if (t !== "all") url.searchParams.set("status", t);
    else url.searchParams.delete("status");
    window.history.replaceState(null, "", url);
  };

  const visible = useMemo(() => {
    const list = jobs.filter((j) => !hidden.has(j.id));
    return pending ? list.map((j) => (pending.has(j.id) ? { ...j, priority: pending.get(j.id) } : j)) : list;
  }, [jobs, hidden, pending]);
  const plist = useMemo(() => priorityList(visible, now), [visible, now]);
  const ranks = useMemo(() => new Map(plist.map((j, i) => [j.id, i + 1])), [plist]);
  const queue = useMemo(() => queueNumbers(visible, now), [visible, now]);
  const counts = Object.fromEntries(TABS.map((t) => [t.id, visible.filter((j) => inTab(j, t.id, now, ranks)).length])) as Record<Tab, number>;
  const countsKey = TABS.map((t) => counts[t.id]).join();
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (tab === "priority") {
      if (dragOrder) {
        const byId = new Map(plist.map((j) => [j.id, j]));
        return dragOrder.map((id) => byId.get(id)).filter((j): j is Job => !!j);
      }
      return plist.filter((j) => matches(j, q));
    }
    const list = visible.filter((j) => inTab(j, tab, now, ranks) && matches(j, q));
    if (sort === "name") list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    else if (sort === "score") list.sort((a, b) => (scoreOf(a) ?? 101) - (scoreOf(b) ?? 101)); // lowest score first: needs most work
    else if (sort === "queue") list.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
    else if (sort === "newest") list.sort(newestFirst((j) => j.createdAt));
    else if (tab === "archived") list.sort(newestFirst((j) => archivedSince(j, now) ?? j.updatedAt));
    else list.sort(newestFirst((j) => j.updatedAt));
    return list;
  }, [visible, plist, ranks, dragOrder, tab, q, sort, now]);
  // a search also finding archived documents points there
  const archivedMatches = q && tab !== "archived" ? visible.filter((j) => isArchived(j, now) && matches(j, q)).length : 0;
  const isPriority = tab === "priority";
  const canDrag = isPriority && !q && plist.length > 1;

  const chooseTab = (t: Tab) => {
    setTab(t);
    keepInUrl(query, t);
  };

  // the highlight slides from one tab to the next (and follows the tabs when they wrap or the counts change)
  useLayoutEffect(() => {
    const bar = tabsRef.current;
    const g = glider.current;
    if (!bar || !g) return;
    const place = () => {
      const on = bar.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!on) return;
      g.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      g.style.width = `${on.offsetWidth}px`;
      g.style.height = `${on.offsetHeight}px`;
      if (!g.dataset.ready) requestAnimationFrame(() => (g.dataset.ready = "1"));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [tab, countsKey]);

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
    const from = menuOrigin(); // the "⋯" button: the animation starts there
    const res = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) return toast.error("Could not update the document.");
    if (status === "done") toastDone(((await res.json()) as { learned?: Learned }).learned, () => router.push("/rules?tab=learned"), from);
    else {
      popReopen(from);
      toast.success("Back in review");
    }
    router.refresh();
  }

  /** "Add to Archive" / "Remove from Archive": moves it in or out of Archived, nothing else (the status stays). */
  async function setArchived(job: Job, archived: boolean) {
    const res = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived }) });
    if (!res.ok) return toast.error("Could not update the document.");
    toast.success(archived ? `“${nameOf(job)}” added to Archive` : `“${nameOf(job)}” removed from Archive`, { action: { label: "Undo", onClick: () => void setArchived(job, !archived) } });
    router.refresh();
  }

  /** Saves the Priority list in this order (first = 1); starred documents left out lose their star. */
  async function saveOrder(order: string[]) {
    const next = new Map<string, number | undefined>(plist.map((j) => [j.id, undefined]));
    order.forEach((id, i) => next.set(id, i + 1));
    setPending(next); // shown at once; the server catches up
    const res = await fetch("/api/priority", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) }).catch(() => null);
    if (!res?.ok) {
      setPending(null);
      toast.error("Could not save the Priority list.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function toggleStar(job: Job) {
    const before = plist.map((j) => j.id);
    const starred = ranks.has(job.id);
    const order = starred ? before.filter((id) => id !== job.id) : [...before, job.id];
    if (!(await saveOrder(order))) return;
    const undo = { action: { label: "Undo", onClick: () => void saveOrder(before) } };
    if (starred) toast(`“${nameOf(job)}” taken off the Priority list`, undo);
    else toast.success(`“${nameOf(job)}” is number ${order.length} on the Priority list`, undo);
  }

  const moveTo = (id: string, index: number) => {
    const order = plist.map((j) => j.id).filter((x) => x !== id);
    order.splice(Math.max(0, Math.min(index, order.length)), 0, id);
    void saveOrder(order);
  };

  // ---- dragging a row by its handle in the Priority list (window listeners: they keep working over other rows) ----
  const rowAt = (id: string) => box.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(id)}"]`) ?? null;
  useLayoutEffect(() => {
    if (drag.current) follow(drag.current); // after the rows moved: the picked-up one stays under the finger
  }, [dragOrder]);

  function onGripDown(e: ReactPointerEvent, job: Job) {
    if (!canDrag || e.button !== 0) return;
    const el = rowAt(job.id);
    if (!el) return;
    e.preventDefault();
    const ids = plist.map((j) => j.id);
    drag.current = { id: job.id, startY: e.pageY, startTop: el.offsetTop, dy: 0, el, order: ids, from: ids };
    dragging.current = job.id;
    el.dataset.dragging = "true";
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (ev.clientY < 70) window.scrollBy(0, -10);
      else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 10);
      d.dy = ev.pageY - d.startY;
      const centre = d.startTop + d.dy + d.el.offsetHeight / 2;
      const others = d.order.filter((x) => x !== d.id);
      const at = others.filter((x) => {
        const r = rowAt(x);
        return r ? r.offsetTop + r.offsetHeight / 2 < centre : false;
      }).length;
      const order = [...others.slice(0, at), d.id, ...others.slice(at)];
      if (order.join() !== d.order.join()) {
        d.order = order;
        setDragOrder(order);
      }
      follow(d);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = drag.current;
      drag.current = null;
      dragging.current = null;
      if (!d) return;
      const from = d.el.style.transform;
      d.el.style.transform = "";
      delete d.el.dataset.dragging;
      d.el.animate([{ transform: from }, { transform: "none" }], { duration: 260, easing: EASE_OUT });
      if (d.order.join() !== d.from.join()) void saveOrder(d.order);
      setDragOrder(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function onGripKey(e: KeyboardEvent, job: Job) {
    const rank = ranks.get(job.id);
    if (!canDrag || !rank) return;
    const to = e.key === "ArrowUp" ? rank - 2 : e.key === "ArrowDown" ? rank : e.key === "Home" ? 0 : e.key === "End" ? plist.length : null;
    if (to === null) return;
    e.preventDefault();
    moveTo(job.id, to);
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
    toast(`Moved “${nameOf(job)}” to Recently deleted`, { action: { label: "Undo", onClick: () => void restore(trashed) } });
    router.refresh();
    if (trashOpen) void loadTrash();
  }

  /** The two times on each row: the one the list is ordered by first. */
  const stampsFor = (job: Job): { label: string; iso: string }[] => {
    const uploaded = { label: "Uploaded", iso: job.createdAt };
    const updated = { label: "Updated", iso: job.updatedAt };
    if (sort === "queue" || sort === "newest") return [uploaded, tab === "archived" ? { label: "Archived", iso: archivedSince(job, now) ?? job.updatedAt } : updated];
    if (tab === "archived") return [{ label: "Archived", iso: archivedSince(job, now) ?? job.updatedAt }, uploaded];
    return [updated, uploaded];
  };

  const cols = isPriority ? PCOLS : COLS;

  return (
    <>
      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div ref={tabsRef} role="tablist" aria-label="Show documents" className="relative flex flex-wrap gap-1.5">
          {/* the highlight glides over the other tabs on its way; the chosen tab's words sit above it */}
          <span ref={glider} aria-hidden className="tab-glider pointer-events-none absolute top-0 left-0 z-[1] rounded-full bg-primary shadow-sm" />
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => chooseTab(t.id)}
              className={cn(
                "relative inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                tab === t.id ? "border-transparent text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <span className="relative z-[2] inline-flex items-center gap-1">
                {t.id === "priority" && <Star className={cn("size-3.5", tab === t.id ? "fill-current" : "fill-star text-star")} />}
                {t.label} <span className="tabular-nums opacity-75">{counts[t.id]}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2 lg:justify-end">
          <div className="relative min-w-0 flex-1 lg:max-w-64">
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
          {isPriority ? (
            <p className="hidden shrink-0 text-xs text-muted-foreground sm:block">In your order</p>
          ) : (
            <NativeSelect ariaLabel="Sort" value={sort} onChange={setSort} options={SORTS} />
          )}
        </div>
      </div>

      {(tab === "archived" || tab === "done" || isPriority) && (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          {isPriority ? <Star className="mt-0.5 size-4 shrink-0 fill-star text-star" /> : <Archive className="mt-0.5 size-4 shrink-0" />}
          {isPriority
            ? q
              ? "Clear the search to change the order."
              : "Your own order: drag a document by its handle, or select the handle and use the arrow keys. Tap the star on any document to add it; marking it as done takes it off."
            : tab === "archived"
              ? `Documents you added to Archive, and documents marked as done more than ${ARCHIVE_DAYS} days ago. They stay here until you delete them; Reopen or Remove from Archive brings one back.`
              : `A document moves to Archived ${ARCHIVE_DAYS} days after you mark it as done.`}
        </p>
      )}

      <section className="mt-4 overflow-hidden rounded-lg border bg-card" aria-label="Documents">
        <div className={cn("hidden gap-x-4 border-b py-2 pr-2 text-xs text-muted-foreground md:grid", cols, isPriority ? "pl-2" : "pl-5")}>
          {isPriority && <span className="text-center">Order</span>}
          <span>Student</span>
          <span>Type</span>
          <span>Status and score</span>
          <span className="text-right">Dates</span>
          <span className="sr-only">Actions</span>
        </div>
        <div ref={box} className="relative overflow-hidden">
          <div ref={ghosts} aria-hidden className="pointer-events-none absolute inset-0 z-[1]" />
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {visible.length === 0
                ? "No documents yet. Drop a student’s Word or PDF file above to start."
                : query
                  ? `Nothing matches “${query}”${archivedMatches ? " here" : ""}.`
                  : tab === "archived"
                    ? `Nothing archived yet. Documents come here ${ARCHIVE_DAYS} days after you mark them as done.`
                    : isPriority
                      ? "No priorities yet. Tap the star on a document to put it on this list."
                      : "Nothing in this list."}
            </p>
          ) : (
            <ul className="relative divide-y">
              {shown.map((job) => {
                const changes = job.proofread?.changeCount ?? job.proofread?.changes.length;
                const score = scoreOf(job);
                const stamps = stampsFor(job).map((s) => ({ ...s, at: when(s.iso, mounted) }));
                const exactly = mounted ? stampsFor(job).map((s) => `${s.label}: ${whenExactly(s.iso)}`).join("\n") : undefined;
                const soon = archivesIn(job, now);
                const rank = ranks.get(job.id);
                const inQueue = queue.get(job.id);
                const open = isOpen(job, now);
                return (
                  <li
                    key={job.id}
                    data-flip={job.id}
                    className={cn(
                      "doc-row group grid items-center gap-x-2 pr-2 transition-colors focus-within:bg-secondary/50 hover:bg-secondary/50 md:gap-x-4",
                      isPriority ? "grid-cols-[auto_1fr_auto] pl-1 md:pl-2" : "grid-cols-[1fr_auto] pl-4 md:pl-5",
                      cols,
                    )}
                  >
                    {isPriority && (
                      <button
                        type="button"
                        className={cn(
                          "drag-grip flex h-11 items-center justify-center gap-0.5 rounded-md text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          canDrag ? "hover:bg-secondary hover:text-foreground" : "cursor-default",
                        )}
                        aria-label={`${nameOf(job)}: number ${rank} on the Priority list${canDrag ? ". Use the arrow keys to move it" : ""}`}
                        aria-disabled={!canDrag}
                        onPointerDown={(e) => onGripDown(e, job)}
                        onKeyDown={(e) => onGripKey(e, job)}
                      >
                        {canDrag && <GripVertical className="size-4 shrink-0" />}
                        <span className="min-w-5 text-center font-serif text-lg font-semibold text-foreground tabular-nums">{rank}</span>
                      </button>
                    )}
                    <Link
                      href={`/jobs/${job.id}`}
                      className="col-span-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-sm py-3.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:col-span-4 md:grid-cols-subgrid md:gap-y-1"
                    >
                      <div className="min-w-0">
                        <p className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-serif text-[1.02rem] font-semibold">{job.studentName ?? "Unnamed student"}</span>
                          {rank && !isPriority && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-star-soft px-1.5 py-px text-xs font-semibold text-mark-foreground tabular-nums" title={`Number ${rank} on your Priority list`}>
                              <Star className="size-3 fill-star text-star" />
                              {rank}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{job.sourceFile ? `${job.sourceFile.name} (PDF)` : job.fileName}</p>
                      </div>
                      <div className="col-start-2 row-start-1 justify-self-end text-right md:col-start-auto md:row-start-auto md:justify-self-stretch md:text-left">
                        <p className="text-sm text-pretty">{job.docType === "Unknown" ? "Document" : job.docType}</p>
                        {changes !== undefined && (
                          <p className="hidden text-xs text-muted-foreground md:block">
                            {changes} changes{job.proofread?.ai ? ", with AI" : ""}
                          </p>
                        )}
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 md:col-span-1">
                        <StatusChip status={job.status} />
                        {score !== null && (
                          <span className="inline-flex shrink-0 items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums" title="Score out of 100: original → latest">
                            {job.proofread?.score && job.proofread.score.original.total !== score && <span>{job.proofread.score.original.total} →</span>}
                            <span className={cn("font-serif text-sm font-semibold", tone(score))}>{score}</span>
                          </span>
                        )}
                        {inQueue && (
                          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums" title="Upload order of the documents not done yet: 1 has waited longest">
                            #{inQueue} in queue
                          </span>
                        )}
                        {soon && <span className="basis-full text-xs text-muted-foreground">{soon}</span>}
                        {/* phones: both times under the status (the name keeps the room it needs) */}
                        <span className="flex basis-full flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums md:hidden" title={exactly}>
                          {stamps.map((s) => (
                            <span key={s.label} className="whitespace-nowrap">
                              {s.label} {s.at.day} {s.at.time}
                            </span>
                          ))}
                        </span>
                      </div>
                      <span className="hidden text-right whitespace-nowrap tabular-nums md:block" title={exactly}>
                        {stamps.map((s, i) => (
                          <span key={s.label} className={cn("block", i === 0 ? "text-sm text-foreground/85" : "text-xs text-muted-foreground")}>
                            <span className="text-xs text-muted-foreground">{s.label} </span>
                            <span className="hidden lg:inline">{s.at.weekday}, </span>
                            {s.at.day} <span className={i === 0 ? "text-xs" : undefined}>{s.at.time}</span>
                          </span>
                        ))}
                      </span>
                    </Link>
                    <div className="flex items-center justify-end">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={cn("star-toggle", !open && "invisible")}
                        data-on={!!rank}
                        aria-pressed={!!rank}
                        aria-label={rank ? `Take ${nameOf(job)} off the Priority list` : `Add ${nameOf(job)} to the Priority list`}
                        title={rank ? `Number ${rank} on your Priority list` : "Add to Priority"}
                        onClick={() => void toggleStar(job)}
                        tabIndex={open ? undefined : -1}
                      >
                        <Star className={cn(!rank && "text-muted-foreground")} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${nameOf(job)}`} />}>
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
                          {open &&
                            (rank ? (
                              <>
                                {rank > 1 && (
                                  <DropdownMenuItem onClick={() => moveTo(job.id, 0)}>
                                    <ArrowUpToLine /> Move to the top of Priority
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => void toggleStar(job)}>
                                  <StarOff /> Remove from Priority
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem onClick={() => void toggleStar(job)}>
                                <Star /> Add to Priority
                              </DropdownMenuItem>
                            ))}
                          <DropdownMenuItem onClick={() => window.open(`/api/jobs/${job.id}/file?v=current&download=tracked`, "_self")}>
                            <Download /> Download Word file
                          </DropdownMenuItem>
                          {!isArchived(job, now) ? (
                            <DropdownMenuItem onClick={() => setArchived(job, true)}>
                              <Archive /> Add to Archive
                            </DropdownMenuItem>
                          ) : (
                            // only when removing it really takes it out (a document done 14+ days ago stays archived)
                            job.archivedAt &&
                            !isArchived({ ...job, archivedAt: undefined }, now) && (
                              <DropdownMenuItem onClick={() => setArchived(job, false)}>
                                <ArchiveRestore /> Remove from Archive
                              </DropdownMenuItem>
                            )
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => remove(job)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {archivedMatches > 0 && (
          <button
            type="button"
            onClick={() => chooseTab("archived")}
            className="flex w-full items-center justify-center gap-1.5 border-t px-5 py-2.5 text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Archive className="size-4" /> {archivedMatches} more {archivedMatches === 1 ? "match" : "matches"} in Archived
          </button>
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
