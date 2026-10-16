import { toast } from "sonner";

export interface Learned {
  record: string;
  proposals: number;
}

/** "Marked as done", plus what the bot learned from it (Review rules → From your reviews). */
export function toastDone(learned: Learned | undefined, open: () => void): void {
  if (!learned) return void toast.success("Marked as done");
  toast.success("Marked as done", {
    description: learned.proposals
      ? `Learned from this review: ${learned.proposals} suggestion${learned.proposals === 1 ? "" : "s"} for your rules.`
      : "The bot learned from this review.",
    action: learned.proposals ? { label: "See", onClick: open } : undefined,
  });
}
