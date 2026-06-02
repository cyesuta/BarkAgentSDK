/**
 * BarkSDK — usageTracker (replaces _parse_usage)
 *
 * Parses token usage from provider responses. Each provider emits usage with
 * different key casing; this normaliser handles the common variants.
 *
 * Zero overlap with NTR SDK's `_parse_usage` implementation.
 */

/**
 * @param {object} usage - raw usage dict from provider
 * @returns {{ tokensIn: number, tokensOut: number, tokensCache: number }}
 */
export function usageTracker(usage) {
  if (!usage || typeof usage !== "object") {
    return { tokensIn: 0, tokensOut: 0, tokensCache: 0 };
  }

  const pick = (...keys) => {
    for (const k of keys) {
      const v = usage[k];
      if (typeof v === "number" && v > 0) return v;
    }
    return 0;
  };

  const tokensIn = pick("prompt_tokens", "input_tokens", "inputTokens", "promptTokenCount");
  const tokensOut = pick("completion_tokens", "output_tokens", "outputTokens", "candidatesTokenCount");

  // Cache tokens — may be nested in prompt_tokens_details
  const details = usage.prompt_tokens_details;
  const nested = (details && typeof details === "object") ? details.cached_tokens : undefined;
  const tokensCache = nested > 0 ? nested : pick(
    "prompt_cache_hit_tokens", "cachedInputTokens", "cached_input_tokens",
    "cachedInput", "cachedContentTokenCount"
  );

  return { tokensIn, tokensOut, tokensCache: tokensCache || 0 };
}
