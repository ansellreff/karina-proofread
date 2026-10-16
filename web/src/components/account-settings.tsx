"use client";

import { KeyRound, Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field, Section } from "@/components/rules/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Settings → Account (online only): change the password, what to do when it's forgotten, sign out. */
export function AccountSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = again.length > 0 && again !== next;

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (next !== again) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) return toast.error(json.error ?? "The password could not be changed.");
      toast.success("Password changed. Your other devices are signed out; this one stays signed in.");
      setOpen(false);
      setCurrent("");
      setNext("");
      setAgain("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Account" hint="Each device stays signed in for 30 days. Sign out on a computer that isn’t yours.">
      {open ? (
        <form onSubmit={change} className="space-y-3">
          <Field label="Current password" htmlFor="pw-current">
            <Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" hint="At least 10 characters. A short sentence is easy to remember and hard to guess." htmlFor="pw-new">
            <Input id="pw-new" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="New password again" htmlFor="pw-again">
            <Input id="pw-again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={mismatch} />
            {mismatch && <p className="mt-1 text-xs text-destructive">The two new passwords are different.</p>}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy || mismatch || next.length < 10 || !current}>
              {busy && <Loader2 className="animate-spin" />} Change password
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <KeyRound /> Change password
          </Button>
          <form method="post" action="/api/auth/logout">
            <Button size="sm" variant="outline" type="submit">
              <LogOut /> Sign out of this device
            </Button>
          </form>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Forgot your password?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            On your computer, in the project’s terminal, run <code className="rounded bg-muted px-1">npx tsx scripts/password-hash.ts</code> and type a new password.
          </li>
          <li>
            In Vercel → your project → Settings → Environment Variables, replace <code className="rounded bg-muted px-1">APP_PASSWORD_HASH</code> with the new value it printed.
          </li>
          <li>Deployments → Redeploy. The new password works at once, and every device is signed out.</li>
        </ol>
        <p className="mt-2 text-muted-foreground">Only someone who can sign in to your Vercel account can do this, and your documents are kept.</p>
      </details>
    </Section>
  );
}
