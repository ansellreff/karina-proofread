"use client";

import { ChevronRight, CloudUpload, Folder, FolderCheck, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/rules/bits";
import { Button } from "@/components/ui/button";

interface Listing {
  folder: { id: string; name: string; path: string; parentId: string | null };
  folders: { id: string; name: string; children: number }[];
}

/** Browse her OneDrive and choose the project folder (she creates it herself first). */
export function FolderPicker({ onChosen }: { onChosen?: () => void }) {
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (parent: string | null) => {
    setError(null);
    const res = await fetch(`/api/onedrive/folders${parent ? `?parent=${encodeURIComponent(parent)}` : ""}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "OneDrive could not be read.");
    setListing(json);
  }, []);

  useEffect(() => {
    fetch("/api/onedrive/folders", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, json: await r.json() }))
      .then(({ ok, json }) => (ok ? setListing(json) : setError(json.error ?? "OneDrive could not be read.")));
  }, []);

  async function choose() {
    if (!listing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/onedrive/folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: listing.folder.id }) });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "The folder could not be set up.");
      toast.success(`Using “${json.folder.name}”. Inbox, Done and App data are ready inside it.`);
      onChosen?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!listing) return <p className="text-sm text-muted-foreground">Opening your OneDrive…</p>;
  const atTop = !listing.folder.parentId && !listing.folder.path;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">In</span>
        <span className="font-medium break-all">{atTop ? "OneDrive" : `OneDrive/${listing.folder.path}`}</span>
        {!atTop && (
          <Button size="sm" variant="ghost" onClick={() => void open(listing.folder.parentId)}>
            Up one level
          </Button>
        )}
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border bg-card">
        {listing.folders.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => void open(f.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none">
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
        {listing.folders.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No folders here.</li>}
      </ul>
      <Button onClick={choose} disabled={busy || atTop}>
        {busy ? <Loader2 className="animate-spin" /> : <FolderCheck />} Use “{atTop ? "…" : listing.folder.name}” as the project folder
      </Button>
      {atTop && <p className="text-xs text-muted-foreground">Open the folder you made for this project, then choose it.</p>}
    </div>
  );
}

interface Status {
  mode: "local" | "onedrive";
  account?: { email: string; name: string };
  folder?: { id: string; name: string } | null;
  localData?: boolean;
}

/** Settings → OneDrive: account, project folder, copying this computer's data, sign out. */
export function OneDriveSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [changing, setChanging] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    fetch("/api/onedrive/folder", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus);
  }, []);

  async function copy() {
    setCopying(true);
    try {
      const res = await fetch("/api/onedrive/migrate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "Copying failed.");
      toast.success(`Copied ${json.copied} of ${json.files} files to OneDrive${json.skipped ? ` (${json.skipped} were there already)` : ""}.`, { duration: 10000 });
    } finally {
      setCopying(false);
    }
  }

  if (!status) return null;
  if (status.mode === "local") {
    return (
      <Section title="OneDrive" hint="This copy of the app runs on this computer only: documents are kept in web/.data. Online, you sign in with Microsoft and everything is kept in your OneDrive.">
        <></>
      </Section>
    );
  }
  return (
    <Section title="OneDrive" hint="Your documents, rules and learning data are kept in your OneDrive project folder.">
      <p className="text-sm">
        Signed in as <span className="font-medium">{status.account?.name}</span> <span className="text-muted-foreground">({status.account?.email})</span>
      </p>
      <p className="text-sm">
        Project folder: <span className="font-medium">{status.folder?.name ?? "not chosen yet"}</span>
        <span className="text-muted-foreground"> with Inbox (new files), Done (finished files) and App data (the app’s own files).</span>
      </p>
      {changing ? (
        <FolderPicker onChosen={() => window.location.reload()} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setChanging(true)}>
            <Folder /> Change the project folder
          </Button>
          {status.localData && status.folder && (
            <Button size="sm" variant="outline" onClick={copy} disabled={copying}>
              {copying ? <Loader2 className="animate-spin" /> : <CloudUpload />} Copy this computer’s data to OneDrive
            </Button>
          )}
          <form method="post" action="/api/auth/logout">
            <Button size="sm" variant="ghost" type="submit">
              <LogOut /> Sign out
            </Button>
          </form>
        </div>
      )}
      {status.localData && status.folder && !changing && (
        <p className="text-xs text-muted-foreground">
          Copies your documents (all versions), Recently deleted, settings, AI usage, rules, AI rulebook and learning data. Files already in OneDrive are not replaced, and the copy on this computer stays as a backup.
        </p>
      )}
    </Section>
  );
}
