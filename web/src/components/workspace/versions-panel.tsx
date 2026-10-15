"use client";

import { History, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Version } from "@/lib/store/types";

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function VersionsPanel({
  versions,
  current,
  shown,
  onOpen,
  onRestore,
}: {
  versions: Version[];
  current: number;
  shown: number;
  onOpen: (n: number) => void;
  onRestore: (n: number) => void;
}) {
  const [confirm, setConfirm] = useState<Version | null>(null);
  const ordered = [...versions].reverse();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Every version is kept. Restoring makes a new version, so nothing is lost and you can always go back.
        </p>
        <Button size="sm" variant="outline" onClick={() => setConfirm(versions[0])} disabled={versions.length < 2}>
          <RotateCcw /> Restore the original document
        </Button>
      </div>
      <ol className="min-h-0 flex-1 divide-y overflow-y-auto">
        {ordered.map((v) => (
          <li key={v.n} className={cn("flex items-start gap-3 px-4 py-3", v.n === shown && "bg-secondary/60")}>
            <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {v.label}
                {v.n === current && <span className="ml-2 text-xs font-normal text-muted-foreground">latest</span>}
              </p>
              <p className="text-xs text-muted-foreground">{time(v.createdAt)}</p>
              <div className="mt-2 flex gap-2">
                {v.n !== shown && (
                  <Button size="xs" variant="secondary" onClick={() => onOpen(v.n)}>
                    Open
                  </Button>
                )}
                {v.n !== current && (
                  <Button size="xs" variant="ghost" onClick={() => setConfirm(v)}>
                    Restore this version
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.n === 0 ? "Restore the original document?" : `Restore “${confirm?.label}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.n === 0
                ? "The student's file comes back exactly as received, without any bot changes. Your current version stays in the history."
                : "This version becomes the latest one. Your current version stays in the history."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) onRestore(confirm.n);
                setConfirm(null);
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
