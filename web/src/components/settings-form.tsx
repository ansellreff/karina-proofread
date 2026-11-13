"use client";

import { Loader2, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { AiLockSection } from "@/components/ai-unlock";
import { BackupSection } from "@/components/backup-section";
import { BudgetBar } from "@/components/budget-bar";
import { FileNameSection } from "@/components/file-name-format";
import { Segmented } from "@/components/rules/bits";
import { setPaper, usePaper, type Paper } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatCost, type BudgetState, type CostSettings } from "@/lib/ai/budget";
import type { Settings } from "@/lib/store/types";
import { cn } from "@/lib/utils";

/** The sections, in page order, for the jump links at the top. */
const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "proofreading", label: "Proofreading" },
  { id: "ai-password", label: "AI password" },
  { id: "ai-cost", label: "AI cost" },
  { id: "file-name", label: "Export file name" },
  { id: "backup", label: "Backup and storage" },
];

/** Light / dark / system and paper colour: per browser, applied right away. */
function Appearance() {
  const { theme, setTheme } = useTheme();
  const paper = usePaper();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return (
    <section id="appearance" className="scroll-mt-20 space-y-5 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Applies right away, on this computer or phone.</p>
      </div>
      <Field label="Theme" hint="“System” follows the light/dark setting of this device.">
        <Segmented
          ariaLabel="Theme"
          value={(mounted ? theme : "system") as "light" | "dark" | "system"}
          onChange={(v) => setTheme(v)}
          options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]}
        />
      </Field>
      <Field label="Paper in dark mode" hint="White shows the document as it will print. Dark is easier on the eyes at night.">
        <Segmented
          ariaLabel="Paper in dark mode"
          value={mounted ? paper : "white"}
          onChange={(v: Paper) => setPaper(v)}
          options={[{ value: "white", label: "White paper" }, { value: "dark", label: "Dark paper" }]}
        />
      </Field>
    </section>
  );
}

interface Info {
  settings: Settings;
  hasApiKey: boolean;
  spentSinceBalance: number;
  remainingUsd: number | null;
  thisMonthUsd: number;
  runsThisMonth: number;
  budget: BudgetState;
  perModel: Record<string, { runs: number; avgUsd: number }>;
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-6">
      <div>
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The AI cost options as typed in the form (numbers stay text until saved, so half-typed values are fine). */
interface CostDraft {
  budget: string;
  warnAt: string;
  overBudget: "warn" | "stop";
  lowOn: boolean;
  low: string;
  askOn: boolean;
  ask: string;
  currencyOn: boolean;
  code: string;
  rate: string;
}
const text = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const toDraft = (c: CostSettings): CostDraft => ({
  budget: text(c.monthlyBudgetUsd),
  warnAt: String(c.warnAtPercent),
  overBudget: c.overBudget,
  lowOn: c.lowBalanceUsd !== null,
  low: text(c.lowBalanceUsd ?? 2),
  askOn: c.confirmAboveUsd !== null,
  ask: text(c.confirmAboveUsd ?? 1),
  currencyOn: c.currency !== null,
  code: c.currency?.code ?? "IDR",
  rate: text(c.currency?.perUsd ?? null),
});
const num = (s: string) => {
  const n = Number(s.trim().replace(/\s/g, "").replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
};
/** The draft as settings, or the first thing that needs fixing. */
function fromDraft(d: CostDraft): { cost: CostSettings } | { problem: string } {
  const budget = d.budget.trim() === "" ? null : num(d.budget);
  if (d.budget.trim() !== "" && budget === null) return { problem: "Enter the monthly budget as a number, for example 10, or leave it empty." };
  const warnAt = num(d.warnAt);
  if (warnAt === null || warnAt < 10 || warnAt > 100) return { problem: "The budget warning must be between 10% and 100%." };
  const low = num(d.low);
  if (d.lowOn && low === null) return { problem: "Enter the low-balance amount as a number, for example 2." };
  const ask = num(d.ask);
  if (d.askOn && (ask === null || ask === 0)) return { problem: "Enter the most one AI run may cost before the app asks you, for example 1." };
  const rate = num(d.rate);
  const code = d.code.trim().toUpperCase();
  if (d.currencyOn && !/^[A-Z]{3}$/.test(code)) return { problem: "Enter your currency as a three-letter code, for example IDR." };
  if (d.currencyOn && !rate) return { problem: `Enter how many ${code || "of your currency"} one US dollar is, for example 16300.` };
  return {
    cost: {
      monthlyBudgetUsd: budget && budget > 0 ? budget : null,
      warnAtPercent: Math.round(warnAt),
      overBudget: d.overBudget,
      lowBalanceUsd: d.lowOn ? low : null,
      confirmAboveUsd: d.askOn ? ask : null,
      currency: d.currencyOn && rate ? { code, perUsd: rate } : null,
    },
  };
}

const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "recommended: closest to your style" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "costs about half" },
] as const;
const EFFORTS = [
  { id: "low", label: "Low", note: "quickest and cheapest; may miss smaller things" },
  { id: "medium", label: "Medium", note: "a little cheaper than High" },
  { id: "high", label: "High", note: "recommended: reads most carefully" },
] as const;

