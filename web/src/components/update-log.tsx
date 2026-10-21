"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { usePreference } from "@/components/use-preference";
import { CURRENT_VERSION, versionName, type PointKind, type Release } from "@/lib/update-log";
import { cn } from "@/lib/utils";

const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const majorOf = (v: string) => Number(v.split(".")[0]);

const POINT: Record<PointKind, { label: string; className: string }> = {
  new: { label: "New", className: "bg-secondary text-secondary-foreground" },
  improved: { label: "Improved", className: "bg-muted text-foreground" },
  fixed: { label: "Fixed", className: "border text-muted-foreground" },
};

/** Whether this version is what the website runs (online), or what is on this computer. */
function Status({ release, newest, running, online }: { release: Release; newest: boolean; running: string | null; online: boolean }) {
  if (!online) return newest ? <Badge tone="quiet">On this computer</Badge> : null;
  if (running === release.version) return <Badge tone="live">Running online</Badge>;
  if (newest) return <Badge tone="warn">Not online yet: run push.bat, or redeploy on Vercel</Badge>;
  return null;
}

function Badge({ tone, children }: { tone: "major" | "minor" | "live" | "warn" | "quiet"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "major" && "bg-primary text-primary-foreground",
        tone === "minor" && "border text-muted-foreground",
        tone === "live" && "bg-ins/12 text-ins",
        tone === "warn" && "bg-mark text-mark-foreground",
        tone === "quiet" && "bg-muted text-muted-foreground",
      )}
    >
      {tone === "live" && <span aria-hidden className="size-1.5 rounded-full bg-ins" />}
      {children}
    </span>
  );
}

function ReleaseCard({ release, newest, running, online }: { release: Release; newest: boolean; running: string | null; online: boolean }) {
  const major = release.kind === "major";
  return (
    <article id={`v${release.version}`} data-release={release.version} className={cn("rounded-lg border bg-card p-5", major && "border-primary/40")}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="font-serif text-lg leading-tight font-semibold">{versionName(release.version)}</h3>
        <Badge tone={major ? "major" : "minor"}>{major ? "Major" : "Minor"}</Badge>
        <Status release={release} newest={newest} running={running} online={online} />
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        <time dateTime={release.date}>{date(release.date)}</time>
      </p>
      <p className="mt-3 font-medium">{release.title}</p>
      <p className="text-sm text-muted-foreground">{release.summary}</p>
      <ul className="mt-3 space-y-2">
        {release.points.map((p, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className={cn("mt-0.5 h-fit shrink-0 rounded px-1.5 text-[11px] leading-5 font-medium", POINT[p.kind].className)}>{POINT[p.kind].label}</span>
            <span>
              {p.text}
              {p.href && (
                <>
                  {" "}
                  <Link href={p.href} className="whitespace-nowrap text-primary underline-offset-4 hover:underline">
                    {p.where ?? "Open"}
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {release.note && <p className="mt-3 border-l-2 pl-3 text-xs leading-relaxed text-muted-foreground">{release.note}</p>}
      {!newest && release.commits.length > 0 && (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          Code <span className="font-mono">{release.commits.join(", ")}</span>. To go back to this version, ask Claude: “go back to V.{release.version}”.
        </p>
      )}
    </article>
  );
}

/** The Update log: newest version first, grouped by major version; the newest group is open. */
export function UpdateLog({ releases, running, online }: { releases: Release[]; running: string | null; online: boolean }) {
  const [, setSeen] = usePreference<string | null>("seen-version", null);
  const [majorOnly, setMajorOnly] = usePreference("updates-major-only", false);
  const newest = releases[0];
  const majors = [...new Set(releases.map((r) => majorOf(r.version)))];
  const [open, setOpen] = useState<Set<number>>(() => new Set([majors[0]]));

  // reading the log clears the "new version" dot on the tab
  useEffect(() => setSeen(CURRENT_VERSION), [setSeen]);

  const toggle = (m: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">You are using</p>
        <h1 className="font-serif text-[1.9rem] leading-tight font-semibold" data-current-version>
          {versionName(newest.version)}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {date(newest.date)}. {newest.summary}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Every version so far, newest first. A <span className="font-medium text-foreground">major</span> version (V.5.0) is a new way of working or a new part of
          the app; a <span className="font-medium text-foreground">minor</span> version (V.5.1) improves or fixes within it.
        </p>
      </div>

      <label className="flex w-fit items-center gap-2.5 text-sm">
        <Switch checked={majorOnly} onCheckedChange={setMajorOnly} aria-label="Major versions only" />
        Major versions only
      </label>

      {majorOnly ? (
        <div className="space-y-4" data-major-only>
          {releases
            .filter((r) => r.kind === "major")
            .map((r) => (
              <ReleaseCard key={r.version} release={r} newest={r === newest} running={running} online={online} />
            ))}
        </div>
      ) : (
        <div className="space-y-6">
          {majors.map((m) => {
            const group = releases.filter((r) => majorOf(r.version) === m);
            const head = group.find((r) => r.kind === "major") ?? group[group.length - 1];
            const isOpen = open.has(m);
            return (
              <section key={m} aria-label={`Version ${m}`} data-major={m}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(m)}
                  className="flex w-full items-baseline gap-3 rounded-md py-1 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <ChevronDown className={cn("size-4 shrink-0 self-center text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                  <span className="font-serif text-xl font-semibold">V.{m}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{head.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {group.length} version{group.length === 1 ? "" : "s"}
                  </span>
                </button>
                {isOpen ? (
                  <div className="mt-3 space-y-4 border-l-2 pl-4 sm:pl-5">
                    {group.map((r) => (
                      <ReleaseCard key={r.version} release={r} newest={r === newest} running={running} online={online} />
                    ))}
                  </div>
                ) : (
                  <ul className="mt-1 ml-7 space-y-0.5 text-sm text-muted-foreground">
                    {group.map((r) => (
                      <li key={r.version}>
                        <button type="button" onClick={() => toggle(m)} className="text-left hover:text-foreground">
                          <span className="font-medium tabular-nums">V.{r.version}</span> {r.title}
                          {running === r.version && online && <span className="ml-2 text-ins">running online</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
