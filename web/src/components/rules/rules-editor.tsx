"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StyleEditor } from "@/components/style-editor";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DOC_TYPES, validateRules, type RuleConfig } from "@/lib/rules/config";
import { switchOff } from "@/lib/rules/names";
import type { DocType } from "@/lib/rules/types";
import { CustomRules } from "./custom-rules";
import { LearnedFromReviews } from "./learned";
import { BuiltInChecks, FormattingStandard, GrammarChecker, NameLists } from "./sections";
import { RULE_TABS, type RuleTab } from "./tabs";
import { TryRules } from "./try-rules";

export function RulesEditor({ initialTab }: { initialTab: RuleTab }) {
  const [rules, setRules] = useState<RuleConfig | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [defaults, setDefaults] = useState<RuleConfig | null>(null);
  const [tab, setTab] = useState<string>(initialTab);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [focusRule, setFocusRule] = useState<string | null>(null);
  const [trySample, setTrySample] = useState<{ text: string; docType: DocType; n: number } | null>(null);
  const [learnCount, setLearnCount] = useState(0);

  useEffect(() => {
    fetch("/api/rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { rules: RuleConfig; defaults: RuleConfig }) => {
        setRules(d.rules);
        setSaved(JSON.stringify(d.rules));
        setDefaults(d.defaults);
      });
  }, []);

  const dirty = rules !== null && JSON.stringify(rules) !== saved;
  const errors = useMemo(() => (rules ? validateRules(rules) : []), [rules]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (r: RuleConfig) => {
    setRules(r);
    setServerErrors([]);
  };

  async function save() {
    if (!rules || errors.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
      const body = (await res.json()) as { rules?: RuleConfig; errors?: string[] };
      if (!res.ok || !body.rules) {
        setServerErrors(body.errors ?? ["The rules could not be saved."]);
        return;
      }
      setRules(body.rules);
      setSaved(JSON.stringify(body.rules));
      toast.success("Rules saved. The next proofread uses them.");
    } finally {
      setSaving(false);
    }
  }

  function selectTab(v: string) {
    setTab(v);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", v);
    window.history.replaceState(null, "", url);
  }

  if (!rules || !defaults) return <p className="text-muted-foreground">Loading your rules…</p>;
  const problems = [...errors, ...serverErrors];

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => selectTab(String(v))} className="gap-5">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="line" className="h-10 w-max justify-start gap-3 border-b">
            {RULE_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-none">
                {t.label}
                {t.id === "learned" && learnCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-medium text-primary-foreground tabular-nums" aria-label={`${learnCount} suggestions`}>
                    {learnCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="yours">
          <CustomRules rules={rules.custom} onChange={(custom) => change({ ...rules, custom })} focus={focusRule} />
        </TabsContent>
        <TabsContent value="learned" keepMounted>
          <LearnedFromReviews
            rules={rules}
            onCount={setLearnCount}
            onAddRule={(rule) => {
              change({ ...rules, custom: [...rules.custom, rule] });
              setFocusRule(rule.id);
              selectTab("yours");
              toast("Rule added below. Check it, then press Save rules.");
            }}
            onSwitchOff={(ruleId, docType) => change(switchOff(rules, ruleId, docType, DOC_TYPES))}
            onTry={(sample) => {
              setTrySample((s) => ({ ...sample, n: (s?.n ?? 0) + 1 }));
              selectTab("try");
            }}
          />
        </TabsContent>
        <TabsContent value="checks">
          <BuiltInChecks b={rules.builtIn} onChange={(builtIn) => change({ ...rules, builtIn })} />
        </TabsContent>
        <TabsContent value="format">
          <FormattingStandard f={rules.format} onChange={(format) => change({ ...rules, format })} />
        </TabsContent>
        <TabsContent value="grammar">
          <GrammarChecker g={rules.grammar} onChange={(grammar) => change({ ...rules, grammar })} />
        </TabsContent>
        <TabsContent value="names">
          <NameLists lists={rules.lists} onChange={(lists) => change({ ...rules, lists })} />
        </TabsContent>
        <TabsContent value="try">
          <TryRules key={trySample?.n ?? 0} rules={rules} sample={trySample ?? undefined} />
        </TabsContent>
        <TabsContent value="ai">
          <p className="mb-3 max-w-[70ch] text-sm text-muted-foreground">
            The AI reads this rulebook (plus “Tell the AI” rules from Your rules) when AI is on. It is written in plain text and saved on its own with the button below it.
          </p>
          <StyleEditor />
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-4">
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
            <RotateCcw /> Reset to the original rules
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset to the original rules?</AlertDialogTitle>
              <AlertDialogDescription>
                This puts back the rules learned from your reviewed documents and removes rules you added. Nothing changes until you press Save rules, and the previous file is kept as a backup.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => change(structuredClone(defaults))}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {(dirty || problems.length > 0) && tab !== "ai" && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t bg-card/95 px-4 py-3 shadow-[0_-4px_12px_rgb(var(--shadow-color)/0.08)] backdrop-blur sm:-mx-6 sm:px-6">
          {problems.length > 0 && (
            <ul className="mb-2 space-y-0.5 text-sm text-destructive">
              {problems.slice(0, 4).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {problems.length > 4 && <li>…and {problems.length - 4} more.</li>}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted-foreground">{problems.length ? "Fix the problems above to save." : "You have unsaved changes."}</p>
            <Button variant="ghost" size="sm" onClick={() => change(JSON.parse(saved))} disabled={!dirty}>
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={saving || errors.length > 0 || !dirty}>
              {saving && <Loader2 className="animate-spin" />} Save rules
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
