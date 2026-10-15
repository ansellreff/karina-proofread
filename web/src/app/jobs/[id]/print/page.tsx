import { notFound } from "next/navigation";
import { PrintView } from "@/components/workspace/print-view";
import { getStore } from "@/lib/store/fs-store";
import { doneFileName } from "@/lib/naming";

export const dynamic = "force-dynamic";

/** PDF export (until OneDrive conversion in M4): opens the document read-only and calls the browser's print dialog. */
export default async function PrintPage({ params, searchParams }: PageProps<"/jobs/[id]/print">) {
  const { id } = await params;
  const sp = await searchParams;
  const job = await getStore().get(id).catch(() => null);
  if (!job) notFound();
  const v = Number(sp.v ?? job.current);
  return <PrintView jobId={job.id} version={v} fileName={job.fileName} title={doneFileName(job, "pdf").replace(/\.pdf$/, "")} markup={sp.markup === "1"} />;
}
