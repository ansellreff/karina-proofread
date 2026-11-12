import { DocumentsList } from "@/components/documents-list";
import { UploadZone } from "@/components/upload-zone";
import { stores } from "@/lib/storage/stores";
import { doneSince, isArchived } from "@/lib/store/archive";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents" };

/** The documents, the Recently deleted count, and the moment they were read (Archived is decided against it). */
async function loadDocuments() {
  const st = await stores();
  const store = st.jobs;
  await store.purgeExpired().catch(() => 0); // Recently deleted keeps documents TRASH_DAYS days
  const [listed, trashCount, record] = await Promise.all([store.list(), store.trashCount(), st.record.list().catch(() => [])]);
  // documents finished before the archive timer existed: when the Proofread record saw them finished
  const finishedAt = new Map(record.map((e) => [e.id, e.finishedAt]));
  const jobs = listed.map((j) => (j.status === "done" && !j.doneAt ? { ...j, doneAt: doneSince(j, finishedAt.get(j.id)) ?? undefined } : j));
  return { jobs, trashCount, now: Date.now() };
}

export default async function Inbox(props: PageProps<"/">) {
  const params = await props.searchParams;
  const { jobs, trashCount, now } = await loadDocuments();
  // the same counts as the Waiting and Ready to review tabs (archived documents aren't in them)
  const waiting = jobs.filter((j) => j.status === "new" && !isArchived(j, now)).length;
  const ready = jobs.filter((j) => j.status === "ready" && !isArchived(j, now)).length;
  const q = typeof params.q === "string" ? params.q : "";
  const status = (["new", "ready", "done", "archived"] as const).find((s) => s === params.status) ?? "all";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-[1.75rem] leading-tight font-semibold">Documents</h1>
        <p className="mt-1 text-muted-foreground">
          {jobs.length === 0
            ? "Nothing here yet. Add a student’s document to get started."
            : waiting + ready === 0
              ? "Everything is reviewed."
              : `${waiting} waiting to be proofread, ${ready} ready for your review.`}
        </p>
      </div>
      <UploadZone />
      <DocumentsList jobs={jobs} trashCount={trashCount} initialQuery={q} initialTab={status} now={now} />
    </main>
  );
}
