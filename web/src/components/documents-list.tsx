"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
import { StatusChip } from "@/components/status-chip";
import { EASE_OUT, useListMotion } from "@/components/use-list-motion";
import { usePreference } from "@/components/use-preference";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

/** Sorting by a column header: a first click sorts the usual way, the next click the other way round. */
type SortKey = "student" | "type" | "status" | "score" | "updated" | "uploaded";
type Dir = "asc" | "desc";
type Sort = { key: SortKey; dir: Dir };
const DEFAULT_SORT: Sort = { key: "student", dir: "asc" };
const FIRST_DIR: Record<SortKey, Dir> = { student: "asc", type: "asc", status: "asc", score: "asc", updated: "desc", uploaded: "desc" };
const KEYS = Object.keys(FIRST_DIR) as SortKey[];
const isSort = (s: unknown): s is Sort => !!s && typeof s === "object" && KEYS.includes((s as Sort).key) && ["asc", "desc"].includes((s as Sort).dir);
const flip = (d: Dir): Dir => (d === "asc" ? "desc" : "asc");
/** How each direction reads: "A–Z", "Newest first"… */
function dirLabel(key: SortKey, dir: Dir) {
  if (key === "student" || key === "type") return dir === "asc" ? "A–Z" : "Z–A";
  if (key === "status") return dir === "asc" ? "Waiting first" : "Done first";
  if (key === "score") return dir === "asc" ? "Lowest first" : "Highest first";
  return dir === "desc" ? "Newest first" : "Oldest first";
}
const STATUS_ORDER: Record<JobStatus, number> = { new: 0, proofreading: 0, ready: 1, done: 2 };

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
/** The exact time, on hover. */
const whenExactly = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const matches = (j: Job, q: string) => !q || [j.studentName ?? "", j.fileName, j.docType].some((s) => s.toLowerCase().includes(q));
const scoreOf = (j: Job) => j.score?.total ?? j.proofread?.score?.original.total ?? null;
const tone = (n: number) => (n >= 85 ? "text-ins" : n >= 70 ? "text-foreground" : "text-del");
const nameOf = (j: Job) => j.studentName ?? j.fileName;
const typeOf = (j: Job) => (j.docType === "Unknown" ? "Document" : j.docType);
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** The list in the chosen order (no score sorts last either way; ties by student name). */
function sortJobs(list: Job[], { key, dir }: Sort, tab: Tab, now: number) {
  const sign = dir === "asc" ? 1 : -1;
  const by: Record<SortKey, (a: Job, b: Job) => number> = {
    student: (a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" }),
    type: (a, b) => typeOf(a).localeCompare(typeOf(b)),
    status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
    score: (a, b) => (scoreOf(a) ?? 0) - (scoreOf(b) ?? 0),
    // in Archived, "Updated" is the day it was archived
    updated: (a, b) => (tab === "archived" ? time(archivedSince(a, now)) - time(archivedSince(b, now)) : time(a.updatedAt) - time(b.updatedAt)),
    uploaded: (a, b) => time(a.createdAt) - time(b.createdAt),
  };
  return list.sort((a, b) => {
    if (key === "score" && (scoreOf(a) === null) !== (scoreOf(b) === null)) return scoreOf(a) === null ? 1 : -1;
    return by[key](a, b) * sign || by.student(a, b);
  });
}

/**
 * Columns from tablet-landscape width up (narrower screens stack each document as a small card): the star, then
 * student, type, status and score, dates, and the ⋯ menu. The Priority list puts its order controls first instead.
 */
const COLS = "grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[3.25rem_minmax(0,2fr)_minmax(0,1.2fr)_10rem_10.5rem_2.25rem] lg:grid-cols-[3.25rem_minmax(0,2fr)_minmax(0,1.2fr)_11rem_13rem_2.25rem]";
const PCOLS = "grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[6.75rem_minmax(0,2fr)_minmax(0,1.2fr)_10rem_10.5rem_2.25rem] lg:grid-cols-[6.75rem_minmax(0,2fr)_minmax(0,1.2fr)_11rem_13rem_2.25rem]";

/** A column title that sorts the list: shows the direction while it is the one in use. */
function SortButton({ k, label, sort, onSort, className }: { k: SortKey; label: string; sort: Sort; onSort: (k: SortKey) => void; className?: string }) {
  const on = sort.key === k;
  const next = on ? flip(sort.dir) : FIRST_DIR[k];
  const Icon = on ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-label={on ? `${label}: sorted ${dirLabel(k, sort.dir)}. Sort ${dirLabel(k, next)}` : `Sort by ${label}, ${dirLabel(k, next)}`}
      title={on ? `Sorted ${dirLabel(k, sort.dir)}. Click for ${dirLabel(k, next)}` : `Sort by ${label} (${dirLabel(k, next)})`}
      className={cn(
        "group/sort -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 whitespace-nowrap transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        on && "font-medium text-foreground",
        className,
      )}
    >
      {label}
      {on && <span className="font-normal text-muted-foreground">{dirLabel(k, sort.dir)}</span>}
      <Icon className={cn("size-3.5 shrink-0", !on && "opacity-40 group-hover/sort:opacity-100")} />
    </button>
  );
}

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
  const [savedSort, setSort] = usePreference<Sort>("documents-sort-by", DEFAULT_SORT);
  const sort = isSort(savedSort) ? savedSort : DEFAULT_SORT;
  const chooseSort = (key: SortKey) => setSort(sort.key === key ? { key, dir: flip(sort.dir) } : { key, dir: FIRST_DIR[key] });
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
    return sortJobs(
      visible.filter((j) => inTab(j, tab, now, ranks) && matches(j, q)),
      sort,
      tab,
      now,
    );
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
    const updated = tab === "archived" ? { label: "Archived", iso: archivedSince(job, now) ?? job.updatedAt } : { label: "Updated", iso: job.updatedAt };
    return sort.key === "uploaded" && !isPriority ? [uploaded, updated] : [updated, uploaded];
  };

  const cols = isPriority ? PCOLS : COLS;
  const updatedLabel = tab === "archived" ? "Archived" : "Updated";
  const sortable: { k: SortKey; label: string }[] = [
    { k: "student", label: "Student" },
    { k: "type", label: "Type" },
    { k: "status", label: "Status" },
    { k: "score", label: "Score" },
    { k: "updated", label: updatedLabel },
    { k: "uploaded", label: "Uploaded" },
  ];

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
        </div>
      </div>

      {/* phones: the column titles are hidden, so the same sorting sits here */}
      {!isPriority && (
        <div className="mt-3 -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 md:hidden" role="group" aria-label="Sort documents">
          <span className="shrink-0 text-xs text-muted-foreground">Sort</span>
          {sortable.map((s) => (
            <SortButton
              key={s.k}
              k={s.k}
              label={s.label}
              sort={sort}
              onSort={chooseSort}
              className={cn("mx-0 h-7 shrink-0 rounded-full border px-2.5 text-xs", sort.key === s.k ? "border-primary/40 bg-secondary" : "bg-card text-muted-foreground")}
            />
          ))}
        </div>
      )}

      {(tab === "archived" || tab === "done" || isPriority) && (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          {isPriority ? <Star className="mt-0.5 size-4 shrink-0 fill-star text-star" /> : <Archive className="mt-0.5 size-4 shrink-0" />}
          {isPriority
            ? "Your own order, number 1 first. Tap a number to give the document another place, use the arrows beside it, or drag it by its handle. Star documents in any list to add them; marking one as done takes it off."
            : tab === "archived"
              ? `Documents you added to Archive, and documents marked as done more than ${ARCHIVE_DAYS} days ago. They stay here until you delete them; Reopen or Remove from Archive brings one back.`
              : `A document moves to Archived ${ARCHIVE_DAYS} days after you mark it as done.`}
        </p>
      )}

      <section className="mt-4 overflow-hidden rounded-lg border bg-card" aria-label="Documents">
        <div className={cn("hidden items-center gap-x-4 border-b py-1.5 pr-2 pl-2 text-xs text-muted-foreground md:grid", cols)}>
          {isPriority ? (
            <>
              <span className="pl-1">Order</span>
              <span>Student</span>
              <span>Type</span>
              <span>Status and score</span>
              <span className="text-right">Dates</span>
            </>
          ) : (
            <>
              <span className="text-center" title="Star a document to put it on your Priority list">
                <Star className="mx-auto size-3.5" aria-label="Priority" />
              </span>
              <span>
                <SortButton k="student" label="Student" sort={sort} onSort={chooseSort} />
              </span>
              <span>
                <SortButton k="type" label="Type" sort={sort} onSort={chooseSort} />
              </span>
              <span className="flex flex-wrap gap-x-3">
                <SortButton k="status" label="Status" sort={sort} onSort={chooseSort} />
                <SortButton k="score" label="Score" sort={sort} onSort={chooseSort} />
              </span>
              <span className="flex flex-wrap justify-end gap-x-3">
                <SortButton k="updated" label={updatedLabel} sort={sort} onSort={chooseSort} />
                <SortButton k="uploaded" label="Uploaded" sort={sort} onSort={chooseSort} />
              </span>
            </>
          )}
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
                      "doc-row group grid items-center gap-x-2 pr-2 pl-1 transition-colors focus-within:bg-secondary/50 hover:bg-secondary/50 md:gap-x-4 md:pl-2",
                      cols,
                    )}
                  >
                    {isPriority && rank ? (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className={cn(
                            "drag-grip flex h-10 w-6 items-center justify-center rounded-md text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                            canDrag ? "hover:bg-secondary hover:text-foreground" : "pointer-events-none opacity-30",
                          )}
                          aria-label={`Drag to move ${nameOf(job)}, or use the arrow keys`}
                          title={canDrag ? "Drag to move" : "Clear the search to drag"}
                          aria-disabled={!canDrag}
                          onPointerDown={(e) => onGripDown(e, job)}
                          onKeyDown={(e) => onGripKey(e, job)}
                        >
                          <GripVertical className="size-4" />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="inline-flex h-9 min-w-11 items-center justify-center gap-0.5 rounded-lg border border-star/40 bg-star-soft px-1.5 font-serif text-lg font-semibold text-mark-foreground tabular-nums transition-colors hover:border-star focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                                aria-label={`${nameOf(job)} is number ${rank}. Choose another number`}
                                title="Choose another number"
                              />
                            }
                          >
                            {rank}
                            <ChevronDown className="size-3 opacity-70" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-80 w-52">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Move {nameOf(job)} to number</DropdownMenuLabel>
                              {plist.map((p, i) => (
                                <DropdownMenuItem key={p.id} disabled={i + 1 === rank} onClick={() => moveTo(job.id, i)}>
                                  <span className="w-5 text-right font-semibold tabular-nums">{i + 1}</span>
                                  <span className="truncate text-muted-foreground">{i + 1 === rank ? "now" : `instead of ${nameOf(p)}`}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => void toggleStar(job)}>
                              <StarOff /> Remove from Priority
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            className="flex h-5 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-25"
                            disabled={rank === 1}
                            aria-label={`Move ${nameOf(job)} up to number ${rank - 1}`}
                            title="Move up"
                            onClick={() => moveTo(job.id, rank - 2)}
                          >
                            <ChevronUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="flex h-5 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-25"
                            disabled={rank === plist.length}
                            aria-label={`Move ${nameOf(job)} down to number ${rank + 1}`}
                            title="Move down"
                            onClick={() => moveTo(job.id, rank)}
                          >
                            <ChevronDown className="size-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-center">
                        {open ? (
                          <button
                            type="button"
                            className={cn(
                              "star-toggle inline-flex h-10 min-w-10 items-center justify-center gap-0.5 rounded-full px-1.5 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                              rank ? "bg-star-soft text-mark-foreground hover:bg-star-soft/70" : "text-muted-foreground/70 hover:bg-star-soft hover:text-star",
                            )}
                            data-on={!!rank}
                            aria-pressed={!!rank}
                            aria-label={rank ? `${nameOf(job)} is number ${rank} on the Priority list. Take it off` : `Add ${nameOf(job)} to the Priority list`}
                            title={rank ? `Number ${rank} on your Priority list. Tap to take it off` : "Add to your Priority list"}
                            onClick={() => void toggleStar(job)}
                          >
                            <Star className="size-5" />
                            {rank && <span className="text-sm font-semibold tabular-nums">{rank}</span>}
                          </button>
                        ) : (
                          // done or archived: finished work isn't on the Priority list
                          <span className="size-10" aria-hidden />
                        )}
                      </div>
                    )}
                    <Link
                      href={`/jobs/${job.id}`}
                      className="col-span-1 grid grid-cols-1 items-center gap-x-4 gap-y-2 rounded-sm py-3.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:col-span-4 md:grid-cols-subgrid md:gap-y-1"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-serif text-[1.02rem] font-semibold">{job.studentName ?? "Unnamed student"}</p>
                        {/* phones: the type here, so the name has the whole width; the file name only when there is no name */}
                        <p className="truncate text-sm md:hidden">{typeOf(job)}</p>
                        <p className={cn("truncate text-sm text-muted-foreground", job.studentName && "hidden md:block")}>{job.sourceFile ? `${job.sourceFile.name} (PDF)` : job.fileName}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-sm text-pretty">{typeOf(job)}</p>
                        {changes !== undefined && (
                          <p className="hidden text-xs text-muted-foreground md:block">
                            {changes} changes{job.proofread?.ai ? ", with AI" : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
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
