import { notFound } from "next/navigation";
import { PrintView } from "@/components/workspace/print-view";
import { doneFileName } from "@/lib/naming";
import { stores } from "@/lib/storage/stores";

export const dynamic = "force-dynamic";

/** PDF through the browser's print dialog (locally, and online when OneDrive can't convert the file). */
export default async function PrintPage({ params, searchParams }: PageProps<"/jobs/[id]/print">) {
  const { id } = await params;
  const sp = await searchParams;
  const job = await (await stores()).jobs.get(id).catch(() => null);
  if (!job) notFound();
  const v = Number(sp.v ?? job.current);
  return <PrintView jobId={job.id} version={v} fileName={job.fileName} title={doneFileName(job, "pdf").replace(/\.pdf$/, "")} markup={sp.markup === "1"} />;
}
