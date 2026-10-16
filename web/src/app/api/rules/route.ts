import { resetPromptCache } from "@/lib/ai/prompt";
import { DEFAULT_RULES, type RuleConfig } from "@/lib/rules/config";
import { loadRules, saveRules } from "@/lib/rules/config-store";

export const runtime = "nodejs";

/** Karina's review rules (what the rules engine, the AI and the score follow), plus the factory defaults. */
export async function GET() {
  return Response.json({ rules: await loadRules(), defaults: DEFAULT_RULES });
}

export async function PUT(request: Request) {
  const { rules } = (await request.json()) as { rules?: Partial<RuleConfig> };
  if (!rules || typeof rules !== "object") return Response.json({ errors: ["Nothing to save."] }, { status: 400 });
  const res = await saveRules(rules);
  if (!res.ok) return Response.json({ errors: res.errors }, { status: 400 });
  resetPromptCache();
  return Response.json({ rules: res.rules });
}
