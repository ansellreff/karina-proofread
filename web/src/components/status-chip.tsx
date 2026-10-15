import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/store/types";

const STYLE: Record<JobStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-secondary text-secondary-foreground" },
  proofreading: { label: "Proofreading…", className: "bg-[color-mix(in_srgb,var(--mark)_45%,white)] text-[#5c4a00]" },
  ready: { label: "Ready to review", className: "bg-[color-mix(in_srgb,var(--ins)_14%,white)] text-[var(--ins)]" },
  done: { label: "Done", className: "bg-muted text-muted-foreground" },
};

export function StatusChip({ status, className }: { status: JobStatus; className?: string }) {
  const s = STYLE[status];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", s.className, className)}>{s.label}</span>;
}
