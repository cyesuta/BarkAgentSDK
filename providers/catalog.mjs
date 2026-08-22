/**
 * Curated model catalog for hosts that render a provider/model selector.
 *
 * Runners intentionally accept any valid model ID. This catalog only exposes
 * known, user-friendly choices; callers can still supply another variant.
 */
export const OPENROUTER_MODELS = Object.freeze([
  Object.freeze({
    id: "openrouter/auto",
    displayName: "Auto Router",
    contextWindow: 128_000,
    supportsVision: false,
    supportsThinking: false,
  }),
  Object.freeze({
    id: "stealth/ox-alpha",
    displayName: "Ox Alpha",
    contextWindow: 1_048_576,
    supportsVision: true,
    supportsThinking: true,
  }),
]);

/**
 * Return the curated model options for a provider alias.
 * Unknown aliases return an empty list so hosts may supply their own options.
 */
export function listProviderModels(alias) {
  return alias === "openrouter" ? OPENROUTER_MODELS : [];
}
