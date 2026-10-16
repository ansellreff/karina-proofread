"use client";

import { Check, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface AiStatus {
  hasKey: boolean;
  unlocked: boolean;
  until: string | null;
}

export const fetchAiStatus = async (): Promise<AiStatus> => (await fetch("/api/ai", { cache: "no-store" })).json();

/**
 * The AI password, asked where the AI is about to be used. One field, show/hide, "remember on this device",
 * a clear message when it's wrong (with the tries left) or when it has to wait.
 */
export function AiUnlockCard({ onUnlocked, autoFocus = true, compact = false, className }: { onUnlocked: (s: AiStatus) => void; autoFocus?: boolean; compact?: boolean; className?: string }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return input.current?.focus();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, remember }) });
      const json = (await res.json()) as { error?: string; until?: string };
      if (!res.ok) {
        setError(json.error ?? "The AI could not be unlocked.");
        setPassword("");
        input.current?.focus();
        return;
      }
      setDone(true);
      setTimeout(() => onUnlocked({ hasKey: true, unlocked: true, until: json.until ?? null }), 450);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={unlock} className={cn("rounded-lg border bg-card p-4", className)} aria-label="Unlock the AI">
      {!compact && (
        <div className="mb-3 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {done ? <Check className="size-4.5" /> : <LockKeyhole className="size-4.5" />}
          </span>
          <div>
            <p className="font-medium">{done ? "AI unlocked" : "The AI is locked"}</p>
            <p className="text-sm text-muted-foreground">{done ? "You can proofread with AI now." : "Enter the AI password to use it. Rules-only proofreading works without it."}</p>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="ai-password" className="sr-only">
            AI password
          </label>
          <input
            ref={input}
            id="ai-password"
            type={show ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder="AI password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            disabled={busy || done}
            aria-invalid={!!error}
            aria-describedby={error ? "ai-password-error" : undefined}
            className="h-10 w-full rounded-lg border border-input bg-background pr-10 pl-3 text-base tracking-wider outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive sm:text-sm"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide the password" : "Show the password"}
            aria-pressed={show}
            className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button type="submit" className="h-10" disabled={busy || done}>
          {busy ? <Loader2 className="animate-spin" /> : done ? <Check /> : <LockKeyhole />} {done ? "Unlocked" : "Unlock"}
        </Button>
      </div>
      <p id="ai-password-error" role="alert" aria-live="polite" className="mt-2 min-h-5 text-sm text-destructive">
        {error}
      </p>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-primary" disabled={busy || done} />
        Remember on this device for 30 days
      </label>
    </form>
  );
}

/** Settings → AI password: whether this device can use the AI, unlock or lock it, and where the password is set. */
export function AiLockSection() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAiStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  async function lock() {
    setBusy(true);
    try {
      await fetch("/api/ai", { method: "DELETE" });
      setStatus((s) => (s ? { ...s, unlocked: false, until: null } : s));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="ai-lock-title">
      <div>
        <h2 id="ai-lock-title" className="text-lg font-semibold">
          AI password
        </h2>
        <p className="mt-0.5 max-w-[65ch] text-sm text-muted-foreground">
          Proofreading with AI uses your Anthropic credit, so it asks for this password first. Everything else in the app works without it.
        </p>
      </div>
      {!status ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : !status.hasKey ? (
        <p className="text-sm">No Anthropic API key is set. Online: Vercel → Settings → Environment Variables → ANTHROPIC_API_KEY, then Redeploy.</p>
      ) : status.unlocked ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="size-4" />
            </span>
            AI unlocked on this device{status.until ? ` until ${new Date(status.until).toLocaleDateString(undefined, { day: "numeric", month: "long" })}` : ""}.
          </span>
          <Button size="sm" variant="outline" onClick={lock} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Lock AI on this device
          </Button>
        </div>
      ) : (
        <AiUnlockCard autoFocus={false} onUnlocked={setStatus} className="max-w-md" />
      )}
      <p className="text-xs text-muted-foreground">
        To change the password, edit <code className="rounded bg-muted px-1">web/src/lib/ai/ai-password.ts</code>, then run <code className="rounded bg-muted px-1">push.bat</code>. Every device then
        needs the new one.
      </p>
    </section>
  );
}

/** The same card in a dialog, for buttons that use the AI outside the Proofread dialog (Re-check selection). */
export function AiUnlockDialog({ open, onOpenChange, onUnlocked }: { open: boolean; onOpenChange: (o: boolean) => void; onUnlocked: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="size-4.5 text-primary" /> Unlock the AI
          </DialogTitle>
          <DialogDescription>Re-checking a passage uses the AI. Enter the AI password to continue.</DialogDescription>
        </DialogHeader>
        <AiUnlockCard
          compact
          className="border-0 p-0"
          onUnlocked={() => {
            onOpenChange(false);
            onUnlocked();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
