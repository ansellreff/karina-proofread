"use client";

import { Check, ChevronDown, ChevronUp, RotateCcw, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChangeRecord } from "@/lib/pipeline";
import type { TrackedItem } from "./superdoc-api";

export type Filter = "all" | "notes" | "fixes" | "removed" | "beyond";

export interface PanelChange extends ChangeRecord {
  key: string;
  /** Tracked changes in the editor that belong to this bot change; empty once accepted/rejected. */
  live: TrackedItem[];
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fixes", label: "Fixes" },
  { id: "notes", label: "Notes" },
  { id: "removed", label: "Removed text" },
  { id: "beyond", label: "Beyond your style" },
];

const isRemoval = (c: ChangeRecord) => c.before.length > 0;
/** Whether "show in document" can find it (resolved formatting leaves nothing to point at). */
export const canLocate = (c: PanelChange) => c.live.length > 0 || c.kind !== "format";
const isNote = (c: ChangeRecord) => c.kind === "note" || c.kind === "paragraph";

function kindLabel(c: ChangeRecord): string {
  if (c.kind === "format") return "Formatting";
  if (c.rule === "end-note") return "Note block";
  if (c.rule.startsWith("header")) return "Header";
  if (c.rule === "ai:suggestion") return "Suggestion paragraph";
  if (c.kind === "delete") return "Paragraph cut";
  if (c.kind === "note") return "Note";
  return "Fix";
}

function Redline({ c }: { c: ChangeRecord }) {
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
  if (c.kind === "format") return <p className="text-sm leading-relaxed">{c.after}</p>;
  if (c.kind === "paragraph") {
    return (
      <p className="redline text-sm leading-relaxed whitespace-pre-line">
        <ins>{clip(c.after, 260)}</ins>
      </p>
    );
  }
  return (
    <p className="redline text-sm leading-relaxed">
      {c.before && <del>{clip(c.before, 140)}</del>}
      {c.before && c.after && " "}
      {c.after && <ins>{clip(c.after.trim(), 200)}</ins>}
    </p>
  );
}

