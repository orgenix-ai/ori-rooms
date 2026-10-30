/**
 * List prices for the models Orgenix routes to, so a step's token usage can
 * be shown as money. Providers do not return a price with a run (Cursor's
 * Composer is the exception when it does), so the platform estimates from
 * the published per-token rates below and says so.
 *
 * Prices are USD per 1M tokens, standard tier, text modality, taken from the
 * providers' pricing pages on 2026-09-22. Gemini 3.6/3.7/3.8 Flash carry
 * promotional rates through 2026-12-31 (they double on 2027-01-01);
 * GPT-5.6 Sol is promotional through 2026-11-21.
 */
export const MODEL_PRICES_AS_OF = "2026-09-22";

export type ModelPrice = {
  /** USD per 1M input tokens (uncached). */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens read; defaults to the input rate. */
  cacheRead?: number;
  /** USD per 1M cache-write tokens; defaults to the input rate. */
  cacheWrite?: number;
  /** Rates for a prompt longer than `longContextFrom` tokens. */
  longContext?: { from: number; input: number; output: number; cacheRead?: number };
  /**
   * The provider reports input tokens without the cached ones (Anthropic's
   * `input_tokens` excludes cache reads and writes), so cached tokens are
   * added on top instead of being moved out of the input count.
   */
  inputExcludesCache?: true;
};

const PRICES: Record<string, ModelPrice> = {
  // Google Gen AI
  "gemini-3.8-flash": { input: 0.75, output: 3.75, cacheRead: 0.075 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75, cacheRead: 0.075 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75, cacheRead: 0.075 },
  "gemini-3.5-flash": { input: 1.5, output: 9, cacheRead: 0.15 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cacheRead: 0.03 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cacheRead: 0.025 },
  "gemini-3-flash-preview": { input: 0.5, output: 3, cacheRead: 0.05 },
  "gemini-3.1-pro-preview": {
    input: 2,
    output: 12,
    cacheRead: 0.2,
    longContext: { from: 200_000, input: 4, output: 18, cacheRead: 0.4 },
  },
  "gemini-2.5-pro": {
    input: 1.25,
    output: 10,
    cacheRead: 0.125,
    longContext: { from: 200_000, input: 2.5, output: 15, cacheRead: 0.25 },
  },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.03 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cacheRead: 0.01 },
  // Cursor
  "composer-2.5": { input: 0.5, output: 2.5, cacheRead: 0.2 },
  "composer-2.5-fast": { input: 3, output: 15, cacheRead: 0.5 },
  "composer-2": { input: 0.5, output: 2.5, cacheRead: 0.2 },
  // xAI, as Cursor lists it (cursor.com/docs/models-and-pricing, 2026-10-06)
  "grok-4.7": { input: 2, output: 6, cacheRead: 0.5 },
  "grok-4.7-fast": { input: 4, output: 12, cacheRead: 1 },
  "grok-4.6": { input: 2, output: 6, cacheRead: 0.5 },
  "grok-4.5": { input: 2, output: 6, cacheRead: 0.5 },
  // OpenAI
  "gpt-5.6-sol": { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
  "gpt-5.6-terra": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
  "gpt-5.5": { input: 5, output: 30, cacheRead: 0.5 },
  "gpt-5.4": { input: 2.5, output: 15, cacheRead: 0.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cacheRead: 0.075 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25, cacheRead: 0.02 },
  "gpt-5.2": { input: 1.75, output: 14, cacheRead: 0.175 },
  "gpt-5.3-codex": { input: 1.75, output: 14, cacheRead: 0.175 },
  "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2, cacheRead: 0.025 },
  // Anthropic
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5, inputExcludesCache: true },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5, inputExcludesCache: true },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, inputExcludesCache: true },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, inputExcludesCache: true },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, inputExcludesCache: true },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, inputExcludesCache: true },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, inputExcludesCache: true },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25, inputExcludesCache: true },
  // Its long-prompt (over 100K) rates, as the sandbox meters a build (sandbox/host/build-models.ts): build and
  // platform agents spend most turns past 100K. Cache write is the 5-minute rate.
  "claude-haiku-5-5": { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625, inputExcludesCache: true },
  // Meta Model API (the `meta` route of rooms/muse/routes.ts), from Meta's own model catalog
  // (GET /muse-code/models, metadata.muse-code.cost) and pricing page (dev.meta.ai/docs/pricing-rate-limits), 2026-10-20.
  // No long-context premium; the contributor tiers (prompts used for training) are not offered. This file stays import-free
  // because the web bundle reads it from source.
  "muse-wonder-1.0": { input: 4, output: 20, cacheRead: 0.2 },
  "muse-spark-1.3": { input: 1.25, output: 4.25, cacheRead: 0.15 },
};

