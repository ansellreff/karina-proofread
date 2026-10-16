"use client";

import { Tip } from "@/components/tip";
import type { MonthCost } from "@/lib/costs";
import { cn } from "@/lib/utils";

const money = (n: number) => `US$${n.toFixed(2)}`;
const monthName = (m: string, long = false) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" });

/** AI spend per month: one series (no legend), thin bars on a quiet baseline, value on hover and for the current month. */
export function CostChart({ months }: { months: MonthCost[] }) {
  const max = Math.max(...months.map((m) => m.usd), 0.01);
  const current = months[months.length - 1].month;
  return (
    <figure className="space-y-2">
      <div className="flex h-40 items-end gap-1.5 border-b border-border sm:gap-2.5" role="img" aria-label="AI spend per month, last 12 months (the table below lists the numbers)">
        {months.map((m) => {
          const h = m.usd ? Math.max(3, (m.usd / max) * 100) : 0;
          return (
            <Tip key={m.month} side="top" label={`${monthName(m.month, true)}: ${money(m.usd)}, ${m.runs} AI run${m.runs === 1 ? "" : "s"}`}>
              <div tabIndex={0} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                {m.month === current && m.usd > 0 && <span className="mb-1 self-end text-xs whitespace-nowrap text-muted-foreground tabular-nums">{money(m.usd)}</span>}
                <div
                  className={cn("w-full rounded-t-[4px] transition-opacity group-hover:opacity-80", m.month === current ? "bg-primary" : "bg-primary/55")}
                  style={{ height: `${h}%` }}
                />
              </div>
            </Tip>
          );
        })}
      </div>
      <div className="flex gap-1.5 sm:gap-2.5" aria-hidden>
        {months.map((m) => (
          <span key={m.month} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {monthName(m.month)}
          </span>
        ))}
      </div>
    </figure>
  );
}
