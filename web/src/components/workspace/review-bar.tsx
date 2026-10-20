"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, MessageSquareText, Paintbrush, X } from "lucide-react";
import { Tip } from "@/components/tip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Mode } from "./doc-editor";

export type FormatMarks = "hidden" | "shown";

/**
 * Word-style Review bar above the document: step through the open changes in document order, accept or reject the
 * highlighted one, switch tracking of Karina's own edits, and show or hide the formatting marks.
 */
export function ReviewBar({
  position,
  total,
  current,
  onStep,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  mode,
  onTracking,
  formatMarks,
  onFormatMarks,
  formatCount,
  balloons,
  onBalloons,
  balloonsBusy,
}: {
  /** Index of the highlighted change among the open ones (-1: none highlighted). */
  position: number;
  total: number;
  /** A short description of the highlighted change, e.g. "Fix: my self → myself". */
  current: string | null;
  onStep: (dir: 1 | -1) => void;
  onAccept: () => void;
  onReject: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  mode: Mode;
  onTracking: (on: boolean) => void;
  formatMarks: FormatMarks;
  onFormatMarks: (m: FormatMarks) => void;
  /** Open formatting changes (the marks the switch hides). */
  formatCount: number;
  /** Word-style balloons beside the page; off: a change's balloon opens when it is clicked. */
  balloons: boolean;
  onBalloons: () => void;
  balloonsBusy: boolean;
}) {
  const editable = mode !== "viewing";
  const active = position >= 0;
  return (
    <div role="toolbar" aria-label="Review" data-review-bar className="no-print relative z-30 hidden shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-card px-2 py-1.5 md:flex">
      <div className="flex min-w-0 items-center gap-1">
        <Tip label="Previous change" keys="K">
          <Button size="icon-sm" variant="ghost" onClick={() => onStep(-1)} disabled={!total} aria-label="Previous change">
            <ChevronLeft />
          </Button>
        </Tip>
        <p className="min-w-0 px-1 text-sm" aria-live="polite">
          {total === 0 ? (
            <span className="text-muted-foreground">No open changes</span>
          ) : active ? (
            <>
              <span className="font-medium tabular-nums">
                Change {position + 1} of {total}
              </span>
              {current && <span className="hidden truncate text-muted-foreground xl:inline"> · {current}</span>}
            </>
          ) : (
            <span className="tabular-nums">
              {total} open change{total === 1 ? "" : "s"} <span className="text-muted-foreground">· press Next to start</span>
            </span>
          )}
        </p>
        <Tip label="Next change" keys="J">
          <Button size="icon-sm" variant="ghost" onClick={() => onStep(1)} disabled={!total} aria-label="Next change">
            <ChevronRight />
          </Button>
        </Tip>
      </div>

      <div className="flex items-center gap-1">
        <Tip label="Accept this change, then go to the next" keys="A">
          <Button size="sm" variant="secondary" onClick={onAccept} disabled={!active || !editable}>
            <Check /> Accept
          </Button>
        </Tip>
        <Tip label="Reject this change, then go to the next" keys="R">
          <Button size="sm" variant="outline" onClick={onReject} disabled={!active || !editable}>
            <X /> Reject
          </Button>
        </Tip>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More: accept or reject all" disabled={!total || !editable} />}>
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={onAcceptAll}>
              <Check /> Accept all changes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRejectAll}>
              <X /> Reject all changes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <label className={cn("flex items-center gap-2 text-sm", !editable && "text-muted-foreground")} title={editable ? "On: your edits are tracked as suggestions (Suggesting). Off: you edit directly (Editing)." : "Choose Suggesting or Editing to change the document"}>
          <Switch size="sm" checked={mode === "suggesting"} disabled={!editable} onCheckedChange={(on) => onTracking(on)} aria-label="Track my edits" />
          Track my edits
        </label>
        <Tip label={balloons ? "Hide the balloons beside the page (a change's balloon then opens when you click it)" : "Show every change and comment in a balloon beside the page, as in Word"}>
          <Button size="sm" variant={balloons ? "secondary" : "ghost"} aria-pressed={balloons} aria-label="Balloons" onClick={onBalloons} disabled={balloonsBusy}>
            {balloonsBusy ? <Loader2 className="animate-spin" /> : <MessageSquareText />} <span className="hidden lg:inline">Balloons</span>
          </Button>
        </Tip>
        <Tip label={formatMarks === "hidden" ? "Show the marks of formatting changes (font, size, spacing)" : "Hide the marks of formatting changes, so wording changes stand out"}>
          <Button
            size="sm"
            variant={formatMarks === "shown" ? "secondary" : "ghost"}
            aria-pressed={formatMarks === "shown"}
            aria-label="Formatting marks"
            onClick={() => onFormatMarks(formatMarks === "shown" ? "hidden" : "shown")}
            disabled={formatCount === 0 && formatMarks === "hidden"}
          >
            <Paintbrush /> <span className="hidden lg:inline">Formatting marks</span>
            {formatCount > 0 && <span className="tabular-nums text-muted-foreground">{formatCount}</span>}
          </Button>
        </Tip>
      </div>
    </div>
  );
}
