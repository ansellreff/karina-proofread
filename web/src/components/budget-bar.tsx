import type { BudgetState } from "@/lib/ai/budget";
import { cn } from "@/lib/utils";

/** This month's spend against the budget, with the pace for the whole month. */
export function BudgetBar({ budget: b, money }: { budget: BudgetState; money: (n: number) => string }) {
  if (b.budgetUsd === null) return null;
  const pct = Math.min(100, b.percent ?? 0);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="text-muted-foreground">
          Monthly budget: <span className="text-foreground tabular-nums">{money(b.monthUsd)}</span> of {money(b.budgetUsd)}
        </span>
        <span className={cn("tabular-nums", b.over ? "text-destructive" : b.near ? "text-mark-foreground" : "text-muted-foreground")}>
          {b.over ? (b.stopped ? "used up: AI paused" : "over budget") : `${Math.round(b.percent ?? 0)}% used`}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Monthly AI budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", b.over ? "bg-destructive" : b.near ? "bg-star" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {b.projectedUsd !== null && !b.over && (
        <p className="mt-1 text-xs text-muted-foreground">
          At this month’s pace you’ll spend about {money(b.projectedUsd)}
          {b.projectedUsd > b.budgetUsd ? ", more than the budget." : "."}
        </p>
      )}
    </div>
  );
}
