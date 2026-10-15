"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function UploadZone({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    const form = new FormData();
    for (const f of list) form.append("files", f);
    try {
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const body = (await res.json()) as { created?: { id: string; fileName: string }[]; errors?: string[]; error?: string };
      for (const e of body.errors ?? []) toast.error(e);
      if (body.error) toast.error(body.error);
      const created = body.created ?? [];
      if (created.length === 1) router.push(`/jobs/${created[0].id}`);
      else {
        if (created.length) toast.success(`Added ${created.length} documents`);
        router.refresh();
      }
    } catch {
      toast.error("Upload failed. Check that the app is running and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload(e.dataTransfer.files);
      }}
      className={cn(
        "flex items-center gap-4 rounded-lg border border-dashed bg-card transition-colors",
        compact ? "px-4 py-3" : "px-5 py-6",
        over ? "border-primary bg-secondary" : "border-input",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{busy ? "Adding…" : "Drop student documents here"}</p>
        <p className="text-sm text-muted-foreground">Word files (.docx). They stay on this computer until you export them.</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-60"
      >
        Choose files
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
    </div>
  );
}
