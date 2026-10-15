import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { resetPromptCache } from "@/lib/ai/prompt";

export const runtime = "nodejs";

const GUIDE = path.join(process.cwd(), "prompts", "karina-style-guide.md");

/** Karina's style rulebook (what the AI follows). */
export async function GET() {
  return Response.json({ markdown: await readFile(GUIDE, "utf8") });
}

export async function PUT(request: Request) {
  const { markdown } = (await request.json()) as { markdown?: string };
  if (!markdown || markdown.trim().length < 200) return Response.json({ error: "The rulebook looks empty. Nothing was saved." }, { status: 400 });
  await copyFile(GUIDE, GUIDE.replace(/\.md$/, ".backup.md"));
  await writeFile(GUIDE, markdown.replace(/\r\n/g, "\n"));
  resetPromptCache();
  return Response.json({ ok: true });
}
