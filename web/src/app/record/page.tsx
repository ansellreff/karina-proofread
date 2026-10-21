import { RecordPage, type ShownEntry } from "@/components/record/record-page";
import { summarize, type RecordEntry } from "@/lib/record/store";
import { recordState } from "@/lib/record/view";
import { stores } from "@/lib/storage/stores";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proofread record" };

/** Made-up entries for checking the look at a level (`?preview=<finished>`, development only, never online). */
function previewEntries(finished: number): RecordEntry[] {
  const names = ["Yankee", "Kilo", "Tango", "Delta", "Oscar", "Foxtrot", "Golf", "Hotel"];
  const types = ["Study Plan", "Autobiography", "Statement of Purpose", "CV/Resume", "Essay"];
  const methods: RecordEntry["method"][] = ["ai", "rules", "manual"];
  const open = Math.min(5, Math.max(1, Math.round(finished * 0.1)));
  const now = Date.now();
  return Array.from({ length: finished + open }, (_, i) => {
    const at = new Date(now - i * 3 * 86_400_000).toISOString();
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      firstName: `${names[i % names.length]}${i >= names.length ? ` ${Math.floor(i / names.length)}` : ""}`,
      docType: types[i % types.length],
      method: methods[i % 3],
      countedAt: at,
      ...(i >= open ? { finishedAt: at } : {}),
    };
  });
}

export default async function ProofreadRecordPage({ searchParams }: PageProps<"/record">) {
  const sp = await searchParams;
  const preview = process.env.NODE_ENV !== "production" && typeof sp.preview === "string" ? Math.max(0, Number(sp.preview) || 0) : null;
  let entries: ShownEntry[];
  let summary;
  if (preview !== null) {
    const made = previewEntries(preview);
    entries = made.map((e) => ({ ...e, doc: e.finishedAt ? "deleted" : "active" }));
    summary = summarize(made);
  } else ({ rows: entries, summary } = await recordState(await stores())); // the safety net runs here too
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <RecordPage summary={summary} entries={entries} preview={preview !== null} />
    </main>
  );
}
