import Anthropic from "@anthropic-ai/sdk";
import { REVIEW_JSON_SCHEMA, ReviewSchema, type Review } from "./schema";
import type { Usage } from "./cost";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ReviewCall {
  system: string;
  user: string;
  model: string;
  effort: Effort;
}

export interface ReviewResponse {
  review: Review;
  usage: Usage;
  model: string;
}

/** The model-facing surface, injectable so tests and the web app can swap it. */
export interface ReviewClient {
  countTokens(call: Omit<ReviewCall, "effort">): Promise<{ total: number; system: number }>;
  review(call: ReviewCall): Promise<ReviewResponse>;
}

export class ProofreadAiError extends Error {}

/**
 * Anthropic API client. Key from ANTHROPIC_API_KEY (or explicit). A key that is not scoped to a workspace also
 * needs ANTHROPIC_WORKSPACE_ID, sent as the anthropic-workspace-id header.
 */
export class AnthropicReviewClient implements ReviewClient {
  private client: Anthropic;

  constructor(apiKey?: string, workspaceId = process.env.ANTHROPIC_WORKSPACE_ID) {
    this.client = new Anthropic({
      ...(apiKey ? { apiKey } : {}),
      ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
    });
  }

  async countTokens({ system, user, model }: Omit<ReviewCall, "effort">) {
    const [total, sys] = await Promise.all([
      this.client.messages.countTokens({ model, system, messages: [{ role: "user", content: user }] }),
      this.client.messages.countTokens({ model, system, messages: [{ role: "user", content: "." }] }),
    ]);
    return { total: total.input_tokens, system: sys.input_tokens };
  }

  async review({ system, user, model, effort }: ReviewCall): Promise<ReviewResponse> {
    const params = {
      model,
      max_tokens: 64000,
      output_config: { effort, format: { type: "json_schema" as const, schema: REVIEW_JSON_SCHEMA } },
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: user }],
    };
    let message;
    try {
      // Server-side fallback: if a safety classifier declines, the API re-runs on a suitable model.
      message = await this.client.beta.messages
        .stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        .finalMessage();
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      message = await this.client.beta.messages.stream(params).finalMessage();
    }

    if (message.stop_reason === "refusal") {
      throw new ProofreadAiError(`The model declined this document (${message.stop_details?.category ?? "no category"}).`);
    }
    if (message.stop_reason === "max_tokens") throw new ProofreadAiError("The review was cut off (output limit reached).");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ProofreadAiError("The model returned invalid JSON.");
    }
    const parsed = ReviewSchema.safeParse(json);
    if (!parsed.success) throw new ProofreadAiError(`The model's answer did not match the schema: ${parsed.error.message}`);
    return { review: parsed.data, usage: message.usage, model: message.model };
  }
}
