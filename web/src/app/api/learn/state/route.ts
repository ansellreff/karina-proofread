import { learnSummary } from "@/lib/learn/learn";
import { LEARN } from "@/lib/learn/proposals";
import { stores } from "@/lib/storage/stores";

export const runtime = "nodejs";

type Body = { action: "dismiss" | "undismiss" | "add-example" | "remove-example"; key: string };

/**
 * Karina's answers to proposals: dismiss one (or undo that), add an AI example, remove one. Rule proposals are
 * approved on the page itself and saved with the rules (PUT /api/rules). The AI prompt reads the examples fresh
 * on every run, so a change applies to the next proofread.
 */
export async function POST(request: Request) {
  const st = await stores();
  const { action, key } = (await request.json()) as Body;
  if (typeof key !== "string" || !key) return Response.json({ error: "Missing key." }, { status: 400 });
  const rules = await st.config.loadRules();
  const state = await st.learn.state();
  if (action === "dismiss") state.dismissed = [...new Set([...state.dismissed, key])];
  else if (action === "undismiss") state.dismissed = state.dismissed.filter((k) => k !== key);
  else if (action === "remove-example") state.examples = state.examples.filter((x) => x.key !== key);
  else if (action === "add-example") {
    const p = (await learnSummary(st.learn, rules)).proposals.find((x) => x.key === key);
    if (!p || p.type !== "example") return Response.json({ error: "This example is no longer proposed." }, { status: 404 });
    if (state.examples.length >= LEARN.examples.max) {
      return Response.json({ error: `You have ${LEARN.examples.max} AI examples, the most that is sent with each proofread. Remove one first.` }, { status: 409 });
    }
    state.examples = [...state.examples, { ...p.example, addedAt: new Date().toISOString() }];
  } else return Response.json({ error: "Unknown action." }, { status: 400 });
  await st.learn.saveState(state);
  return Response.json(await learnSummary(st.learn, rules));
}
