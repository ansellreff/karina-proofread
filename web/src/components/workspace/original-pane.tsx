"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const DocEditor = dynamic(() => import("./doc-editor"), { ssr: false });

/** The student's file exactly as received (version 0), read-only: no toolbar, no editing, no bot changes. */
export function OriginalPane({ jobId, fileName, userName, reflow, onReady }: { jobId: string; fileName: string; userName: string; reflow: boolean; onReady?: (superdoc: unknown) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}/file?v=0`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("The original file could not be loaded.");
        return r.blob();
      })
      .then((b) => !cancelled && setFile(new File([b], fileName, { type: b.type })))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [jobId, fileName]);

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  if (!file)
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Opening the original…
      </div>
    );
  return <DocEditor key={reflow ? "web" : "print"} file={file} mode="viewing" userName={userName} toolbar={false} reflow={reflow} onReady={(s) => onReady?.(s)} />;
}
