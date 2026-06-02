import { registerProvider, hasProvider } from '../providers/registry.mjs';
import { runDeepseek } from '../providers/deepseek.mjs';
import { runOpenAICompat } from '../providers/openai-compat.mjs';
import { runGemini } from '../providers/gemini.mjs';
import { runCodex } from '../providers/codex.mjs';

let registered = false;

export function ensureDefaultProviders() {
  if (registered) return;

  registerProvider('codex', 'Codex / ChatGPT OAuth', runCodex);
  registerProvider('deepseek', 'DeepSeek', runDeepseek);
  registerProvider('kimi', 'Kimi (Moonshot)', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('kimi', cfg, sig, onEvt, msgs, tools));
  registerProvider('qwen', 'Qwen (Alibaba)', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('qwen', cfg, sig, onEvt, msgs, tools));
  registerProvider('glm', 'GLM (Zhipu)', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('glm', cfg, sig, onEvt, msgs, tools));
  registerProvider('grok', 'Grok (xAI)', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('grok', cfg, sig, onEvt, msgs, tools));
  registerProvider('doubao', 'Doubao (ByteDance/ARK)', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('doubao', cfg, sig, onEvt, msgs, tools));
  registerProvider('gemini', 'Gemini (Google)', runGemini);
  registerProvider('mimo', 'MiMo (Xiaomi)', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('mimo', cfg, sig, onEvt, msgs, tools));
  registerProvider('openrouter', 'OpenRouter', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('openrouter', cfg, sig, onEvt, msgs, tools));
  registerProvider('minimax', 'MiniMax', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('minimax', cfg, sig, onEvt, msgs, tools));
  registerProvider('ollama', 'Ollama (Local)', (cfg, sig, onEvt, msgs, tools) =>
    runOpenAICompat('ollama', cfg, sig, onEvt, msgs, tools));

  registered = true;
}

export function providerRegistered(alias) {
  ensureDefaultProviders();
  return hasProvider(alias);
}