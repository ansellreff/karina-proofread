"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { usePreference } from "@/components/use-preference";
import { CURRENT_VERSION } from "@/lib/update-log";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Documents", short: "Docs" },
  { href: "/rules", label: "Review rules", short: "Rules" },
  { href: "/costs", label: "AI costs", short: "Costs" },
  { href: "/settings", label: "Settings", short: "Settings" },
  { href: "/updates", label: "Update log", short: "Updates" },
];

export function NavLinks() {
  const path = usePathname();
  // a dot on Update log while there is a version this browser hasn't read about (after mount: no storage on the server)
  const [seen] = usePreference<string | null>("seen-version", null);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const unread = mounted && seen !== CURRENT_VERSION && !path.startsWith("/updates");
  return (
    <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm sm:gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/jobs") : path.startsWith(l.href);
        const dot = l.href === "/updates" && unread;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-label={dot ? `${l.label} (new version)` : undefined}
            className={cn(
              "relative rounded-md px-1.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:px-2.5",
              active && "bg-secondary font-medium text-secondary-foreground",
            )}
          >
            <span className="sm:hidden">{l.short}</span>
            <span className="hidden sm:inline">{l.label}</span>
            {dot && <span data-new-dot aria-hidden className="absolute top-1 right-0.5 size-2 rounded-full bg-del ring-2 ring-background" />}
          </Link>
        );
      })}
    </nav>
  );
}
