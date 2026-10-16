import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await getStore().list());
}

/** Upload one or more .docx or .pdf files (multipart field "files"). PDFs are converted to Word. */
export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Choose a Word (.docx) or PDF file to upload." }, { status: 400 });
  const created = [];
  const errors: string[] = [];
  for (const f of files) {
    if (!/\.(docx|pdf)$/i.test(f.name)) {
      errors.push(`${f.name}: only Word (.docx) and PDF files can be proofread. For an old .doc file, open it in Word and save it as .docx.`);
      continue;
    }
    try {
      created.push(await getStore().create(f.name, new Uint8Array(await f.arrayBuffer())));
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
    }
  }
  return Response.json({ created, errors }, { status: created.length ? 201 : 400 });
}
