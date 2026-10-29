import { DocumentsList } from "@/components/documents-list";
import { UploadZone } from "@/components/upload-zone";
import { stores } from "@/lib/storage/stores";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents" };

export default async function Inbox(props: PageProps<"/">) {
  const params = await props.searchParams;
  const store = (await stores()).jobs;
  await store.purgeExpired().catch(() => 0); // Recently deleted keeps documents TRASH_DAYS days
  const [jobs, trashCount] = await Promise.all([store.list(), store.trashCount()]);
  const waiting = jobs.filter((j) => j.status === "new").length;
  const ready = jobs.filter((j) => j.status === "ready").length;
  const q = typeof params.q === "string" ? params.q : "";
  const status = params.status === "new" || params.status === "ready" || params.status === "done" ? params.status : "all";

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
      <DocumentsList jobs={jobs} trashCount={trashCount} initialQuery={q} initialTab={status} />
    </main>
  );
}
