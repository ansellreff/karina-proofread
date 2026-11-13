"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCost, type BudgetState, type CostSettings } from "@/lib/ai/budget";
import { cn } from "@/lib/utils";
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
  budget?: BudgetState;
  cost?: CostSettings;
  error?: string;
}

const STAGES: Record<string, string> = {
  reading: "Reading the document",
  rules: "Applying your rules: formatting, header, small fixes",
  claude: "AI is reading it the way you would (about a minute)",
  writing: "Writing your tracked changes",
};

/** A cost notice: what the AI cost settings want her to know before this run. */
function Notice({ tone, children }: { tone: "warn" | "stop"; children: React.ReactNode }) {
  return (
    <div role={tone === "stop" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", tone === "stop" ? "border-destructive/40 bg-destructive/10" : "border-star/40 bg-star-soft text-mark-foreground")}>
      <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", tone === "stop" ? "text-destructive" : "text-star")} />
      <div>{children}</div>
    </div>
  );
}

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
  const [goAhead, setGoAhead] = useState(false);
  const running = stage !== null;
  const locked = ai && aiStatus !== null && !aiStatus.unlocked;
  const estimating = open && ai && !!aiStatus?.unlocked && !estimate;
  // the AI cost settings: her currency, the month's budget, a low balance, and "ask me before a run above …"
  const ok = estimate && !estimate.error ? estimate : null;
  const currency = ok?.cost?.currency ?? null;
  const money = (n: number) => formatCost(n, currency, { local: "only" });
  const both = (n: number) => formatCost(n, currency);
  const budget = ok?.budget;
  const stopped = ai && !!budget?.stopped;
  const askFirst = ai && !!ok && ok.cost?.confirmAboveUsd != null && ok.usdHigh > ok.cost.confirmAboveUsd;
  const blocked = stopped || (askFirst && !goAhead);

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
                {ok && (
                  <>
                    <p>
                      Estimated cost{" "}
                      <strong className="tabular-nums">
                        {formatCost(ok.usdLow, null)}–{formatCost(ok.usdHigh, null)}
                      </strong>
                      {currency && (
                        <span className="text-muted-foreground tabular-nums">
                          {" "}
                          (about {money(ok.usdLow)}–{money(ok.usdHigh)})
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      About {ok.inputTokens.toLocaleString()} tokens in ({ok.cachedTokens.toLocaleString()} of them your rulebook, cached) and{" "}
                      {ok.outputTokensLow.toLocaleString()}–{ok.outputTokensHigh.toLocaleString()} out.
                      {ok.remainingUsd !== null && ` Balance left after this: about ${both(Math.max(0, ok.remainingUsd - ok.usdHigh))}.`}
                      {budget?.budgetUsd != null && ` This month: ${both(budget.monthUsd)} of your ${both(budget.budgetUsd)} budget.`}
                    </p>
                  </>
                )}
              </div>
            )}

            {ai && budget && !locked && (
              <div className="space-y-2">
                {budget.stopped ? (
                  <Notice tone="stop">
                    This month’s AI budget ({both(budget.budgetUsd ?? 0)}) is used up, so AI runs are paused until next month. Proofread with rules only, or{" "}
                    <Link href="/settings#ai-cost" className="font-medium underline underline-offset-2">
                      change the budget
                    </Link>
                    .
                  </Notice>
                ) : budget.over ? (
                  <Notice tone="warn">
                    You’re over this month’s AI budget: {both(budget.monthUsd)} of {both(budget.budgetUsd ?? 0)}.
                  </Notice>
                ) : (
                  budget.near && (
                    <Notice tone="warn">
                      {Math.round(budget.percent ?? 0)}% of this month’s AI budget is used ({both(budget.monthUsd)} of {both(budget.budgetUsd ?? 0)}).
                    </Notice>
                  )
                )}
                {budget.lowBalance && budget.balanceLeftUsd !== null && (
                  <Notice tone="warn">
                    Your API balance is low: about {both(Math.max(0, budget.balanceLeftUsd))} left. Top up in the Anthropic Console, then add it in{" "}
                    <Link href="/settings#ai-cost" className="font-medium underline underline-offset-2">
                      Settings → AI cost
                    </Link>
                    .
                  </Notice>
                )}
                {askFirst && !stopped && ok?.cost?.confirmAboveUsd != null && (
                  <label className="flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm">
                    <input type="checkbox" checked={goAhead} onChange={(e) => setGoAhead(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                    <span>
                      This run may cost up to <strong className="tabular-nums">{both(ok.usdHigh)}</strong>, more than your {both(ok.cost.confirmAboveUsd)} limit for one run.{" "}
                      <span className="font-medium">Run it anyway</span>
                    </span>
                  </label>
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
          {stopped && (
            <Button variant="outline" onClick={() => setAi(false)}>
              Use rules only
            </Button>
          )}
          <Button onClick={run} disabled={running || locked || (ai && aiStatus === null) || (ai && blocked)}>
            {running ? "Proofreading…" : locked ? "Unlock the AI first" : stopped ? "AI budget used up" : ai ? "Proofread with AI" : "Proofread with rules"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
