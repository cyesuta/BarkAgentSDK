import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_MODELS, listProviderModels } from '../providers/catalog.mjs';

test('OpenRouter catalog includes Stealth OX Alpha', () => {
  assert.ok(OPENROUTER_MODELS.some((model) => model.id === 'stealth/ox-alpha'));
  assert.equal(listProviderModels('openrouter'), OPENROUTER_MODELS);
  assert.deepEqual(listProviderModels('unknown'), []);
});
