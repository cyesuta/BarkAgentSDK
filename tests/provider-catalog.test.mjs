import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_MODELS, listProviderModels } from '../providers/catalog.mjs';

test('OpenRouter catalog includes Stealth OX Alpha', () => {
  assert.ok(OPENROUTER_MODELS.some((model) => model.id === 'stealth/ox-alpha'));
  for (const id of [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3.5-lightning:free',
    'z-ai/glm-5.2:free',
    'google/gemma-4-31b-it:free',
  ]) assert.ok(OPENROUTER_MODELS.some((model) => model.id === id));
  assert.equal(listProviderModels('openrouter'), OPENROUTER_MODELS);
  assert.deepEqual(listProviderModels('unknown'), []);
});
