"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A tooltip with an optional keyboard shortcut, e.g. <Tip label="Save" keys="Ctrl S"><Button/></Tip>. */
export function Tip({ label, keys, side = "bottom", children }: { label: string; keys?: string; side?: "top" | "bottom" | "left" | "right"; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>
        {label}
        {keys && (
          <kbd data-slot="kbd" className="rounded border border-background/30 px-1 font-sans text-[10px] leading-4 opacity-80">
            {keys}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
