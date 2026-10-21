"use client";

import { Check, PenLine, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LEVELS, levelOf } from "@/lib/record/levels";
import type { RecordMethod, RecordSummary } from "@/lib/record/store";
import type { RecordRow } from "@/lib/record/view";
import { cn } from "@/lib/utils";
import { confetti, cssColor } from "./confetti";
import { Trophy } from "./trophy";

export type ShownEntry = RecordRow;

const METHOD: Record<RecordMethod, { label: string; icon: typeof Sparkles }> = {
  ai: { label: "With AI", icon: Sparkles },
  rules: { label: "Bot without AI", icon: Wand2 },
  manual: { label: "Manual", icon: PenLine },
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A date: in UTC while rendering on the server (online it runs in UTC), in her own time zone once in the browser. */
const dayIn = (local: boolean) => (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(local ? {} : { timeZone: "UTC" }) });

/** A number that counts up to `to` (from where it was last time); instant when motion is off. */
function useCountUp(to: number, from: number) {
  const [n, setN] = useState(from);
  useEffect(() => {
    let frame = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || to === from) {
      frame = requestAnimationFrame(() => setN(to));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const ms = Math.min(2200, 700 + Math.abs(to - from) * 60);
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, from]);
  return n;
}

interface Seen {
  worked: number;
  finished: number;
}
const SEEN_KEY = "kp:record-seen";

