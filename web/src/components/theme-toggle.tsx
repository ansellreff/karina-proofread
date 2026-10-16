"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setPaper, usePaper } from "./theme-provider";

export const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "Same as this computer", icon: Monitor },
] as const;

/** True after hydration (the theme is only known in the browser). */
const useMounted = () => useSyncExternalStore(() => () => {}, () => true, () => false);

/** Header button: light, dark or follow the computer; plus the paper colour for dark mode. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const paper = usePaper();
  const mounted = useMounted();
  const Icon = mounted && resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Appearance: light or dark" title="Appearance" />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          {THEMES.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => setTheme(t.id)}>
              <t.icon /> {t.label} {mounted && theme === t.id && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Document paper in dark mode</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setPaper("white")}>
            White paper (as printed) {mounted && paper === "white" && <Check className="ml-auto" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPaper("dark")}>
            Dark paper (easier at night) {mounted && paper === "dark" && <Check className="ml-auto" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
