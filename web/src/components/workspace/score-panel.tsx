"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { DocScore, ScoreCategory, ScoreItem } from "@/lib/score/score";
import { cn } from "@/lib/utils";

export interface Scores {
  current: DocScore;
  original: DocScore;
  potential: DocScore;
}

const delta = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Color band for a score: needs work / fair / good. */
export function scoreTone(total: number) {
  return total >= 85 ? "text-ins" : total >= 70 ? "text-foreground" : "text-del";
}

function Category({ c, before, onShow }: { c: ScoreCategory; before?: ScoreCategory; onShow: (i: ScoreItem) => void }) {
  const [all, setAll] = useState(false);
  const pct = Math.round((c.score / c.max) * 100);
  const shown = all ? c.items : c.items.slice(0, 5);
  const gained = before ? Math.round(c.score - before.score) : 0;
  return (
    <section className="space-y-2 border-t px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-sans text-sm font-medium">{c.label}</h3>
        <p className="text-sm tabular-nums">
          {Math.round(c.score)}
          <span className="text-muted-foreground">/{c.max}</span>
          {gained !== 0 && <span className={cn("ml-1.5 text-xs", gained > 0 ? "text-ins" : "text-del")}>{delta(gained)}</span>}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.label}: ${Math.round(c.score)} of ${c.max}`}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {c.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing to improve here.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((i, n) => (
            <li key={n}>
              {i.find ? (
                <button type="button" onClick={() => onShow(i)} className="w-full rounded-sm text-left text-xs leading-snug text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" title="Show in the document">
                  {i.message}
                </button>
              ) : (
                <p className="text-xs leading-snug text-muted-foreground">{i.message}</p>
              )}
            </li>
          ))}
          {c.items.length > 5 && (
            <li>
              <button type="button" onClick={() => setAll(!all)} className="text-xs text-primary hover:underline">
                {all ? "Show fewer" : `Show all ${c.items.length}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export function ScorePanel({ scores, busy, onShow }: { scores: Scores | null; busy: boolean; onShow: (i: ScoreItem) => void }) {
  if (!scores) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Scoring the document…" : "The score appears after the document is proofread."}
      </div>
    );
  }
  const { current, original, potential } = scores;
  const gain = current.total - original.total;
  return (
    <div className="h-full min-h-0 overflow-y-auto pb-6">
      <div className="space-y-2 px-4 pt-4 pb-3">
        <div className="flex items-end gap-2">
          <p className={cn("font-serif text-5xl leading-none tabular-nums", scoreTone(current.total))} data-testid="score-now">
            {current.total}
          </p>
          <p className="pb-1 text-sm text-muted-foreground">/ 100 now</p>
          {busy && <Loader2 className="mb-1.5 ml-auto size-4 animate-spin text-muted-foreground" aria-label="Updating the score" />}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-muted/60 px-2.5 py-1.5">
            <dt className="text-xs text-muted-foreground">Original</dt>
            <dd className="tabular-nums">
              {original.total} {gain !== 0 && <span className={cn("text-xs", gain > 0 ? "text-ins" : "text-del")}>{delta(gain)} so far</span>}
            </dd>
          </div>
          <div className="rounded-md bg-muted/60 px-2.5 py-1.5">
            <dt className="text-xs text-muted-foreground">All suggestions accepted</dt>
            <dd className="tabular-nums">{potential.total}</dd>
          </div>
        </dl>
        <p className="text-xs leading-snug text-muted-foreground">
          Goes up as you accept fixes and edit. Your notes to the student don’t count: they are instructions, so the score rises when the student acts on them. Click an item to see it in the document.
        </p>
      </div>
      {current.categories.map((c) => (
        <Category key={c.id} c={c} before={original.categories.find((o) => o.id === c.id)} onShow={onShow} />
      ))}
    </div>
  );
}
