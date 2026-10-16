import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/store/types";

const STYLE: Record<JobStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-secondary text-secondary-foreground" },
  proofreading: { label: "Proofreading…", className: "bg-[color-mix(in_srgb,var(--mark)_40%,var(--card))] text-[var(--mark-foreground)]" },
  ready: { label: "Ready to review", className: "bg-[color-mix(in_srgb,var(--ins)_16%,var(--card))] text-[var(--ins)]" },
  done: { label: "Done", className: "bg-muted text-muted-foreground" },
};

export function StatusChip({ status, className }: { status: JobStatus; className?: string }) {
  const s = STYLE[status];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", s.className, className)}>{s.label}</span>;
}
