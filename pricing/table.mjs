/**
 * BarkSDK — pricingTable (replaces _pricing_for) + computeCharge (replaces _compute_cost)
 *
 * Per-provider/model pricing per 1M tokens, in NATIVE currency.
 * - Chinese providers in ¥ (isCNY = true), converted via exchangeRate()
 * - International providers in USD (isCNY = false)
 *
 * Prices: 2026-05 best-effort from official sources.
 */

import { exchangeRate } from "./rate.mjs";

/**
 * Look up pricing for a provider+model.
 * @param {string} name — provider name (deepseek, kimi, etc.)
 * @param {string|null} variant — model name
 * @returns {[number, number, number, boolean] | null} — [inRate, outRate, cacheRate, isCNY]
 */
export function pricingTable(alias, variant) {
  const m = (variant || "").toLowerCase();
  const prov = alias.toLowerCase();

  if (prov === "deepseek") {
    if (m.includes("pro") || m.includes("reasoner")) return [3.0, 6.0, 0.1, true];
    return [0.14, 0.28, 0.02, true];
  }
  if (prov === "kimi") {
    if (m.includes("turbo")) return [8.0, 58.0, 1.0, true];
    if (m.includes("k2.6") || m.includes("k2-6") || !m) return [6.5, 27.0, 1.1, true];
    return [4.0, 16.0, 1.0, true];
  }
  if (prov === "qwen") return [2.5, 10.0, 1.0, true];
  if (prov === "glm") {
    if (m.includes("5.2"))                     return [10.0, 40.0, 2.0, true];   // glm-5.2 旗艦 1M ctx
    if (m.includes("5.1"))                     return [10.0, 32.0, 1.8, true];   // glm-5.1
    if (m.includes("5-turbo") || m.includes("5_turbo")) return [8.6, 28.8, 1.5, true]; // glm-5-turbo
    if (m.includes("5"))                       return [7.2, 23.0, 1.3, true];    // glm-5
    if (m.includes("4.7-flash") || m.includes("4.7_flash")) return [0, 0, 0, true]; // 免費
    if (m.includes("4.7"))                     return [4.3, 15.8, 0.8, true];    // glm-4.7
    if (m.includes("4.6"))                     return [4.3, 15.8, 0.8, true];    // glm-4.6
    if (m.includes("4.5-air") || m.includes("4.5_air")) return [1.4, 7.9, 0.3, true]; // glm-4.5-air
    return [10.0, 32.0, 1.8, true]; // fallback = 5.1 tier
  }
  if (prov === "doubao") {
    if (m.includes("lite")) return [0.6, 3.6, 0.12, true];
    if (m.includes("mini")) return [0.2, 2.0, 0.04, true];
    return [3.2, 16.0, 0.64, true];
  }
  if (prov === "grok") return [3.0, 15.0, 0.75, false];
  if (prov === "gemini") return [2.0, 12.0, 0.5, false];
  if (prov === "codex") return [2.5, 10.0, 1.25, false];  // reference (subscription-flat)

  return null;
}


/**
 * Compute turn cost in USD from token counts.
 * @param {string} alias
 * @param {string|null} variant
 * @param {number} tokensIn
 * @param {number} tokensOut
 * @param {number} tokensCache
 * @returns {number}
 */
export function computeCharge(alias, variant, tokensIn, tokensOut, tokensCache) {
  const p = pricingTable(alias, variant);
  if (!p) return 0;
  const [inRate, outRate, cacheRate, isCNY] = p;
  const fullInput = Math.max(0, tokensIn - tokensCache);
  const native = (
    fullInput * inRate + tokensCache * cacheRate + tokensOut * outRate
  ) / 1_000_000;
  return isCNY ? native * exchangeRate() : native;
}
