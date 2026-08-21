import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkConfig } from '../core/config.mjs';
import { runOpenAICompat } from '../providers/openai-compat.mjs';
import { providerRegistered } from '../client/providers.mjs';

test('custom provider is registered by default', () => {
  assert.equal(providerRegistered('custom'), true);
});

test('custom provider requires an explicit endpoint', async () => {
  const result = await runOpenAICompat(
    'custom',
    new BarkConfig({ channel: 'custom', variant: 'my-model', apiKey: 'test-only' }),
    new AbortController().signal,
    () => {},
    [{ role: 'user', content: 'hello' }],
    [],
  );
  assert.equal(result.ok, false);
  assert.match(result.fault, /base URL is required/);
});

test('custom provider requires an explicit model', async () => {
  const result = await runOpenAICompat(
    'custom',
    new BarkConfig({ channel: 'custom', endpoint: 'https://example.invalid/v1/chat/completions', apiKey: 'test-only' }),
    new AbortController().signal,
    () => {},
    [{ role: 'user', content: 'hello' }],
    [],
  );
  assert.equal(result.ok, false);
  assert.match(result.fault, /model name is required/);
});
