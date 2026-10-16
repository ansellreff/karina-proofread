import { LearnError, learnSummary, recordFromReview } from "@/lib/learn/learn";
import { DOC_TYPES } from "@/lib/rules/config";
import type { DocType } from "@/lib/rules/types";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/** What the bot learned from finished documents: numbers, proposals, learned documents and AI examples. */
export async function GET() {
  const st = await stores();
  return Response.json(await learnSummary(st.learn, await st.config.loadRules()));
}

const MAX_BYTES = 25 * 1024 * 1024;

/** Learn from a review Karina did in Word (a .docx with her tracked changes). */
export async function POST(request: Request) {
  const st = await stores();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !/\.docx$/i.test(file.name)) return Response.json({ error: "Choose a Word file (.docx) with your tracked changes." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "The file is larger than 25 MB." }, { status: 400 });
  const type = String(form.get("docType") ?? "");
  const docType = (DOC_TYPES as string[]).includes(type) ? (type as DocType) : undefined;
  try {
    const rules = await st.config.loadRules();
    const rec = await recordFromReview(file.name, new Uint8Array(await file.arrayBuffer()), docType, rules);
    await st.learn.save(rec);
    const summary = await learnSummary(st.learn, rules);
    return Response.json({ record: rec.id, proposals: summary.proposals.filter((p) => p.records.includes(rec.id)).length, summary });
  } catch (e) {
    if (e instanceof LearnError) return Response.json({ error: e.message }, { status: 400 });
    console.error("learn upload failed", e);
    return Response.json({ error: "The file could not be read as a Word document." }, { status: 400 });
  }
}
