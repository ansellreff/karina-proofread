"use client";

import { Check, ChevronDown, FileUp, FlaskConical, Loader2, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LearnSummary } from "@/lib/learn/learn";
import type { Proposal, Sample, Tally } from "@/lib/learn/proposals";
import { DOC_TYPES, type CustomRule, type RuleConfig } from "@/lib/rules/config";
import { canSwitchOff } from "@/lib/rules/names";
import type { DocType } from "@/lib/rules/types";
import { cn } from "@/lib/utils";
import { NativeSelect, Section } from "./bits";
import { describeRule } from "./custom-rules";

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
/** "a study plan", "an essay", "a document" (type not recognised). */
const aType = (t: DocType) => (t === "Unknown" ? "a document" : `${/^[AEIOU]/.test(t) ? "an" : "a"} ${t.toLowerCase()}`);
const typeName = (t: string) => (t === "Unknown" ? "Other" : t);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Excerpt({ s }: { s: Sample }) {
  return (
    <p className="redline text-sm leading-relaxed break-words whitespace-pre-line">
      {s.lead && <span className="text-muted-foreground">{s.lead}</span>}
      {s.before && <del>{s.before}</del>}
      {s.before && s.after && " "}
      {s.after && <ins>{s.after}</ins>}
      {s.tail && <span className="text-muted-foreground">{s.tail}</span>}
    </p>
  );
}

/** Kept / changed / undone as one bar, with the numbers spelled out next to it. */
function KeptBar({ t, className }: { t: Tally; className?: string }) {
  if (!t.n) return null;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <div className="bg-ins" style={{ width: `${pct(t.kept, t.n)}%` }} />
      <div className="bg-mark" style={{ width: `${pct(t.changed, t.n)}%` }} />
      <div className="bg-del/70" style={{ width: `${pct(t.rejected, t.n)}%` }} />
    </div>
  );
}

function Legend() {
  const dot = (c: string) => <span className={cn("inline-block size-2 rounded-full", c)} />;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">{dot("bg-ins")} kept as suggested</span>
      <span className="inline-flex items-center gap-1.5">{dot("bg-mark")} you wrote your own fix there</span>
      <span className="inline-flex items-center gap-1.5">{dot("bg-del/70")} undone</span>
    </p>
  );
}

function title(p: Proposal): string {
  if (p.type === "replace" || p.type === "end-note") return describeRule(p.rule);
  if (p.type === "switch-off") return `Switch off “${p.label}”${p.docType ? ` for ${p.docType}` : ""}`;
  return `Your ${p.example.kind === "note" ? "note" : "rewrite"} in ${aType(p.example.docType)}`;
}

function evidence(p: Proposal): string {
  if (p.type === "replace")
    return `You made this change ${plural(p.times, "time")} in ${plural(p.docs, "document")}. Wherever this text appears in the documents you finished, you changed it ${p.right} of ${p.matches} times (${pct(p.right, p.matches)}%).`;
  if (p.type === "end-note") return `You wrote this in the end Note of ${p.docs} of your ${p.ofDocs} ${p.rule.docTypes[0]?.toLowerCase() ?? ""} documents, and the bot didn’t.`;
  if (p.type === "switch-off")
    return `You undid ${p.rejected} of its ${p.n} suggestions${p.changed ? ` and wrote your own fix for ${p.changed}` : ""}; you kept ${p.kept}. Recent documents show the same.`;
  return "The AI copies examples like this when it reviews (only when AI is on).";
}

interface Props {
  rules: RuleConfig;
  onAddRule: (rule: CustomRule) => void;
  onSwitchOff: (ruleId: string, docType?: DocType) => void;
  onTry: (sample: { text: string; docType: DocType }) => void;
  onCount?: (n: number) => void;
}

