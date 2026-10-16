"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Documents", short: "Docs" },
  { href: "/rules", label: "Review rules", short: "Rules" },
  { href: "/costs", label: "AI costs", short: "Costs" },
  { href: "/settings", label: "Settings", short: "Settings" },
];

export function NavLinks() {
  const path = usePathname();
  if (path === "/login" || path === "/setup") return null;
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/jobs") : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-2 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:px-2.5",
              active && "bg-secondary font-medium text-secondary-foreground",
            )}
          >
            <span className="sm:hidden">{l.short}</span>
            <span className="hidden sm:inline">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
