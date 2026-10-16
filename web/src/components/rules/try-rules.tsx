"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DOC_TYPES, type RuleConfig } from "@/lib/rules/config";
import type { PreviewChange } from "@/lib/rules/preview";
import type { DocType } from "@/lib/rules/types";
import { NativeSelect, Section } from "./bits";

const SAMPLE = `STUDY PLAN
I graduated with a Bachelor’s Degree in Business Management from Petra Christian University. As long as I study hard , I can reach my dream at your university.`;

/** Paste a passage and see what the rules (as edited, saved or not) would do. No AI, no cost. */
export function TryRules({ rules }: { rules: RuleConfig }) {
  const [text, setText] = useState(SAMPLE);
  const [docType, setDocType] = useState<DocType>("Study Plan");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ changes?: PreviewChange[]; errors?: string[] } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/rules/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, docType, rules }) });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Try your rules" hint="Paste a few paragraphs and see what the bot would change with the rules as they are on this page, before you save. Free: the AI is not used here.">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect ariaLabel="Document type" value={docType} onChange={setDocType} options={DOC_TYPES.map((t) => ({ value: t, label: t }))} />
        <Button size="sm" onClick={run} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Play />} Try rules
        </Button>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} aria-label="Text to try the rules on" className="font-serif text-[0.95rem]" />
      {result?.errors && (
        <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {result.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {result?.changes && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            {result.changes.length === 0 ? "No changes: the rules don’t fire on this text." : `${result.changes.length} change${result.changes.length === 1 ? "" : "s"}:`}
          </p>
          <ol className="divide-y rounded-md border">
            {result.changes.map((c, i) => (
              <li key={i} className="px-3 py-2.5 text-sm">
                <p className="mb-0.5 text-xs text-muted-foreground">
                  {c.reason ?? ruleName(c.rule)}
                  {c.beyondStyle && <span className="beyond ml-2 rounded px-1 text-foreground">beyond your style</span>}
                </p>
                <p className="redline leading-relaxed whitespace-pre-line">
                  {c.before && <del>{c.before}</del>}
                  {c.before && c.after && " "}
                  {c.after && <ins>{c.after.trim()}</ins>}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}

function ruleName(rule: string): string {
  if (rule.startsWith("harper:")) return `Grammar checker (${rule.slice(7)})`;
  const names: Record<string, string> = {
    "degree-case": "Degree name in lower case", "space-before-colon": "Space before a colon", "double-space": "Double space",
    "hyphen-compound": "Hyphenated compound", "indonesian-university": "Official university name", "university-acronym": "University acronym",
    "indonesian-acronym": "Indonesian acronym", "conclusion-heading": "Conclusion heading", "long-paragraph": "Long paragraph",
    "resume-year": "CV: year", "resume-language": "CV: language level", "header-title": "Header: title", "header-fields": "Header lines", "end-note": "End Note block",
  };
  return names[rule] ?? rule;
}
