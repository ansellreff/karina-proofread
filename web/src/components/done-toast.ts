import { toast } from "sonner";
import { popDoneCheck } from "./done-pop";

export interface Learned {
  record: string;
  proposals: number;
}

/** "Marked as done" (with the green check popping up), plus what the bot learned from it (Review rules → From your reviews). */
export function toastDone(learned: Learned | undefined, open: () => void, origin: DOMRect | null = null): void {
  popDoneCheck(origin);
  if (!learned) return void toast.success("Marked as done");
  toast.success("Marked as done", {
    description: learned.proposals
      ? `Learned from this review: ${learned.proposals} suggestion${learned.proposals === 1 ? "" : "s"} for your rules.`
      : "The bot learned from this review.",
    action: learned.proposals ? { label: "See", onClick: open } : undefined,
  });
}
