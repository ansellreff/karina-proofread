import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { getStore } from "@/lib/store/fs-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">) {
  const job = await getStore().get((await params).id).catch(() => null);
  return { title: job ? `${job.studentName ?? "Unnamed student"} – ${job.docType === "Unknown" ? "Document" : job.docType}` : "Document" };
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const store = getStore();
  const job = await store.get(id).catch(() => null);
  if (!job) notFound();
  const settings = await store.getSettings();
  return <Workspace initialJob={job} aiDefault={settings.aiDefault} hasApiKey={!!process.env.ANTHROPIC_API_KEY} authorName={settings.authorName} />;
}
