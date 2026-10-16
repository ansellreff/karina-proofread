import { validateRules, withDefaults, type RuleConfig } from "@/lib/rules/config";
import { previewRules } from "@/lib/rules/preview";
import type { DocType } from "@/lib/rules/types";

export const runtime = "nodejs";

/** Try the rules (as currently edited, saved or not) on pasted text. Free: no AI. */
export async function POST(request: Request) {
  const { text, docType, rules } = (await request.json()) as { text?: string; docType?: DocType; rules?: Partial<RuleConfig> };
  if (!text?.trim()) return Response.json({ changes: [] });
  const config = withDefaults(rules);
  const errors = validateRules(config);
  if (errors.length) return Response.json({ errors }, { status: 400 });
  return Response.json({ changes: await previewRules(text.slice(0, 20000), docType ?? "Study Plan", config) });
}