export function ChangesPanel({
  changes,
  otherOpen,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onRestoreRemoved,
  onFocus,
  activeKey,
  undoLabel,
  onUndo,
  undoable,
  onUndoAt,
}: {
  changes: PanelChange[];
  /** Open tracked changes not created by the bot (e.g. Karina's own suggestions). */
  otherOpen: number;
  onAccept: (c: PanelChange) => void;
  onReject: (c: PanelChange) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onRestoreRemoved: (items: PanelChange[]) => void;
  /** Show this change in the document. */
  onFocus: (c: PanelChange) => void;
  /** The change currently highlighted in the document. */
  activeKey: string | null;
  /** The last accept/reject made here that can still be undone. */
  undoLabel: string | null;
  onUndo: () => void;
  /** Cards resolved from this panel in this session that can still be undone. */
  undoable: Map<string, { decision: "accept" | "reject"; index: number; later: number }>;
  onUndoAt: (index: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const cards = useRef(new Map<string, HTMLLIElement>());
  const counts = useMemo(
    () => ({
      all: changes.length,
      fixes: changes.filter((c) => !isNote(c) && c.kind !== "delete").length,
      notes: changes.filter(isNote).length,
      removed: changes.filter(isRemoval).length,
      beyond: changes.filter((c) => c.beyondStyle).length,
    }),
    [changes],
  );
  const shown = changes.filter((c) =>
    filter === "all" ? true : filter === "fixes" ? !isNote(c) && c.kind !== "delete" : filter === "notes" ? isNote(c) : filter === "removed" ? isRemoval(c) : !!c.beyondStyle,
  );
  const open = changes.filter((c) => c.live.length > 0);
  const openRemoved = changes.filter((c) => isRemoval(c) && c.live.length > 0);

  // keep the highlighted card visible when Karina clicks a change in the document
  useEffect(() => {
    if (activeKey) cards.current.get(activeKey)?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  /** Previous/next change in the current filter, starting from the highlighted one. */
  const stops = shown.filter(canLocate);
  const step = (dir: 1 | -1) => {
    if (!stops.length) return;
    const at = stops.findIndex((c) => c.key === activeKey);
    const next = at < 0 ? (dir === 1 ? 0 : stops.length - 1) : (at + dir + stops.length) % stops.length;
    onFocus(stops[next]);
  };
  const position = stops.findIndex((c) => c.key === activeKey);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b px-4 pt-3 pb-3">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm text-muted-foreground">
            {open.length} of {changes.length} bot changes still open{otherOpen > 0 ? `, plus ${otherOpen} of your own` : ""}.
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            {position >= 0 && (
              <span className="mr-1 text-xs tabular-nums text-muted-foreground">
                {position + 1}/{stops.length}
              </span>
            )}
            <Button size="icon-sm" variant="outline" onClick={() => step(-1)} disabled={!stops.length} aria-label="Previous change" title="Previous change">
              <ChevronUp />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => step(1)} disabled={!stops.length} aria-label="Next change" title="Next change">
              <ChevronDown />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter changes">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              disabled={counts[f.id] === 0 && f.id !== "all"}
              className={cn(
                "h-7 rounded-full border px-2.5 text-xs transition-colors disabled:opacity-40",
                filter === f.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
                f.id === "beyond" && filter !== f.id && "beyond",
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onAcceptAll} disabled={open.length === 0}>
            <Check /> Accept all
          </Button>
          <Button size="sm" variant="outline" onClick={onRejectAll} disabled={open.length === 0}>
            <X /> Reject all
          </Button>
          <Button size="sm" variant="outline" onClick={() => onRestoreRemoved(openRemoved)} disabled={openRemoved.length === 0}>
            <RotateCcw /> Restore removed text ({openRemoved.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={onUndo} disabled={!undoLabel} title={undoLabel ? `Undo: ${undoLabel.toLowerCase()}` : "Nothing to undo yet"}>
            <Undo2 /> Undo
          </Button>
        </div>
      </div>

      <ol className="min-h-0 flex-1 divide-y overflow-y-auto">
        {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">No changes in this view.</li>}
        {shown.map((c) => {
          const resolved = c.live.length === 0;
          const active = c.key === activeKey;
          const undo = resolved ? undoable.get(c.key) : undefined;
          return (
            <li
              key={c.key}
              data-change-key={c.key}
              aria-current={active || undefined}
              ref={(el) => {
                if (el) cards.current.set(c.key, el);
                else cards.current.delete(c.key);
              }}
              className={cn(
                "group relative cursor-pointer px-4 py-3 transition-colors hover:bg-secondary/60",
                active && "bg-secondary/80 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary",
              )}
            >
              <button
                type="button"
                onClick={() => onFocus(c)}
                title="Show in the document"
                className={cn("block w-full rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", resolved && "opacity-55")}
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{kindLabel(c)}</span>
                  {c.beyondStyle && <span className="beyond rounded px-1 text-foreground">beyond your usual style</span>}
                  {resolved && <span>{undo ? (undo.decision === "accept" ? "accepted" : "rejected") : "resolved"}</span>}
                </div>
                <Redline c={c} />
                {c.reason && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{c.reason}</p>}
              </button>
              {!resolved && (
                <div className="mt-2 flex gap-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <Button size="xs" variant="secondary" onClick={() => onAccept(c)}>
                    <Check /> Accept
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => onReject(c)}>
                    <X /> {isRemoval(c) ? "Reject (restore text)" : "Reject"}
                  </Button>
                </div>
              )}
              {undo && (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => onUndoAt(undo.index)}
                    title={undo.later ? `Your ${undo.later} later decision${undo.later === 1 ? "" : "s"} will be undone too` : `Bring the change back as it was before you ${undo.decision}ed it`}
                  >
                    <Undo2 /> Undo {undo.decision}
                  </Button>
                  {undo.later > 0 && (
                    <span className="text-xs text-muted-foreground">
                      also undoes {undo.later} later decision{undo.later === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
