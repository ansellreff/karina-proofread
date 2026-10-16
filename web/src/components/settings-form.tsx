"use client";

import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/rules/bits";
import { setPaper, usePaper, type Paper } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Settings } from "@/lib/store/types";

/** Light / dark / system and paper colour: per browser, applied right away. */
function Appearance() {
  const { theme, setTheme } = useTheme();
  const paper = usePaper();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return (
    <section className="space-y-5 rounded-lg border bg-card p-5">
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
}

const money = (n: number) => `US$${n.toFixed(2)}`;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-6">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsForm() {
  const [info, setInfo] = useState<Info | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [balance, setBalance] = useState("");

  const load = () =>
    fetch("/api/settings")
      .then((r) => r.json())
      .then((i: Info) => {
        setInfo(i);
        setS(i.settings);
        setBalance(i.settings.balanceUsd === null ? "" : String(i.settings.balanceUsd));
      });
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!s) return;
    const balanceUsd = balance.trim() === "" ? null : Number(balance);
    if (balanceUsd !== null && !(balanceUsd >= 0)) return toast.error("Enter the balance as a number, for example 20.");
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, balanceUsd }) });
    if (res.ok) {
      toast.success("Settings saved");
      void load();
    } else toast.error("Settings could not be saved.");
  }

  if (!s || !info) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8">
      <Appearance />
      <section className="space-y-5 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">Proofreading</h2>
        <Field label="Use AI by default" hint="You can still switch it per document.">
          <div className="flex items-center gap-3">
            <Switch checked={s.aiDefault} onCheckedChange={(v) => setS({ ...s, aiDefault: v })} disabled={!info.hasApiKey} />
            <span className="text-sm text-muted-foreground">{info.hasApiKey ? (s.aiDefault ? "On" : "Off") : "No API key in web/.env.local"}</span>
          </div>
        </Field>
        <Field label="AI model" hint="Opus is closest to your style. Sonnet costs about half.">
          <div className="flex gap-2">
            {(["claude-opus-5-5", "claude-sonnet-5-5"] as const).map((m) => (
              <Button key={m} size="sm" variant={s.model === m ? "default" : "outline"} onClick={() => setS({ ...s, model: m })}>
                {m === "claude-opus-5-5" ? "Opus 5.5 (recommended)" : "Sonnet 5.5"}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Thoroughness" hint="Higher reads more carefully and costs a little more.">
          <div className="flex gap-2">
            {(["medium", "high"] as const).map((e) => (
              <Button key={e} size="sm" variant={s.effort === e ? "default" : "outline"} onClick={() => setS({ ...s, effort: e })}>
                {e === "high" ? "High (recommended)" : "Medium"}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Author name in documents" hint="Shown on every tracked change and comment.">
          <Input value={s.authorName} onChange={(e) => setS({ ...s, authorName: e.target.value })} className="max-w-xs" />
        </Field>
      </section>

      <section className="space-y-5 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">AI cost</h2>
        <Field label="Your API balance" hint="Enter what you have in the Anthropic Console. The app subtracts what it spends from here.">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">US$</span>
            <Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="20.00" className="max-w-[8rem] tabular-nums" />
          </div>
        </Field>
        <dl className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">This month</dt>
            <dd className="font-serif text-xl tabular-nums">{money(info.thisMonthUsd)}</dd>
            <dd className="text-xs text-muted-foreground">{info.runsThisMonth} AI runs</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spent since balance entered</dt>
            <dd className="font-serif text-xl tabular-nums">{money(info.spentSinceBalance)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Estimated balance left</dt>
            <dd className="font-serif text-xl tabular-nums">{info.remainingUsd === null ? "Not set" : money(info.remainingUsd)}</dd>
          </div>
        </dl>
      </section>

      <Button onClick={save}>Save settings</Button>
    </div>
  );
}