/** The Proofread record page: the trophy, Worked on vs Finished, levels, numbers and the list. */
export function RecordPage({ summary, entries, preview }: { summary: RecordSummary; entries: ShownEntry[]; preview: boolean }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const day = dayIn(mounted);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [cheer, setCheer] = useState<{ title: string; text: string; big: boolean } | null>(null);
  const [removing, setRemoving] = useState<ShownEntry | null>(null);
  const done = useRef(false);
  const { level, next } = summary.level;
  const gap = summary.worked - summary.finished;

  // celebrate what changed since the last visit (remembered per browser), then remember now
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let before: Seen = { worked: 0, finished: 0 };
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw) before = JSON.parse(raw) as Seen;
      if (!preview) localStorage.setItem(SEEN_KEY, JSON.stringify({ worked: summary.worked, finished: summary.finished }));
    } catch {
      /* private window */
    }
    setSeen(before); // read once after mount (no storage during SSR)
    const moreFinished = summary.finished - before.finished;
    const moreWorked = summary.worked - before.worked;
    const levelUp = levelOf(before.finished).index < summary.level.index && summary.level.index > 0;
    const caughtUp = summary.worked > 0 && gap === 0 && before.finished < before.worked;
    const metal = cssColor(`--trophy-${level.id}`);
    const colors = [metal, cssColor("--primary"), cssColor("--trophy-gold"), cssColor("--trophy-diamond"), cssColor("--del")];
    if (levelUp) {
      setCheer({ title: `You reached ${level.name}!`, text: `${plural(moreFinished, "more document")} finished since your last visit. ${level.cheer}`, big: true });
      confetti({ colors, pieces: 260, duration: 3400 });
    } else if (caughtUp) {
      setCheer({ title: "All caught up!", text: "Every document you worked on is finished. Well done.", big: true });
      confetti({ colors, pieces: 200, duration: 3000 });
    } else if (moreFinished > 0) {
      setCheer({ title: "Congratulations!", text: `You finished ${plural(moreFinished, "more document")} since your last visit.`, big: false });
      confetti({ colors, pieces: 120, duration: 2400 });
    } else if (moreWorked > 0) {
      setCheer({ title: `${plural(moreWorked, "new document")} to finish`, text: "Mark them as done when you’re ready, and your trophy grows.", big: false });
    }
  }, [summary, level, gap, preview]);

  const worked = useCountUp(summary.worked, seen?.worked ?? summary.worked);
  const finished = useCountUp(summary.finished, seen?.finished ?? summary.finished);
  const toNext = next ? next.at - summary.finished : 0;
  const levelProgress = next ? (summary.finished - level.at) / (next.at - level.at) : 1;
  /** When each level was reached: the date the Nth document was finished. */
  const finishedDates = entries.map((e) => e.finishedAt).filter((d): d is string => !!d).sort();
  const maxMonth = Math.max(1, ...summary.byMonth.map((m) => m.worked));

  async function remove() {
    const e = removing;
    setRemoving(null);
    if (!e) return;
    const res = await fetch(`/api/record/${e.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Could not remove it from the record.");
    toast.success("Removed from your Proofread record");
    router.refresh();
  }

  return (
    <div className="space-y-10" style={{ "--metal": `var(--trophy-${level.id})` } as React.CSSProperties}>
      {/* the trophy, under a spotlight */}
      <section
        aria-label="Your trophy"
        className="relative overflow-hidden rounded-2xl border bg-card"
        style={{ backgroundImage: "radial-gradient(ellipse 60% 70% at 28% 45%, var(--spotlight), transparent 70%)" }}
      >
        <div className="grid items-center gap-4 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-8 md:p-10">
          <Trophy level={level.id} finished={finished} />
          <div className="space-y-5">
            {cheer && (
              <div role="status" data-cheer className={cn("record-cheer rounded-lg border px-4 py-3", cheer.big ? "border-primary bg-secondary" : "bg-background")}>
                <p className="font-serif text-lg font-semibold">{cheer.title}</p>
                <p className="text-sm text-muted-foreground">{cheer.text}</p>
              </div>
            )}
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium" data-level={level.id}>
                <span aria-hidden className="size-2 rounded-full" style={{ background: "var(--metal)" }} /> Level: {level.name}
              </p>
              <h1 className="mt-2 font-serif text-[2rem] leading-tight font-semibold">Proofread record</h1>
              <p className="mt-1 text-muted-foreground">{level.cheer}</p>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-background p-4">
                <dt className="text-sm text-muted-foreground">Worked on</dt>
                <dd className="font-serif text-5xl leading-none font-semibold tabular-nums" data-worked>
                  {worked}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">documents proofread</dd>
              </div>
              <div className="rounded-xl border-2 bg-background p-4" style={{ borderColor: "color-mix(in srgb, var(--metal) 70%, transparent)" }}>
                <dt className="text-sm text-muted-foreground">Finished</dt>
                <dd className="font-serif text-5xl leading-none font-semibold tabular-nums" data-finished>
                  {finished}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">marked as done</dd>
              </div>
            </dl>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{summary.worked === 0 ? "Nothing to catch up yet" : gap === 0 ? "All caught up!" : `${plural(gap, "document")} to catch up`}</span>
                <span className="text-muted-foreground tabular-nums">
                  {summary.finished} of {summary.worked} finished
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Finished out of worked on" aria-valuemin={0} aria-valuemax={summary.worked} aria-valuenow={summary.finished}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${summary.worked ? (summary.finished / summary.worked) * 100 : 0}%` }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm">
                {next ? (
                  <>
                    <span className="font-medium tabular-nums">{plural(toNext, "more finished document")}</span> to reach <span className="font-medium">{next.name}</span>
                  </>
                ) : (
                  <span className="font-medium">The highest level. Hall of fame!</span>
                )}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${levelProgress * 100}%`, background: "var(--metal)" }} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{plural(summary.students, "student")}</span> helped (by first name, finished documents).
            </p>
          </div>
        </div>
      </section>

      {/* the badge shelf */}
      <section aria-labelledby="levels-title" className="space-y-3">
        <h2 id="levels-title" className="text-lg font-semibold">
          Levels
        </h2>
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {LEVELS.map((l) => {
            const earned = summary.finished >= l.at;
            const reachedOn = l.at > 0 ? finishedDates[l.at - 1] : undefined;
            return (
              <li
                key={l.id}
                data-badge={l.id}
                data-earned={earned || undefined}
                className={cn("flex flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-center", !earned && "opacity-55")}
                style={{ "--metal": `var(--trophy-${l.id})` } as React.CSSProperties}
              >
                <span
                  aria-hidden
                  className="flex size-11 items-center justify-center rounded-full border-2 font-serif text-sm font-semibold"
                  style={
                    earned
                      ? { background: "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--metal) 45%, var(--trophy-shine)), var(--metal))", borderColor: "var(--metal)", color: "var(--trophy-ink)" }
                      : { borderStyle: "dashed", borderColor: "var(--border)" }
                  }
                >
                  {l.at}
                </span>
                <span className="text-xs font-medium">{l.name}</span>
                <span className="text-[11px] text-muted-foreground">{earned ? (reachedOn ? day(reachedOn) : "Earned") : `${l.at - summary.finished} more`}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* the numbers */}
      <section aria-labelledby="numbers-title" className="space-y-4">
        <h2 id="numbers-title" className="text-lg font-semibold">
          Your record in numbers
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(METHOD) as RecordMethod[]).map((m) => {
            const { label, icon: Icon } = METHOD[m];
            return (
              <div key={m} className="rounded-lg border bg-card p-4">
                <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Icon className="size-4" /> {label}
                </dt>
                <dd className="font-serif text-3xl font-semibold tabular-nums">{summary.byMethod[m]}</dd>
              </div>
            );
          })}
          <div className="rounded-lg border bg-card p-4">
            <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4" /> Finished
            </dt>
            <dd className="font-serif text-3xl font-semibold tabular-nums">{summary.finished}</dd>
          </div>
        </dl>

        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <figure className="rounded-lg border bg-card p-4">
            <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">The last 12 months</span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-primary/35" /> Worked on
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-primary" /> Finished
                </span>
              </span>
            </figcaption>
            <div className="mt-4 flex h-36 items-end gap-1.5" aria-hidden>
              {summary.byMonth.map((m) => (
                <div key={m.month} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full rounded-md border bg-popover px-2 py-1 text-[11px] whitespace-nowrap shadow-sm group-hover:block">
                    {m.worked} worked on, {m.finished} finished
                  </span>
                  <div className="flex h-full w-full items-end justify-center gap-0.5">
                    <div className="w-1/2 max-w-3 rounded-t-[3px] bg-primary/35" style={{ height: `${(m.worked / maxMonth) * 100}%`, minHeight: m.worked ? 3 : 0 }} />
                    <div className="w-1/2 max-w-3 rounded-t-[3px] bg-primary" style={{ height: `${(m.finished / maxMonth) * 100}%`, minHeight: m.finished ? 3 : 0 }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(`${m.month}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short" })}</span>
                </div>
              ))}
            </div>
            <table className="sr-only">
              <caption>Documents per month</caption>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Worked on</th>
                  <th>Finished</th>
                </tr>
              </thead>
              <tbody>
                {summary.byMonth.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{m.worked}</td>
                    <td>{m.finished}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">By document type</p>
            {summary.byType.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {summary.byType.map((t) => (
                  <li key={t.docType} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{t.docType === "Unknown" ? "Other documents" : t.docType}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {t.finished} / {t.worked}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* the list */}
      <section aria-labelledby="list-title" className="space-y-3">
        <div>
          <h2 id="list-title" className="text-lg font-semibold">
            Every document on your record
          </h2>
          <p className="text-sm text-muted-foreground">
            Finished documents stay on your record for good, even after they are deleted. A document deleted before it was finished stops counting (and leaves the
            record once it is deleted for good), so Worked on is only what you can still finish. Counting started with version 6.0.
          </p>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-lg border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Proofread a document (with the bot, or choose “Proofread it myself”) and it appears here.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card" data-record-list>
            {entries.map((e) => {
              const { label, icon: Icon } = METHOD[e.method];
              const notCounted = !e.finishedAt && e.doc !== "active"; // unfinished, in Recently deleted
              return (
                <li key={e.id} data-record={e.id} data-counted={!notCounted || undefined} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5", notCounted && "opacity-60")}>
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{day(e.countedAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{e.firstName ?? "Unnamed student"}</span>
                    <span className="text-muted-foreground">, {e.docType === "Unknown" ? "document" : e.docType}</span>
                    {e.doc === "active" ? (
                      <Link href={`/jobs/${e.id}`} className="ml-2 text-xs text-primary underline-offset-4 hover:underline">
                        Open
                      </Link>
                    ) : notCounted ? (
                      <span className="ml-2 text-xs text-muted-foreground">In Recently deleted, not counted: restore it to count it again</span>
                    ) : (
                      <span className="ml-2 text-xs text-muted-foreground">Document deleted, record kept</span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                    <Icon className="size-3" /> {label}
                  </span>
                  <span className={cn("inline-flex w-20 items-center gap-1 text-xs", e.finishedAt ? "text-ins" : "text-muted-foreground")}>
                    {e.finishedAt ? (
                      <>
                        <Check className="size-3.5" /> Finished
                      </>
                    ) : (
                      "In progress"
                    )}
                  </span>
                  {!preview && (
                    <Button size="icon-xs" variant="ghost" aria-label={`Remove ${e.firstName ?? "this document"} from the record`} title="Remove from record" onClick={() => setRemoving(e)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.firstName ?? "this document"} from your record?</AlertDialogTitle>
            <AlertDialogDescription>
              Only for a document that shouldn’t count, for example one added just to try something out. The document itself isn’t touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              Remove from record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
