import Link from "next/link";
import { CostChart } from "@/components/cost-chart";
import { Section } from "@/components/rules/bits";
import { summarizeCosts } from "@/lib/costs";
import { stores } from "@/lib/storage/stores";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI costs" };

const money = (n: number) => `US$${n.toFixed(2)}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });

/** What the AI has cost: this month, each month, each document, and how far the balance goes. */
export default async function CostsPage() {
  const st = await stores();
  const [usage, jobs, settings] = await Promise.all([st.jobs.usage(), st.jobs.list(), st.jobs.getSettings()]);
  const c = summarizeCosts(usage, jobs, settings);
  const months = c.months.filter((m) => m.runs).reverse();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-[1.75rem] leading-tight font-semibold">AI costs</h1>
      <p className="mt-1 mb-6 max-w-[65ch] text-muted-foreground">
        What the AI layer has cost, from every AI proofread and re-check. The rules engine and the score are free.
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">This month</p>
          <p className="mt-1 font-serif text-[2rem] leading-none font-semibold tabular-nums">{money(c.thisMonth.usd)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {c.thisMonth.runs} AI run{c.thisMonth.runs === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">One AI run, on average</p>
          <p className="mt-1 font-serif text-[2rem] leading-none font-semibold tabular-nums">{c.perRun === null ? "–" : money(c.perRun)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">over {c.runs} runs, {money(c.total)} in all</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Balance left</p>
          {c.balance ? (
            <>
              <p className="mt-1 font-serif text-[2rem] leading-none font-semibold tabular-nums">{money(c.balance.left)}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">{c.balance.runsLeft === null ? "estimated" : `enough for about ${c.balance.runsLeft} more AI runs`}</p>
            </>
          ) : (
            <p className="mt-2 text-sm">
              <Link href="/settings" className="text-primary underline-offset-2 hover:underline">
                Enter your API balance
              </Link>{" "}
              to see what’s left.
            </p>
          )}
        </div>
      </div>

      <Section title="Per month" hint="The last 12 months. Hover or tap a bar for its amount.">
        {c.runs ? <CostChart months={c.months} /> : <p className="text-sm text-muted-foreground">No AI runs yet. Costs appear here after the first AI proofread.</p>}
        {months.length > 0 && (
          <table className="w-full text-sm">
            <caption className="sr-only">AI spend per month</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Month</th>
                <th className="py-1.5 pl-4 text-right font-medium">Runs</th>
                <th className="py-1.5 pl-4 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="py-1.5">{monthName(m.month)}</td>
                  <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{m.runs}</td>
                  <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{money(m.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {c.documents.length > 0 && (
        <Section title="Per document" hint="Highest first. A document proofread again or re-checked counts each run." className="mt-5">
          <table className="w-full text-sm">
            <caption className="sr-only">AI spend per document</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Document</th>
                <th className="py-1.5 pl-4 text-right font-medium">Runs</th>
                <th className="py-1.5 pl-4 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {c.documents.map((d) => (
                <tr key={d.jobId}>
                  <td className="py-1.5 pr-3">
                    {d.name ? (
                      <Link href={`/jobs/${d.jobId}`} className="underline-offset-2 hover:underline">
                        {d.name}
                        {d.docType && d.docType !== "Unknown" && <span className="text-muted-foreground">, {d.docType}</span>}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Deleted document</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{d.runs}</td>
                  <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{money(d.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.byModel.length > 1 && (
            <p className="text-xs text-muted-foreground">By model: {c.byModel.map((m) => `${m.model} ${money(m.usd)} (${m.runs})`).join(", ")}</p>
          )}
        </Section>
      )}
    </main>
  );
}
