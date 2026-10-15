/** USD per million tokens (Anthropic first-party pricing, Oct 2026). Cache writes are 1.25x input (5-minute TTL). */
export const PRICES: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  "claude-opus-5-5": { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  "claude-sonnet-5-5": { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costOf(usage: Usage, model: string): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return (
    (usage.input_tokens * p.input +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      usage.output_tokens * p.output) /
    1_000_000
  );
}

export interface CostEstimate {
  model: string;
  inputTokens: number;
  /** Stable prompt part (style guide + examples) that is cached between runs. */
  cachedTokens: number;
  outputTokensLow: number;
  outputTokensHigh: number;
  usdLow: number;
  usdHigh: number;
}

/**
 * Pre-run estimate. Input comes from the token-counting endpoint; output (edits + model reasoning) is estimated
 * from the document length and refined later from logged runs.
 */
export function estimateCost(model: string, inputTokens: number, cachedTokens: number, docWords: number): CostEstimate {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const outputTokensLow = Math.round(2500 + docWords * 1.5);
  const outputTokensHigh = Math.round(7000 + docWords * 5);
  const fresh = Math.max(0, inputTokens - cachedTokens);
  // low: style guide already cached; high: first run of the session writes the cache
  const usdLow = (fresh * p.input + cachedTokens * p.cacheRead + outputTokensLow * p.output) / 1_000_000;
  const usdHigh = (fresh * p.input + cachedTokens * p.cacheWrite + outputTokensHigh * p.output) / 1_000_000;
  return { model, inputTokens, cachedTokens, outputTokensLow, outputTokensHigh, usdLow, usdHigh };
}

export const usd = (n: number) => `US$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
