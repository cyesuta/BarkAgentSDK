import test from 'node:test';
import assert from 'node:assert/strict';
import { CODEX_MODELS, DEEPSEEK_MODELS, GLM_MODELS, OPENROUTER_MODELS, listProviderModels } from '../providers/catalog.mjs';

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

test('provider catalogs expose current DeepSeek and Z.AI Coding Plan models', () => {
  assert.deepEqual(DEEPSEEK_MODELS.map((model) => model.id), ['deepseek-flash']);
  assert.equal(DEEPSEEK_MODELS[0].supportsVision, true);
  assert.deepEqual(GLM_MODELS.map((model) => model.id), [
    'glm-5.3',
    'glm-5.3-flash',
    'glm-5.1',
    'glm-5-turbo',
    'glm-4.7',
    'glm-4.5-air',
  ]);
  assert.deepEqual(GLM_MODELS[0], {
    id: 'glm-5.3', displayName: 'GLM-5.3', contextWindow: 1_000_000,
    maxOutputTokens: 128_000, supportsVision: false, supportsThinking: true,
    reasoningEfforts: ['low', 'high', 'max'],
  });
  assert.equal(GLM_MODELS[1].supportsVision, true);
  assert.equal(listProviderModels('deepseek'), DEEPSEEK_MODELS);
  assert.equal(listProviderModels('glm'), GLM_MODELS);
});
