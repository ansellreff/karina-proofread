import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

/** Karina's style rulebook (what the AI follows). */
export async function GET() {
  return Response.json({ markdown: await (await stores()).config.styleGuide() });
}

export async function PUT(request: Request) {
  const config = (await stores()).config;
  const { markdown } = (await request.json()) as { markdown?: string };
  if (!markdown || markdown.trim().length < 200) return Response.json({ error: "The rulebook looks empty. Nothing was saved." }, { status: 400 });
  await config.saveStyleGuide(markdown);
  return Response.json({ ok: true });
}
