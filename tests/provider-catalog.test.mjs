import test from 'node:test';
import assert from 'node:assert/strict';
import { CODEX_MODELS, OPENROUTER_MODELS, listProviderModels } from '../providers/catalog.mjs';

test('Codex catalog includes the official GPT-6 Astra model metadata', () => {
  const astra = CODEX_MODELS.find((model) => model.id === 'gpt-6-astra');
  assert.deepEqual(astra, {
    id: 'gpt-6-astra',
    displayName: 'GPT-6 Astra',
    contextWindow: 1_050_000,
    maxInputTokens: 922_000,
    maxOutputTokens: 128_000,
    supportsVision: true,
    supportsThinking: true,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  });
  assert.equal(listProviderModels('codex'), CODEX_MODELS);
});

test('OpenRouter catalog includes Stealth OX Alpha', () => {
  assert.ok(OPENROUTER_MODELS.some((model) => model.id === 'stealth/ox-alpha'));
  for (const id of [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3.5-lightning:free',
    'z-ai/glm-5.2:free',
    'google/gemma-4-31b-it:free',
    'cohere/north-mini-code:free',
    'poolside/laguna-s-2.1:free',
    'poolside/laguna-xs-2.1:free',
  ]) assert.ok(OPENROUTER_MODELS.some((model) => model.id === id));
  assert.equal(listProviderModels('openrouter'), OPENROUTER_MODELS);
  assert.deepEqual(listProviderModels('unknown'), []);
});
