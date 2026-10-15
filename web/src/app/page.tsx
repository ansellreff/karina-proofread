import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { UploadZone } from "@/components/upload-zone";
import { getStore } from "@/lib/store/fs-store";
import type { Job, JobStatus } from "@/lib/store/types";

export const dynamic = "force-dynamic";

const ORDER: JobStatus[] = ["new", "proofreading", "ready", "done"];

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Row({ job }: { job: Job }) {
  const changes = job.proofread?.changes.length;
  return (
    <li>
      <Link
        href={`/jobs/${job.id}`}
        className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:outline-none sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_9rem_5rem] sm:px-5"
      >
        <div className="min-w-0">
          <p className="truncate font-serif text-[1.02rem] font-semibold">{job.studentName ?? "Unnamed student"}</p>
          <p className="truncate text-sm text-muted-foreground">{job.fileName}</p>
        </div>
        <div className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-start">
          <p className="text-sm">{job.docType === "Unknown" ? "Document" : job.docType}</p>
          {changes !== undefined && (
            <p className="hidden text-xs text-muted-foreground sm:block">
              {changes} changes{job.proofread?.ai ? ", with AI" : ""}
            </p>
          )}
        </div>
        <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
          <StatusChip status={job.status} />
          <span className="text-xs text-muted-foreground sm:hidden">{when(job.updatedAt)}</span>
        </div>
        <span className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">{when(job.updatedAt)}</span>
      </Link>
    </li>
  );
}

export default async function Inbox() {
  const jobs = await getStore().list();
  const counts = Object.fromEntries(ORDER.map((s) => [s, jobs.filter((j) => j.status === s).length])) as Record<JobStatus, number>;
  const waiting = counts.new + counts.ready;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-semibold">Documents</h1>
          <p className="mt-1 text-muted-foreground">
            {jobs.length === 0
              ? "Nothing here yet. Add a student's document to get started."
              : waiting === 0
                ? "Everything is reviewed."
                : `${counts.new} waiting to be proofread, ${counts.ready} ready for your review.`}
          </p>
        </div>
      </div>

      <UploadZone />

      {jobs.length > 0 && (
        <section className="mt-8 overflow-hidden rounded-lg border bg-card" aria-label="Documents">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_9rem_5rem] gap-x-4 border-b px-5 py-2 text-xs text-muted-foreground sm:grid">
            <span>Student</span>
            <span>Type</span>
            <span>Status</span>
            <span className="text-right">Updated</span>
          </div>
          <ul className="divide-y">
            {jobs.map((j) => (
              <Row key={j.id} job={j} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
