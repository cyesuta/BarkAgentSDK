/**
 * BarkSDK — Generic OpenAI-compatible provider runner
 *
 * Used by: Pine (Kimi), Reed (Qwen), Elm (GLM), Oak (Grok), Bamboo (Doubao)
 * All share the same streaming chat completions API shape.
 */

import { TurnSummary } from "../protocol/packets.mjs";
import { parseOpenAIStream } from "./deepseek.mjs";

const OPENAI_DEFAULTS = {
  kimi:   { endpoint: "https://api.moonshot.cn/v1/chat/completions",   model: "kimi-k2.6" },
  qwen:   { endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus" },
  glm:    { endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-5.1" },
  grok:   { endpoint: "https://api.x.ai/v1/chat/completions",          model: "grok-4.3" },
  doubao: { endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "doubao-seed-2-0-pro-260215" },
  mimo:   { endpoint: "https://api.xiaomimimo.com/v1/chat/completions", model: "mimo-v2.5" },
  openrouter: { endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "openrouter/auto" },
  minimax: { endpoint: "https://api.minimax.io/v1/chat/completions", model: "MiniMax-M2.7" },
  ollama: { endpoint: "http://localhost:11434/v1/chat/completions",     model: "gemma4:e2b" },
};

const ENV_KEY_MAP = {
  kimi:   ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
  qwen:   ["QWEN_API_KEY", "DASHSCOPE_API_KEY"],
  glm:    ["GLM_API_KEY", "ZHIPUAI_API_KEY", "BIGMODEL_API_KEY"],
  grok:   ["XAI_API_KEY", "GROK_API_KEY"],
  doubao: ["ARK_API_KEY", "DOUBAO_API_KEY", "VOLCENGINE_API_KEY"],
  mimo:   ["MIMO_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
};

const ENV_ENDPOINT_MAP = {
  kimi:   "KIMI_BASE_URL",
  qwen:   "QWEN_BASE_URL",
  glm:    "GLM_BASE_URL",
  grok:   "XAI_BASE_URL",
  doubao: "ARK_BASE_URL",
  mimo:   "MIMO_BASE_URL",
  openrouter: "OPENROUTER_BASE_URL",
  minimax: "MINIMAX_BASE_URL",
  ollama: "OLLAMA_BASE_URL",
};

/**
 * Run a generic OpenAI-compatible provider turn.
 * @param {string} alias
 * @param {import("../core/config.mjs").BarkConfig} cfg
 * @param {AbortSignal} signal
 * @param {function} onEvent
 * @param {Array} messages
 * @param {Array} [tools]
 * @returns {Promise<TurnSummary>}
 */
export async function runOpenAICompat(alias, cfg, signal, onEvent, messages, tools) {
  const defaults = OPENAI_DEFAULTS[alias];
  if (!defaults) {
    return new TurnSummary({ ok: false, fault: `Unknown OpenAI-compat alias: ${alias}` });
  }

  // Resolve API key
  const keyEnvNames = ENV_KEY_MAP[alias];
  let apiKey = cfg.apiKey || "";
  for (const envName of keyEnvNames) {
    if (!apiKey && process.env[envName]) { apiKey = process.env[envName]; break; }
  }
  // Providers like Ollama (local) have no required API key — skip auth if empty.
  if (!apiKey && alias !== "ollama") {
    return new TurnSummary({ ok: false, fault: `${alias} API key not set (tried: ${keyEnvNames.join(", ")})` });
  }

  // Resolve endpoint
  const envEndpoint = process.env[ENV_ENDPOINT_MAP[alias]];
  const baseUrl = cfg.endpoint || envEndpoint || defaults.endpoint;

  const body = {
    model: cfg.variant || defaults.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  if (alias === "minimax" && cfg.allowThinking) {
    body.reasoning_split = true;
  }

  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (alias === "openrouter") {
      headers["HTTP-Referer"] = "https://barkide.local";
      headers["X-Title"] = "BarkIDE";
    }

    const resp = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new TurnSummary({ ok: false, fault: `${alias} HTTP ${resp.status}: ${errText.slice(0, 300)}` });
    }

    return await parseOpenAIStream(resp, onEvent, messages);
  } catch (err) {
    if (err.name === "AbortError") {
      return new TurnSummary({ ok: false, fault: "aborted" });
    }
    return new TurnSummary({ ok: false, fault: `${alias} error: ${err.message}` });
  }
}