/**
 * Normalise a routed model id to a price key: drop a `provider:` prefix,
 * date suffixes, and effort suffixes (`gpt-5.6-sol-high` bills as Sol).
 */
export function priceKeyForModel(modelId: string): string | null {
  let key = modelId.trim().toLowerCase();
  if (!key) return null;
  const colon = key.indexOf(":");
  if (colon > 0) key = key.slice(colon + 1);
  key = key.replace(/-\d{8}$/, "");
  if (PRICES[key]) return key;
  const withoutEffort = key.replace(/-(low|medium|high|xhigh|max)$/, "");
  if (PRICES[withoutEffort]) return withoutEffort;
  // Longest registered prefix wins (gemini-2.5-flash-lite before gemini-2.5-flash).
  const candidates = Object.keys(PRICES)
    .filter((registered) => key.startsWith(registered))
    .sort((left, right) => right.length - left.length);
  return candidates[0] ?? null;
}

/** Every model id with a price: the candidates a model tier resolves among (ai-model.ts latestModelInFamily). */
export function pricedModelIds(): string[] {
  return Object.keys(PRICES);
}

export function modelPrice(modelId: string): ModelPrice | null {
  const key = priceKeyForModel(modelId);
  return key ? PRICES[key]! : null;
}

export type UsageForCost = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
  /** A price the provider itself reported for the run. */
  costUsd?: number | undefined;
};

export type RunCost = {
  costUsd: number;
  /** provider = returned with the run; estimate = list price × tokens. */
  source: "provider" | "estimate";
  /** Price key used for an estimate. */
  priceKey?: string;
  pricedAt?: string;
};

/**
 * Cost of one provider call. Prefers the provider's own figure; otherwise
 * estimates from list prices. Input tokens are taken to include cached
 * tokens (as Gemini and OpenAI report them), so cached tokens are moved to
 * the cache rate rather than double-counted. Returns null for a model with
 * no price on file.
 */
export function estimateRunCost(
  modelId: string | null | undefined,
  usage: UsageForCost | null | undefined,
): RunCost | null {
  if (!usage) return null;
  if (typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd)) {
    return { costUsd: usage.costUsd, source: "provider" };
  }
  if (!modelId) return null;
  const key = priceKeyForModel(modelId);
  const price = key ? PRICES[key] : undefined;
  if (!key || !price) return null;
  const input = Math.max(0, usage.inputTokens ?? 0);
  const output = Math.max(0, usage.outputTokens ?? 0);
  const cacheReadTokens = Math.max(0, usage.cacheReadTokens ?? 0);
  const cacheRead = price.inputExcludesCache
    ? cacheReadTokens
    : Math.min(input, cacheReadTokens);
  const uncachedInput = price.inputExcludesCache ? input : input - cacheRead;
  const cacheWrite = Math.max(0, usage.cacheWriteTokens ?? 0);
  const tier =
    price.longContext && input > price.longContext.from
      ? {
          input: price.longContext.input,
          output: price.longContext.output,
          cacheRead: price.longContext.cacheRead ?? price.cacheRead ?? price.longContext.input,
        }
      : {
          input: price.input,
          output: price.output,
          cacheRead: price.cacheRead ?? price.input,
        };
  const cacheWriteRate = price.cacheWrite ?? tier.input;
  const usd =
    (uncachedInput * tier.input +
      cacheRead * tier.cacheRead +
      cacheWrite * cacheWriteRate +
      output * tier.output) /
    1_000_000;
  return {
    costUsd: Math.round(usd * 1_000_000) / 1_000_000,
    source: "estimate",
    priceKey: key,
    pricedAt: MODEL_PRICES_AS_OF,
  };
}

/** "$0.0432" style for small amounts, "$1.23" above a dollar. */
export function formatUsd(costUsd: number): string {
  if (!Number.isFinite(costUsd)) return "$—";
  if (costUsd === 0) return "$0";
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The one rounding rule for dollar figures a screen shows: a ten-thousandth of
 * a dollar, so formatUsd keeps its digits for amounts under a cent.
 */
export function roundUsd(costUsd: number): number {
  return Math.round(costUsd * 10_000) / 10_000;
}

/**
 * A total of dollar amounts: summed at full precision, rounded once. Rounding
 * the parts first lets two screens that add up the same costs differ by a cent.
 */
export function sumUsd(costs: Iterable<number>): number {
  let total = 0;
  for (const cost of costs) total += cost;
  return roundUsd(total);
}
