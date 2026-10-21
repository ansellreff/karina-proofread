"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AiUnlockCard, fetchAiStatus, type AiStatus } from "@/components/ai-unlock";
import type { Job } from "@/lib/store/types";

interface Estimate {
  inputTokens: number;
  cachedTokens: number;
  outputTokensLow: number;
  outputTokensHigh: number;
  usdLow: number;
  usdHigh: number;
  remainingUsd: number | null;
  error?: string;
}

const STAGES: Record<string, string> = {
  reading: "Reading the document",
  rules: "Applying your rules: formatting, header, small fixes",
  claude: "AI is reading it the way you would (about a minute)",
  writing: "Writing your tracked changes",
};
const money = (n: number) => `US$${n.toFixed(2)}`;

export function ProofreadDialog({
  job,
  open,
  onOpenChange,
  aiDefault,
  hasApiKey,
  onDone,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  aiDefault: boolean;
  hasApiKey: boolean;
  /** `counted`: its number on the Proofread record when this proofread counted it (#n). */
  onDone: (job: Job, counted: number | null) => void;
}) {
  const [ai, setAi] = useState(aiDefault && hasApiKey);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const running = stage !== null;
  const locked = ai && aiStatus !== null && !aiStatus.unlocked;
  const estimating = open && ai && !!aiStatus?.unlocked && !estimate;

  // is the AI unlocked on this device? (asked each time the dialog opens)
  useEffect(() => {
    if (!open || !hasApiKey) return;
    let cancelled = false;
    fetchAiStatus()
      .then((s) => !cancelled && setAiStatus(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, hasApiKey]);

  useEffect(() => {
    if (!open || !ai || estimate || !aiStatus?.unlocked) return;
    let cancelled = false;
    fetch(`/api/jobs/${job.id}/estimate`, { method: "POST" })
      .then((r) => r.json())
      .then((e: Estimate) => !cancelled && setEstimate(e))
      .catch(() => !cancelled && setEstimate({ error: "Could not get an estimate." } as Estimate));
    return () => {
      cancelled = true;
    };
  }, [open, ai, estimate, job.id, aiStatus]);

  async function run() {
    setError(null);
    setStage("reading");
    try {
      const res = await fetch(`/api/jobs/${job.id}/proofread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai }),
      });
      if (res.status === 403) {
        // the unlock ran out (or the password was changed): ask again
        setStage(null);
        setAiStatus({ hasKey: true, unlocked: false, until: null });
        return;
      }
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Proofreading failed.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as { stage?: string; done?: boolean; job?: Job; error?: string; counted?: number | null };
          if (msg.stage) setStage(msg.stage);
          if (msg.error) throw new Error(msg.error);
          if (msg.done && msg.job) {
            setStage(null);
            onDone(msg.job, msg.counted ?? null);
            onOpenChange(false);
            return;
          }
        }
      }
      throw new Error("The connection closed before proofreading finished.");
    } catch (e) {
      setStage(null);
      setError(e instanceof Error ? e.message : "Proofreading failed.");
    }
  }

  const again = job.versions.some((v) => v.kind === "bot");

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{again ? "Proofread again" : "Proofread this document"}</DialogTitle>
          <DialogDescription>
            The bot works on the student&apos;s original and saves its result as a new version. {again && "Your earlier versions stay in the history."}
          </DialogDescription>
        </DialogHeader>

        {running ? (
          <div className="flex items-center gap-3 rounded-md bg-secondary px-3 py-4 text-sm" aria-live="polite">
            <Loader2 className="size-4 animate-spin text-primary" />
            {STAGES[stage] ?? "Working"}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-3">
              <div>
                <Label htmlFor="ai-switch" className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="size-4 text-primary" /> Use AI for content edits
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasApiKey
                    ? "Adds your kind of notes, fixes and cuts. Off: rules only (formatting, header, note block), free."
                    : "The AI needs an Anthropic API key (online: Vercel → Settings → Environment Variables → ANTHROPIC_API_KEY, then Redeploy). Rules-only proofreading still works."}
                </p>
              </div>
              <Switch id="ai-switch" checked={ai} onCheckedChange={setAi} disabled={!hasApiKey} />
            </div>

            {locked && <AiUnlockCard onUnlocked={setAiStatus} />}

            {ai && !locked && (
              <div className="rounded-md bg-muted px-3 py-3 text-sm">
                {aiStatus === null && <p className="text-muted-foreground">Checking the AI…</p>}
                {estimating && <p className="text-muted-foreground">Counting tokens…</p>}
                {estimate?.error && <p className="text-destructive">{estimate.error}</p>}
                {estimate && !estimate.error && (
                  <>
                    <p>
                      Estimated cost <strong className="tabular-nums">{money(estimate.usdLow)}–{money(estimate.usdHigh)}</strong>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      About {estimate.inputTokens.toLocaleString()} tokens in ({estimate.cachedTokens.toLocaleString()} of them your rulebook, cached) and{" "}
                      {estimate.outputTokensLow.toLocaleString()}–{estimate.outputTokensHigh.toLocaleString()} out.
                      {estimate.remainingUsd !== null && ` Balance left after this: about ${money(estimate.remainingUsd - estimate.usdHigh)}.`}
                    </p>
                  </>
                )}
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={run} disabled={running || locked || (ai && aiStatus === null)}>
            {running ? "Proofreading…" : locked ? "Unlock the AI first" : ai ? "Proofread with AI" : "Proofread with rules"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
