import { notFound } from "next/navigation";
import { cache } from "react";
import { Workspace } from "@/components/workspace/workspace";
import { stores } from "@/lib/storage/stores";

export const dynamic = "force-dynamic";

/** One read per request, shared by the title and the page. */
const getJob = cache(async (id: string) => (await stores()).jobs.get(id).catch(() => null));

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">) {
  const job = await getJob((await params).id);
  return { title: job ? `${job.studentName ?? "Unnamed student"} – ${job.docType === "Unknown" ? "Document" : job.docType}` : "Document" };
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const st = await stores();
  const job = await getJob(id);
  if (!job) notFound();
  const settings = await st.jobs.getSettings();
  return (
    <Workspace initialJob={job} aiDefault={settings.aiDefault} hasApiKey={!!process.env.ANTHROPIC_API_KEY} authorName={settings.authorName} online={st.mode === "onedrive"} />
  );
}
