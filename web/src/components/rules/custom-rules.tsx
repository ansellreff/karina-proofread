"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { findAlternatives, type CustomRule } from "@/lib/rules/config";
import { cn } from "@/lib/utils";
import { DocTypeChips, Field, NativeSelect, Segmented } from "./bits";

const ACTIONS: { value: CustomRule["action"]; label: string }[] = [
  { value: "replace", label: "Replace text" },
  { value: "note", label: "Add a note after text" },
  { value: "end-note", label: "Add a line to the end Note" },
  { value: "ai", label: "Tell the AI" },
];

const MATCHES: { value: CustomRule["match"]; label: string }[] = [
  { value: "words", label: "Whole words" },
  { value: "phrase", label: "Exact text, also inside words" },
  { value: "pattern", label: "Pattern (advanced)" },
];

const CONDITIONS: { value: CustomRule["condition"]; label: string }[] = [
  { value: "always", label: "Always" },
  { value: "missing", label: "The document doesn’t mention…" },
  { value: "mentions", label: "The document mentions…" },
  { value: "longer-than", label: "The document is longer than…" },
  { value: "shorter-than", label: "The document is shorter than…" },
];

export const newRule = (): CustomRule => ({
  id: `r-${Date.now().toString(36)}`,
  enabled: true,
  label: "",
  docTypes: [],
  action: "replace",
  find: "",
  match: "words",
  caseSensitive: false,
  occurrences: "all",
  condition: "always",
  words: 1000,
  text: "",
});

const q = (s: string) => `“${s}”`;
function findText(r: CustomRule): string {
  if (r.match === "pattern") return `the pattern ${r.find}`;
  const alts = findAlternatives(r.find);
  if (alts.length <= 1) return q(alts[0] ?? "");
  const shown = alts.slice(0, 4).map(q).join(", ");
  return `any of ${shown}${alts.length > 4 ? ` and ${alts.length - 4} more` : ""}`;
}

/** The rule as one plain sentence. */
export function describeRule(r: CustomRule): string {
  const where = r.docTypes.length ? r.docTypes.join(", ") : "All documents";
  const times = r.occurrences === "first" ? " (first time only)" : "";
  let what = "";
  if (r.action === "replace") what = `Replace ${findText(r)} with ${q(r.text)}${times}`;
  else if (r.action === "note") what = `After ${findText(r)}, add the note (${r.text.replace(/^\(|\)$/g, "")})${times}`;
  else if (r.action === "ai") what = `Tell the AI: ${q(r.text)}`;
  else {
    const cond =
      r.condition === "always" ? "Always" :
      r.condition === "missing" ? `If it doesn’t mention ${findText(r)}` :
      r.condition === "mentions" ? `If it mentions ${findText(r)}` :
      r.condition === "longer-than" ? `If it is longer than ${r.words} words` : `If it is shorter than ${r.words} words`;
    what = `${cond}, add to the end Note: ${q(r.text)}`;
  }
  return `${where}. ${what}`;
}

