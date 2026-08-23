import { TurnSummary } from '../protocol/packets.mjs';
import { runOpenAICompat } from './openai-compat.mjs';
import { runAnthropicCompat } from './anthropic-compat.mjs';
import { runOllama } from './ollama.mjs';

export function runCustom(cfg, signal, onEvent, messages, tools) {
  const format = String(cfg.apiFormat || 'openai').trim().toLowerCase();
  if (format === 'openai') return runOpenAICompat('custom', cfg, signal, onEvent, messages, tools);
  if (format === 'anthropic') return runAnthropicCompat(cfg, signal, onEvent, messages, tools);
  if (format === 'ollama') return runOllama(cfg, signal, onEvent, messages, tools);
  return Promise.resolve(new TurnSummary({ ok: false, fault: `Unsupported custom API format: ${format}` }));
}
