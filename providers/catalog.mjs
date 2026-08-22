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
  Object.freeze({
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    displayName: "NVIDIA Nemotron 3 Ultra (free)",
    contextWindow: 1_000_000,
    supportsVision: false,
    supportsThinking: true,
  }),
  Object.freeze({
    id: "nvidia/nemotron-3.5-lightning:free",
    displayName: "NVIDIA Nemotron 3.5 Lightning (free)",
    contextWindow: 1_000_000,
    supportsVision: false,
    supportsThinking: true,
  }),
  Object.freeze({
    id: "z-ai/glm-5.2:free",
    displayName: "Z.ai GLM 5.2 (free)",
    contextWindow: 262_144,
    supportsVision: false,
    supportsThinking: true,
  }),
  Object.freeze({
    id: "google/gemma-4-31b-it:free",
    displayName: "Google Gemma 4 31B (free)",
    contextWindow: 262_144,
    supportsVision: true,
    supportsThinking: true,
  }),
  Object.freeze({
    id: "cohere/north-mini-code:free",
    displayName: "Cohere North Mini Code (free)",
    contextWindow: 256_000,
    supportsVision: false,
    supportsThinking: true,
  }),
  Object.freeze({
    id: "poolside/laguna-s-2.1:free",
    displayName: "Poolside Laguna S 2.1 (free)",
    contextWindow: 262_144,
    supportsVision: false,
    supportsThinking: true,
  }),
  Object.freeze({
    id: "poolside/laguna-xs-2.1:free",
    displayName: "Poolside Laguna XS 2.1 (free)",
    contextWindow: 262_144,
    supportsVision: false,
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