export function SettingsForm() {
  const [info, setInfo] = useState<Info | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [balance, setBalance] = useState("");
  const [cost, setCost] = useState<CostDraft | null>(null);
  const [topUp, setTopUp] = useState("");
  const [saving, setSaving] = useState(false);

  /** `reset`: also put the saved values back in the form (on first load, after Save and Discard). */
  const load = useCallback(
    (reset: boolean) =>
      fetch("/api/settings", { cache: "no-store" })
        .then((r) => r.json())
        .then((i: Info) => {
          setInfo(i);
          if (!reset) return;
          setS(i.settings);
          setBalance(text(i.settings.balanceUsd));
          setCost(toDraft(i.settings.cost));
        }),
    [],
  );
  useEffect(() => {
    void load(true);
  }, [load]);

  const savedBalance = info ? text(info.settings.balanceUsd) : "";
  const draft = cost ? fromDraft(cost) : null;
  // the fields of the form itself (the balance has its own field; a top-up changes it on the server)
  const editable = (x: Settings) => JSON.stringify({ ...x, cost: undefined, balanceUsd: undefined, balanceSetAt: undefined });
  const dirty =
    !!info &&
    !!s &&
    !!cost &&
    (editable(s) !== editable(info.settings) ||
      balance.trim() !== savedBalance ||
      JSON.stringify(toDraft(info.settings.cost)) !== JSON.stringify(cost));

  // leaving the page with changes that aren't saved asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!s || !draft) return;
    const balanceUsd = balance.trim() === "" ? null : num(balance);
    if (balance.trim() !== "" && balanceUsd === null) return toast.error("Enter the balance as a number, for example 20.");
    if ("problem" in draft) return toast.error(draft.problem);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, balanceSetAt: undefined, balanceUsd, cost: draft.cost }) });
      if (!res.ok) throw new Error();
      toast.success("Settings saved");
      await load(true);
    } catch {
      toast.error("Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [s, draft, balance, load]);

  // Ctrl+S / ⌘S saves
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) void save();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dirty, save]);

  async function addTopUp() {
    const amount = num(topUp);
    if (!amount) return toast.error("Enter the top-up as a number, for example 10.");
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topUpUsd: amount }) });
    if (!res.ok) return toast.error("The top-up could not be added.");
    const next = (await res.json()) as Settings;
    setTopUp("");
    setBalance(text(next.balanceUsd)); // the new balance; the rest of the form keeps what you typed
    await load(false);
    toast.success(`Added US$${amount.toFixed(2)}: your balance is now US$${next.balanceUsd?.toFixed(2)}`);
  }

  if (!s || !info || !cost) return <p className="text-muted-foreground">Loading…</p>;
  const currency = draft && "cost" in draft ? draft.cost.currency : info.settings.cost.currency;
  const both = (n: number) => formatCost(n, currency);
  const b = info.budget;
  const setC = (patch: Partial<CostDraft>) => setCost({ ...cost, ...patch });
  const balanceSet = info.settings.balanceSetAt ? new Date(info.settings.balanceSetAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <div className="space-y-8">
      <nav aria-label="Settings sections" className="-mt-2 flex flex-wrap gap-1.5">
        {SECTIONS.map((x) => (
          <a key={x.id} href={`#${x.id}`} className="rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {x.label}
          </a>
        ))}
      </nav>

      <Appearance />

      <section id="proofreading" className="scroll-mt-20 space-y-5 rounded-lg border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold">Proofreading</h2>
          <p className="text-sm text-muted-foreground">How the bot proofreads. Each document can still be switched in the Proofread window.</p>
        </div>
        <Field label="Use AI by default" hint="You can still switch it per document.">
          <div className="flex items-center gap-3">
            <Switch checked={s.aiDefault} onCheckedChange={(v) => setS({ ...s, aiDefault: v })} disabled={!info.hasApiKey} aria-label="Use AI by default" />
            <span className="text-sm text-muted-foreground">{info.hasApiKey ? (s.aiDefault ? "On" : "Off: rules only, free") : "No Anthropic API key is set"}</span>
          </div>
        </Field>
        <Field label="AI model" hint="What one AI proofread of a whole document has cost you with each, on average.">
          <div role="radiogroup" aria-label="AI model" className="grid gap-2 sm:grid-cols-2">
            {MODELS.map((m) => {
              const used = info.perModel[m.id];
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={s.model === m.id}
                  onClick={() => setS({ ...s, model: m.id })}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    s.model === m.id ? "border-primary bg-secondary" : "hover:bg-secondary/50",
                  )}
                >
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.note}</span>
                  <span className="mt-1 block text-xs tabular-nums">{used ? `about ${both(used.avgUsd)} per document (${used.runs} ${used.runs === 1 ? "document" : "documents"})` : "not used yet"}</span>
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Thoroughness" hint={EFFORTS.find((e) => e.id === s.effort)?.note}>
          <Segmented ariaLabel="Thoroughness" value={s.effort} onChange={(effort) => setS({ ...s, effort })} options={EFFORTS.map((e) => ({ value: e.id, label: e.label }))} />
        </Field>
        <Field label="Author name in documents" hint="Shown on every tracked change and note the bot writes from now on. Earlier documents keep theirs." htmlFor="author-name">
          <Input id="author-name" value={s.authorName} onChange={(e) => setS({ ...s, authorName: e.target.value })} className="max-w-xs" aria-invalid={!s.authorName.trim()} />
          {!s.authorName.trim() && <p className="mt-1 text-xs text-destructive">Enter a name; an empty one keeps the saved name.</p>}
        </Field>
      </section>

      <div id="ai-password" className="scroll-mt-20">
        <AiLockSection />
      </div>

      <section id="ai-cost" className="scroll-mt-20 space-y-5 rounded-lg border bg-card p-5" aria-labelledby="ai-cost-title">
        <div>
          <h2 id="ai-cost-title" className="text-lg font-semibold">
            AI cost
          </h2>
          <p className="text-sm text-muted-foreground">Your balance, a monthly budget, and when the app should warn you or ask first. Anthropic bills in US dollars.</p>
        </div>

        {/* where things stand */}
        <dl className="grid grid-cols-2 gap-4 rounded-md border bg-background p-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">This month</dt>
            <dd className="font-serif text-xl tabular-nums">{formatCost(info.thisMonthUsd, null)}</dd>
            <dd className="text-xs text-muted-foreground">
              {info.runsThisMonth} AI {info.runsThisMonth === 1 ? "run" : "runs"}
              {currency && `, about ${formatCost(info.thisMonthUsd, currency, { local: "only" })}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spent since balance entered</dt>
            <dd className="font-serif text-xl tabular-nums">{formatCost(info.spentSinceBalance, null)}</dd>
            {balanceSet && <dd className="text-xs text-muted-foreground">since {balanceSet}</dd>}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Estimated balance left</dt>
            <dd className={cn("font-serif text-xl tabular-nums", b.lowBalance && "text-destructive")}>{info.remainingUsd === null ? "Not set" : formatCost(info.remainingUsd, null)}</dd>
            {b.lowBalance && <dd className="text-xs text-destructive">low: time to top up</dd>}
          </div>
          {b.budgetUsd !== null && (
            <div className="col-span-2 sm:col-span-3">
              <BudgetBar budget={b} money={both} />
            </div>
          )}
        </dl>

        <Field label="Your API balance" hint="What the Anthropic Console shows under Billing. The app subtracts what it spends from here." htmlFor="balance">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">US$</span>
            <Input id="balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="20.00" className="max-w-[8rem] tabular-nums" />
          </div>
        </Field>
        <Field label="Add a top-up" hint="Bought more credit? Add it here: it goes on top of what’s left, so you don’t have to work out the new total." htmlFor="top-up">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addTopUp();
            }}
          >
            <span className="text-sm text-muted-foreground">US$</span>
            <Input id="top-up" inputMode="decimal" value={topUp} onChange={(e) => setTopUp(e.target.value)} placeholder="10.00" className="max-w-[8rem] tabular-nums" />
            <Button type="submit" variant="outline" size="sm" disabled={!topUp.trim()}>
              <Plus /> Add to balance
            </Button>
          </form>
        </Field>

        <div className="space-y-5 border-t pt-5">
          <Field label="Monthly budget" hint="The most you want to spend on AI in a calendar month. Leave empty for no budget." htmlFor="budget">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">US$</span>
              <Input id="budget" inputMode="decimal" value={cost.budget} onChange={(e) => setC({ budget: e.target.value })} placeholder="No budget" className="max-w-[8rem] tabular-nums" />
              <span className="text-xs text-muted-foreground">per month</span>
            </div>
          </Field>
          <Field label="Warn me at" hint="The Proofread window tells you when this much of the budget is used." htmlFor="warn-at">
            <div className="flex items-center gap-2">
              <Input id="warn-at" inputMode="numeric" value={cost.warnAt} onChange={(e) => setC({ warnAt: e.target.value })} className="max-w-[5rem] tabular-nums" disabled={!cost.budget.trim()} />
              <span className="text-sm text-muted-foreground">% of the budget</span>
            </div>
          </Field>
          <Field label="When the budget is used up" hint={cost.overBudget === "stop" ? "AI runs pause until the 1st of next month, or until you raise the budget. Rules-only proofreading always works." : "You can keep using the AI; the Proofread window shows that you’re over."}>
            <Segmented
              ariaLabel="When the budget is used up"
              value={cost.overBudget}
              onChange={(overBudget) => setC({ overBudget })}
              options={[
                { value: "warn", label: "Only warn me" },
                { value: "stop", label: "Pause AI runs" },
              ]}
            />
          </Field>
          <Field label="Low-balance warning" hint="Warns you in the Proofread window when the estimated balance left drops below this." htmlFor="low">
            <div className="flex flex-wrap items-center gap-3">
              <Switch checked={cost.lowOn} onCheckedChange={(lowOn) => setC({ lowOn })} aria-label="Low-balance warning" />
              {cost.lowOn && (
                <span className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">below US$</span>
                  <Input id="low" inputMode="decimal" value={cost.low} onChange={(e) => setC({ low: e.target.value })} className="max-w-[6rem] tabular-nums" />
                </span>
              )}
            </div>
          </Field>
          <Field label="Ask before a costly run" hint="When one AI proofread may cost more than this, the Proofread window asks you to confirm first." htmlFor="ask">
            <div className="flex flex-wrap items-center gap-3">
              <Switch checked={cost.askOn} onCheckedChange={(askOn) => setC({ askOn })} aria-label="Ask before a costly run" />
              {cost.askOn && (
                <span className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">above US$</span>
                  <Input id="ask" inputMode="decimal" value={cost.ask} onChange={(e) => setC({ ask: e.target.value })} className="max-w-[6rem] tabular-nums" />
                </span>
              )}
            </div>
          </Field>
          <Field label="Show costs in my currency too" hint="Beside the US dollar amounts, at the exchange rate you enter (update it now and then)." htmlFor="rate">
            <div className="space-y-2">
              <Switch checked={cost.currencyOn} onCheckedChange={(currencyOn) => setC({ currencyOn })} aria-label="Show costs in my currency too" />
              {cost.currencyOn && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">US$1 =</span>
                  <Input id="rate" inputMode="decimal" value={cost.rate} onChange={(e) => setC({ rate: e.target.value })} placeholder="16300" className="max-w-[8rem] tabular-nums" />
                  <Input value={cost.code} onChange={(e) => setC({ code: e.target.value.toUpperCase().slice(0, 3) })} aria-label="Currency code" placeholder="IDR" className="max-w-[5rem] uppercase" />
                  {currency && <span className="text-xs text-muted-foreground">e.g. US$0.50 = {formatCost(0.5, currency, { local: "only" })}</span>}
                </div>
              )}
            </div>
          </Field>
        </div>
      </section>

      <div id="file-name" className="scroll-mt-20">
        <FileNameSection value={s.fileName} onChange={(fileName) => setS({ ...s, fileName })} />
      </div>
      <div id="backup" className="scroll-mt-20">
        <BackupSection />
      </div>

      <div className={cn("bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 px-1 py-3", dirty && "sticky border-t bg-background/95 backdrop-blur")}>
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          {saving && <Loader2 className="animate-spin" />} {dirty ? "Save settings" : "Saved"}
        </Button>
        {dirty && (
          <>
            <Button variant="ghost" onClick={() => void load(true)} disabled={saving}>
              Discard changes
            </Button>
            <span className="text-sm text-muted-foreground">
              You have changes that aren’t saved yet <span className="hidden sm:inline">(Ctrl+S saves)</span>.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
