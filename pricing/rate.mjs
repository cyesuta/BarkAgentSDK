/**
 * BarkSDK — exchangeRate (replaces _cny_to_usd)
 *
 * Current exchange rate: 1 USD ≈ 7.1 CNY → 1 CNY ≈ 0.141 USD.
 * Override via BARK_CNY_RATE env var.
 */

export function exchangeRate() {
  try {
    const v = parseFloat(process.env.BARK_CNY_RATE || "");
    if (v > 0) return v;
  } catch { /* ignore */ }
  return 0.141;
}
