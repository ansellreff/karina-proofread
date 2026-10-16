"use client";

import { FileText, Inbox, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface InboxFile {
  name: string;
  size: number;
  modified: string;
}

/** Files waiting in the OneDrive project folder's Inbox, ready to import (online only). */
export function OneDriveInbox() {
  const router = useRouter();
  const [files, setFiles] = useState<InboxFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    fetch("/api/onedrive/inbox", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { files?: InboxFile[] }) => setFiles(j.files ?? []));

  useEffect(() => {
    fetch("/api/onedrive/inbox", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { files?: InboxFile[] }) => setFiles(j.files ?? []));
  }, []);

  async function importFile(name: string) {
    setBusy(name);
    try {
      const res = await fetch("/api/onedrive/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "The file could not be imported.");
      toast.success(`Imported “${name}”. It moved to Inbox/Imported in OneDrive.`);
      setFiles((f) => f?.filter((x) => x.name !== name) ?? null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!files) return null;
  return (
    <section aria-label="OneDrive Inbox" className="mt-4 rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Inbox className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">OneDrive Inbox</h2>
        <span className="text-sm text-muted-foreground">{files.length ? `${files.length} waiting` : "empty"}</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Check the Inbox again" onClick={() => void load()}>
          <RefreshCw />
        </Button>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 divide-y">
          {files.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.modified ? new Date(f.modified).toLocaleDateString() : ""}</span>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void importFile(f.name)}>
                {busy === f.name && <Loader2 className="animate-spin" />} Import
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
