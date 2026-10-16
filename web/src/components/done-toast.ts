import { toast } from "sonner";

export interface Learned {
  record: string;
  proposals: number;
}

/** "Marked as done", plus where the file went (online) and what the bot learned (Review rules → From your reviews). */
export function toastDone(learned: Learned | undefined, open: () => void, savedTo?: string): void {
  const lines = [
    savedTo ? `Saved to OneDrive: ${savedTo}.` : null,
    learned ? (learned.proposals ? `Learned from this review: ${learned.proposals} suggestion${learned.proposals === 1 ? "" : "s"} for your rules.` : "The bot learned from this review.") : null,
  ].filter(Boolean);
  toast.success("Marked as done", {
    description: lines.length ? lines.join(" ") : undefined,
    action: learned?.proposals ? { label: "See", onClick: open } : undefined,
  });
}
