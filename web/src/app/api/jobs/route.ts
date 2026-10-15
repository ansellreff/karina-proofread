import { getStore } from "@/lib/store/fs-store";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await getStore().list());
}

/** Upload one or more .docx files (multipart field "files"). */
export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Choose a .docx file to upload." }, { status: 400 });
  const created = [];
  const errors: string[] = [];
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".docx")) {
      errors.push(`${f.name}: only Word .docx files can be proofread for now (PDF support comes later).`);
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