function RuleForm({ rule, onChange }: { rule: CustomRule; onChange: (r: CustomRule) => void }) {
  const set = (p: Partial<CustomRule>) => onChange({ ...rule, ...p });
  const needsFind = rule.action === "replace" || rule.action === "note" || (rule.action === "end-note" && (rule.condition === "mentions" || rule.condition === "missing"));
  const id = (k: string) => `${rule.id}-${k}`;
  return (
    <div className="space-y-4 border-t pt-4">
      <Field label="Name" hint="Only for you, to recognise the rule." htmlFor={id("label")}>
        <Input id={id("label")} value={rule.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Wordy phrase “in order to”" />
      </Field>
      <Field label="What should happen?">
        <Segmented ariaLabel="Action" value={rule.action} onChange={(action) => set({ action })} options={ACTIONS} />
      </Field>
      {rule.action === "end-note" && (
        <Field label="When" htmlFor={id("cond")}>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect id={id("cond")} value={rule.condition} onChange={(condition) => set({ condition })} options={CONDITIONS} />
            {(rule.condition === "longer-than" || rule.condition === "shorter-than") && (
              <span className="flex items-center gap-2 text-sm">
                <Input type="number" min={1} value={rule.words || ""} onChange={(e) => set({ words: Number(e.target.value) })} className="w-24 tabular-nums" aria-label="Number of words" />
                words
              </span>
            )}
          </div>
        </Field>
      )}
      {needsFind && (
        <Field
          label={rule.action === "end-note" ? "Text to look for" : "Look for"}
          hint={rule.match === "pattern" ? "A regular expression, for experts. \\b marks a word boundary." : "Several alternatives? Separate them with ; (e.g. in order to; so as to). Capital letters are ignored unless you tick the box."}
          htmlFor={id("find")}
        >
          <div className="space-y-2">
            <Input id={id("find")} value={rule.find} onChange={(e) => set({ find: e.target.value })} className={cn(rule.match === "pattern" && "font-mono text-[13px]")} placeholder="e.g. in order to" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <NativeSelect ariaLabel="How to match" value={rule.match} onChange={(match) => set({ match })} options={MATCHES} />
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={rule.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} className="size-4 accent-primary" />
                Match capital letters exactly
              </label>
              {rule.action !== "end-note" && (
                <NativeSelect
                  ariaLabel="How often"
                  value={rule.occurrences}
                  onChange={(occurrences) => set({ occurrences })}
                  options={[{ value: "all", label: "Every time it appears" }, { value: "first", label: "First time only" }]}
                />
              )}
            </div>
          </div>
        </Field>
      )}
      {rule.action === "replace" && (
        <Field label="Replace with" hint="Leave empty to delete the text. A capital at the start of a sentence is kept." htmlFor={id("text")}>
          <Input id={id("text")} value={rule.text} onChange={(e) => set({ text: e.target.value })} placeholder="e.g. to" />
        </Field>
      )}
      {rule.action !== "replace" && (
        <Field
          label={rule.action === "ai" ? "Instruction" : "Note"}
          hint={
            rule.action === "note" ? "Inserted in parentheses right after the text, as your tracked change." :
            rule.action === "end-note" ? "One line in the end Note block. You can use {words} and {pages}." :
            "The AI follows this like your style guide (only when AI is on)."
          }
          htmlFor={id("text")}
        >
          <Textarea id={id("text")} value={rule.text} onChange={(e) => set({ text: e.target.value })} rows={rule.action === "note" ? 2 : 3} />
        </Field>
      )}
      <Field label="Applies to">
        <DocTypeChips value={rule.docTypes} onChange={(docTypes) => set({ docTypes })} />
      </Field>
    </div>
  );
}

export function CustomRules({ rules, onChange }: { rules: CustomRule[]; onChange: (r: CustomRule[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (r: CustomRule) => onChange(rules.map((x) => (x.id === r.id ? r : x)));
  const add = () => {
    const r = newRule();
    onChange([...rules, r]);
    setOpen(r.id);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          {rules.length} rule{rules.length === 1 ? "" : "s"}. The first ones were learned from your reviews; change or add anything.
        </p>
        <Button size="sm" onClick={add}>
          <Plus /> Add a rule
        </Button>
      </div>
      <ol className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} data-rule-id={r.id} className={cn("rounded-lg border bg-card p-3 sm:p-4", !r.enabled && "bg-muted/40")}>
            <div className="flex items-start gap-3">
              <Switch checked={r.enabled} onCheckedChange={(enabled) => update({ ...r, enabled })} aria-label={`Use rule ${r.label || "without a name"}`} className="mt-0.5" />
              <div className={cn("min-w-0 flex-1", !r.enabled && "opacity-60")}>
                <p className="font-medium leading-snug">{r.label || <span className="text-muted-foreground italic">Rule without a name</span>}</p>
                <p className="mt-0.5 text-sm leading-snug break-words text-muted-foreground">{describeRule(r)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)} aria-label={open === r.id ? "Close" : "Edit"} aria-expanded={open === r.id}>
                  <Pencil />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => onChange(rules.filter((x) => x.id !== r.id))} aria-label="Delete rule">
                  <Trash2 />
                </Button>
              </div>
            </div>
            {open === r.id && (
              <div className="mt-3">
                <RuleForm rule={r} onChange={update} />
                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setOpen(null)}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {rules.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No rules of your own yet. Add one to fix a phrase, add a note, or ask a question in the end Note.</p>
      )}
    </div>
  );
}