/** Review rules → From your reviews: what the bot learned from the documents Karina finished. */
export function LearnedFromReviews({ rules, onAddRule, onSwitchOff, onTry, onCount }: Props) {
  const [data, setData] = useState<LearnSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType | "">("");
  const [showRules, setShowRules] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      fetch("/api/learn", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<LearnSummary>) : null))
        .then((d) => d && setData(d)),
    [],
  );
  useEffect(() => {
    fetch("/api/learn", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<LearnSummary>) : null))
      .then((d) => d && setData(d));
  }, []);

  // proposals already taken over into the (unsaved) rules on this page disappear right away
  const open = (data?.proposals ?? []).filter((p) => {
    if (p.type === "replace" || p.type === "end-note") return !rules.custom.some((r) => r.id === p.rule.id);
    if (p.type === "switch-off") return canSwitchOff(p.ruleId, rules, p.docType);
    return true;
  });
  const ruleCount = open.filter((p) => p.type !== "example").length;
  useEffect(() => onCount?.(ruleCount), [ruleCount, onCount]);

  async function post(body: { action: string; key: string }): Promise<boolean> {
    const res = await fetch("/api/learn/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "That didn’t work.");
      return false;
    }
    setData(json);
    return true;
  }

  async function dismiss(p: Proposal) {
    setBusy(p.key);
    try {
      if (await post({ action: "dismiss", key: p.key })) toast("Dismissed. It won’t be suggested again.", { action: { label: "Undo", onClick: () => void post({ action: "undismiss", key: p.key }) } });
    } finally {
      setBusy(null);
    }
  }

  async function approve(p: Proposal) {
    if (p.type === "replace" || p.type === "end-note") {
      onAddRule(p.rule);
      return;
    }
    if (p.type === "switch-off") {
      onSwitchOff(p.ruleId, p.docType);
      toast("Switched off on this page. Press Save rules to keep it.");
      return;
    }
    setBusy(p.key);
    try {
      if (await post({ action: "add-example", key: p.key })) toast.success("Added to the AI examples. The next AI proofread uses it.");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    try {
      const form = new FormData();
      form.set("file", file);
      if (docType) form.set("docType", docType);
      const res = await fetch("/api/learn", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error ?? "The file could not be read.");
      setData(json.summary);
      toast.success(`Learned from “${file.name}”`, { description: json.proposals ? `${plural(json.proposals, "suggestion")} for your rules draw on it.` : "Nothing new to suggest yet; it counts in the numbers below." });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function forget(id: string, name: string) {
    const res = await fetch(`/api/learn/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Could not forget it.");
    toast(`The bot forgot “${name}”. Your document itself is untouched.`);
    void load();
  }

  if (!data) return <p className="text-muted-foreground">Loading what the bot learned…</p>;
  const s = data.stats;
  const ruleProps = open.filter((p) => p.type === "replace" || p.type === "end-note");
  const offProps = open.filter((p) => p.type === "switch-off");
  const exProps = open.filter((p) => p.type === "example");
  const types = Object.entries(s.byType).sort((a, b) => b[1] - a[1]);

  const card = (p: Proposal) => (
    <li key={p.key} data-proposal={p.key} className="rounded-lg border bg-card p-3 sm:p-4">
      <p className="font-medium leading-snug break-words">{title(p)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{evidence(p)}</p>
      {p.samples.length > 0 && (
        <div className="mt-3 space-y-1.5 border-l-2 pl-3">
          {p.samples.map((x, i) => (
            <Excerpt key={i} s={x} />
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void approve(p)} disabled={busy === p.key}>
          {busy === p.key ? <Loader2 className="animate-spin" /> : <Check />}
          {p.type === "switch-off" ? "Switch it off" : p.type === "example" ? "Add to AI examples" : "Add this rule"}
        </Button>
        {p.type === "replace" && p.samples[0] && (
          <Button size="sm" variant="outline" onClick={() => onTry({ text: `${p.samples[0].lead}${p.samples[0].before}${p.samples[0].tail}`, docType: p.samples[0].docType })}>
            <FlaskConical /> Try it
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void dismiss(p)} disabled={busy === p.key}>
          <X /> Dismiss
        </Button>
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      <Section
        title={s.documents ? `Learned from ${plural(s.documents, "document")}` : "Nothing learned yet"}
        hint="Every document you mark as done teaches the bot: it compares what you sent with what it suggested. Nothing changes in your rules until you approve it below."
      >
        {s.documents > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{types.map(([t, n]) => `${typeName(t)} ${n}`).join(", ")}</p>
            <p className="text-sm">
              Of the bot’s {s.suggestions.n} suggestions you kept <strong className="tabular-nums">{pct(s.suggestions.kept, s.suggestions.n)}%</strong>, wrote your own fix for{" "}
              <span className="tabular-nums">{pct(s.suggestions.changed, s.suggestions.n)}%</span> and undid <span className="tabular-nums">{pct(s.suggestions.rejected, s.suggestions.n)}%</span>. You made {s.ownEdits} more edits of your own.
            </p>
            <KeptBar t={s.suggestions} className="h-2.5 max-w-xl" />
            <Legend />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <input ref={fileRef} type="file" accept=".docx" className="sr-only" aria-label="Word file with your tracked changes" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}>
            {busy === "upload" ? <Loader2 className="animate-spin" /> : <FileUp />} Learn from a review you did in Word
          </Button>
          <NativeSelect
            ariaLabel="Document type of the review"
            value={docType}
            onChange={setDocType}
            options={[{ value: "" as DocType | "", label: "Type: detect it" }, ...DOC_TYPES.map((t) => ({ value: t as DocType | "", label: t }))]}
          />
          <p className="w-full text-xs text-muted-foreground">A .docx with your tracked changes. The 6 test documents used to measure accuracy are refused.</p>
        </div>
      </Section>

      <Section title="Suggestions for your rules" hint="Only patterns you repeated, and that would have been right almost every time in the documents you finished.">
        {ruleProps.length + offProps.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            {s.documents ? "No rule changes to suggest: the bot hasn’t found a habit you repeat that it doesn’t follow yet. It checks again after every document you finish." : "Mark documents as done, or upload reviews you did in Word, and suggestions appear here."}
          </p>
        ) : (
          <>
            {ruleProps.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">New rules</h3>
                <ol className="space-y-2">{ruleProps.map(card)}</ol>
              </div>
            )}
            {offProps.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Rules you often undo</h3>
                <ol className="space-y-2">{offProps.map(card)}</ol>
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        title={`Examples for the AI (${data.examples.length} of 30 in use)`}
        hint="Edits you made yourself that the bot didn’t. Approved ones are sent with every AI proofread, so the AI writes more like you now. The student’s name is removed."
      >
        {data.examples.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {data.examples.map((x) => (
              <li key={x.key} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{x.kind === "note" ? "Note" : "Rewrite"} in {aType(x.docType)}</p>
                  <p className="mt-0.5 text-sm break-words">{x.text}</p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Remove this example" onClick={() => void post({ action: "remove-example", key: x.key }).then((ok) => ok && toast("Removed from the AI examples."))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {exProps.length > 0 ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-primary" /> Suggested examples
            </h3>
            <ol className="space-y-2">{exProps.map(card)}</ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No new examples to suggest.</p>
        )}
      </Section>

      {s.rules.length > 0 && (
        <section aria-label="Suggestions kept per rule">
          <button type="button" aria-expanded={showRules} onClick={() => setShowRules(!showRules)} className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <ChevronDown className={cn("size-4 transition-transform", !showRules && "-rotate-90")} /> How often you kept each rule’s suggestions
          </button>
          {showRules && (
            <div className="mt-2 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
              <Legend />
              <ul className="space-y-2.5">
                {s.rules.map((r) => (
                  <li key={r.rule} className="grid gap-1 sm:grid-cols-[minmax(0,16rem)_1fr_auto] sm:items-center sm:gap-4">
                    <span className="truncate text-sm" title={r.label}>{r.label}</span>
                    <KeptBar t={r} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.kept} kept, {r.changed} own fix, {r.rejected} undone
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {data.records.length > 0 && (
        <section aria-label="Learned documents">
          <button type="button" aria-expanded={showDocs} onClick={() => setShowDocs(!showDocs)} className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <ChevronDown className={cn("size-4 transition-transform", !showDocs && "-rotate-90")} /> Documents it learned from ({data.records.length})
          </button>
          {showDocs && (
            <ul className="mt-2 divide-y overflow-hidden rounded-lg border bg-card">
              {data.records.map((r) => (
                <li key={r.id} data-record={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {r.jobId ? <Link href={`/jobs/${r.jobId}`} className="underline-offset-2 hover:underline">{r.fileName}</Link> : r.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {typeName(r.docType)}, {r.source === "job" ? "finished here" : "uploaded"} {new Date(r.learnedAt).toLocaleDateString()}: {plural(r.edits, "edit")}, kept {r.suggestions.kept} of {r.suggestions.n} suggestions
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void forget(r.id, r.fileName)}>
                    Forget
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
