"use client";

import { ArchiveRestore, Download, FileArchive, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { BackupManifest, RestoreResult } from "@/lib/backup";
import { cn } from "@/lib/utils";

interface Storage {
  mode: "local" | "online";
  bytes: number;
  documentsBytes: number;
  trashBytes: number;
  documents: number;
  trash: number;
}

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Read a backup's manifest in the browser, to show what is in it before anything is restored. */
async function peek(file: File): Promise<BackupManifest> {
  const { default: JSZip } = await import("jszip");
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("This file isn't a Karina Proofread backup (it should be the .zip from Download backup).");
  }
  const text = await zip.file("manifest.json")?.async("string");
  const m = text ? (JSON.parse(text) as BackupManifest) : null;
  if (!m || m.format !== "karina-proofread-backup") throw new Error("This file isn't a Karina Proofread backup (it should be the .zip from Download backup).");
  return m;
}

/** Settings → Backup and storage: what is stored, download a backup, restore one by dropping it here, free up space. */
export function BackupSection() {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [dragging, setDragging] = useState(false);
  const [picked, setPicked] = useState<{ file: File; manifest: BackupManifest } | null>(null);
  const [withSettings, setWithSettings] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [clearing, setClearing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch("/api/storage", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Storage) => setStorage(s))
      .catch(() => {});
  useEffect(() => {
    void load();
  }, []);

  async function choose(file: File | undefined) {
    setProblem(null);
    if (!file) return;
    try {
      setPicked({ file, manifest: await peek(file) });
      setWithSettings(false);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "This file couldn't be read.");
    }
  }

  async function restore() {
    if (!picked) return;
    setRestoring(true);
    try {
      const form = new FormData();
      form.append("file", picked.file);
      if (withSettings) form.append("settings", "1");
      const res = await fetch("/api/backup", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as RestoreResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Restoring failed.");
      const parts = [
        body.documentsAdded ? `${plural(body.documentsAdded, "document")} added` : "No documents added",
        body.documentsSkipped ? `${body.documentsSkipped} already here, left as they are` : "",
        body.learningAdded ? `${plural(body.learningAdded, "learned review")} added` : "",
        body.recordAdded ? `${body.recordAdded} Proofread record ${body.recordAdded === 1 ? "entry" : "entries"} added` : "",
        body.settingsRestored ? "rules, rulebook and settings put back" : "",
      ].filter(Boolean);
      toast.success(`Backup restored: ${parts.join("; ")}.`, { duration: 8000 });
      setPicked(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restoring failed.");
    } finally {
      setRestoring(false);
    }
  }

  async function clearAll() {
    setClearing(true);
    try {
      const res = await fetch("/api/storage", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
      if (!res.ok) throw new Error();
      const { deleted } = (await res.json()) as { deleted: number };
      toast.success(`${plural(deleted, "document")} deleted forever. Your rules, learning and settings are kept.`);
      setClearOpen(false);
      setTyped("");
      void load();
    } catch {
      toast.error("Could not delete the documents.");
    } finally {
      setClearing(false);
    }
  }

  const m = picked?.manifest;
  return (
    <section className="space-y-5 rounded-lg border bg-card p-5" aria-labelledby="backup-title">
      <div>
        <h2 id="backup-title" className="text-lg font-semibold">
          Backup and storage
        </h2>
        <p className="text-sm text-muted-foreground">Keep a copy of everything on your computer, and put it back whenever you need it.</p>
      </div>

      <div className="rounded-md border bg-background px-3 py-2.5 text-sm" data-storage>
        {storage ? (
          <>
            <p>
              <span className="font-medium tabular-nums">{size(storage.bytes)}</span> stored {storage.mode === "online" ? "online" : "on this computer"}:{" "}
              {plural(storage.documents, "document")} ({size(storage.documentsBytes)}), {storage.trash} in Recently deleted ({size(storage.trashBytes)}).
            </p>
            {storage.mode === "online" && <p className="mt-0.5 text-xs text-muted-foreground">The free database plan holds about 0.5 GB. Rules, learning and settings take very little space.</p>}
          </>
        ) : (
          <p className="text-muted-foreground">Measuring…</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. Download a backup</p>
        <p className="text-xs text-muted-foreground">
          One .zip file with every document (all versions), your review rules and rulebook, what the bot learned, your settings and the AI cost history. It
          contains students’ documents: keep it somewhere private. Recently deleted documents are not included.
        </p>
        <a href="/api/backup" download className={buttonVariants({ variant: "outline" })}>
          <Download /> Download backup
        </a>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">2. Restore a backup</p>
        <div
          role="button"
          tabIndex={0}
          aria-label="Restore a backup: drop the backup file here, or click to choose it"
          data-restore-drop
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void choose(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            dragging ? "border-primary bg-secondary" : "hover:border-foreground/30 hover:bg-secondary/40",
          )}
        >
          <Upload className="size-5 text-muted-foreground" />
          <p className="text-sm">
            <span className="font-medium">Drop the backup file here</span> or click to choose it
          </p>
          <p className="text-xs text-muted-foreground">You see what is in it before anything changes. Nothing already in the app is overwritten.</p>
        </div>
        <input ref={input} type="file" accept=".zip,application/zip" className="hidden" data-restore-input onChange={(e) => void choose(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium">Free up space</p>
        <p className="text-xs text-muted-foreground">Delete every document and empty Recently deleted. Your rules, rulebook, what the bot learned and your settings stay. Download a backup first.</p>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setClearOpen(true)} disabled={!storage || storage.documents + storage.trash === 0}>
          <Trash2 /> Delete all documents…
        </Button>
      </div>

      {/* what is in the dropped backup, and how to put it back */}
      <Dialog open={!!picked} onOpenChange={(o) => !o && !restoring && setPicked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileArchive className="size-5" /> Restore this backup?
            </DialogTitle>
            <DialogDescription>
              {m && (
                <>
                  Made {new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}{" "}
                  {m.from === "online" ? "online" : "on a computer"}: {plural(m.counts.documents, "document")}, {plural(m.counts.learning, "learned review")}, {size(m.counts.bytes)}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Documents that aren’t in the app are added back with all their versions. Documents already here (or in Recently deleted) are left as they are.</p>
            <label className="flex items-start gap-3 rounded-md border p-3">
              <Switch checked={withSettings} onCheckedChange={setWithSettings} aria-label="Also put back rules, rulebook and settings" className="mt-0.5" />
              <span>
                <span className="font-medium">Also put back the review rules, rulebook and settings</span>
                <span className="block text-xs text-muted-foreground">They replace the current ones. Leave this off if you changed your rules since this backup.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicked(null)} disabled={restoring}>
              Cancel
            </Button>
            <Button onClick={() => void restore()} disabled={restoring}>
              {restoring ? <Loader2 className="animate-spin" /> : <ArchiveRestore />} {restoring ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearOpen} onOpenChange={(o) => !clearing && (setClearOpen(o), setTyped(""))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all {storage ? plural(storage.documents + storage.trash, "document") : "documents"} forever?</AlertDialogTitle>
            <AlertDialogDescription>
              Every document, with all its versions, and everything in Recently deleted is removed for good. Only a backup can bring them back. Your rules, rulebook,
              learning and settings stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <a href="/api/backup" download className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download /> Download a backup first
            </a>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Type DELETE to confirm</span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Type DELETE to confirm" className="max-w-40" />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={typed !== "DELETE" || clearing} onClick={() => void clearAll()}>
              {clearing ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete all forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
