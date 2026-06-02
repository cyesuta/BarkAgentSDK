/**
 * BarkSDK — Provider registry
 *
 * Maps provider names to their runner functions. Central dispatch point
 * for the BarkEngine — each registered provider exports a `runner()`
 * async function that performs streaming chat completion using Node.js
 * native fetch() (no external SDK).
 *
 * All providers are registered under their REAL names (deepseek, kimi, …)
 * matching the front-end dropdown values — no internal aliases.
 */

import { ReplyPackage, TurnSummary } from "../protocol/packets.mjs";
import { WordChunk, ReasonSegment, ActionRequest } from "../protocol/segments.mjs";
import { BarkConfig } from "../core/config.mjs";

// ── Registry ───────────────────────────────────────────────────────────

/** @type {Record<string, { runner: Function, label: string }>} */
const roster = {};

/**
 * Register a provider runner.
 * @param {string} alias
 * @param {string} label
 * @param {Function} runner — async (cfg, signal, onEvent) => TurnSummary
 */
export function registerProvider(alias, label, runner) {
  roster[alias] = { runner, label };
}

/**
 * Resolve a provider alias to its runner.
 * @param {string} alias
 * @returns {{ runner: Function, label: string }}
 */
export function resolveProvider(alias) {
  const entry = roster[alias];
  if (!entry) throw new Error(`Unknown provider alias: "${alias}"`);
  return entry;
}

/**
 * List all registered aliases.
 * @returns {string[]}
 */
export function listProviders() {
  return Object.keys(roster);
}

/**
 * Check if a provider alias is registered.
 * @param {string} alias
 * @returns {boolean}
 */
export function hasProvider(alias) {
  return alias in roster;
}

// ── Env var name map ──────────────────────────────────────────────────

/**
 * Map provider name → (apiKey env names, baseUrl env names).
 * Each provider tries entries in order; first non-empty wins.
 */
export const PROVIDER_ENV_MAP = {
  codex:   { keys: ["CODEX_OAUTH_ACCESS_TOKEN"],                       bases: [] },
  deepseek:{ keys: ["DEEPSEEK_API_KEY"],                               bases: ["DEEPSEEK_BASE_URL"] },
  kimi:    { keys: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],               bases: ["KIMI_BASE_URL", "MOONSHOT_BASE_URL"] },
  qwen:    { keys: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"],              bases: ["QWEN_BASE_URL", "DASHSCOPE_BASE_URL"] },
  glm:     { keys: ["GLM_API_KEY", "ZHIPUAI_API_KEY", "BIGMODEL_API_KEY"], bases: ["GLM_BASE_URL", "ZHIPUAI_BASE_URL"] },
  grok:    { keys: ["XAI_API_KEY", "GROK_API_KEY"],                    bases: ["XAI_BASE_URL", "GROK_BASE_URL"] },
  doubao:  { keys: ["ARK_API_KEY", "DOUBAO_API_KEY", "VOLCENGINE_API_KEY"], bases: ["ARK_BASE_URL", "DOUBAO_BASE_URL"] },
  gemini:  { keys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],                bases: [] },
  mimo:    { keys: ["MIMO_API_KEY"],                                    bases: ["MIMO_BASE_URL", "XIAOMI_BASE_URL"] },
  openrouter: { keys: ["OPENROUTER_API_KEY"],                           bases: ["OPENROUTER_BASE_URL"] },
  minimax: { keys: ["MINIMAX_API_KEY"],                                 bases: ["MINIMAX_BASE_URL"] },
  ollama:  { keys: ["OLLAMA_API_KEY"],                                  bases: ["OLLAMA_BASE_URL"] },
};

/**
 * Resolve API key for a provider from env + runtime overrides.
 * @param {string} alias
 * @param {BarkConfig} cfg
 * @returns {string}
 */
export function resolveApiKey(alias, cfg) {
  // Runtime override (from send frame) has highest priority.
  if (cfg.apiKey && cfg.apiKeyEnv) {
    process.env[cfg.apiKeyEnv] = cfg.apiKey;
    return cfg.apiKey;
  }
  // Fall through to env.
  const map = PROVIDER_ENV_MAP[alias];
  if (!map) return "";
  for (const key of map.keys) {
    const val = process.env[key];
    if (val) return val;
  }
  return "";
}

/**
 * Resolve base URL for a provider from env + runtime overrides.
 * @param {string} alias
 * @returns {string}
 */
export function resolveBaseUrl(alias) {
  const map = PROVIDER_ENV_MAP[alias];
  if (!map) return "";
  for (const key of map.bases) {
    const val = process.env[key];
    if (val) return val;
  }
  return "";
}
