import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkConfig } from '../core/config.mjs';
import { normalizeGlmReasoningEffort, runOpenAICompat } from '../providers/openai-compat.mjs';
import { directOpenAIPicturePass, hasNativeVision } from '../tools/vision.mjs';

test('GLM-5.3 maps Bark three-stage thinking to low, high, and max', () => {
  assert.equal(normalizeGlmReasoningEffort({ thinkingLevel: 'normal' }), 'low');
  assert.equal(normalizeGlmReasoningEffort({ thinkingLevel: 'deep' }), 'high');
  assert.equal(normalizeGlmReasoningEffort({ thinkingLevel: 'max' }), 'max');
});

test('only GLM-5.3 Flash uses native OpenAI-compatible image input', () => {
  assert.equal(hasNativeVision('glm', 'glm-5.3'), false);
  assert.equal(hasNativeVision('glm', 'glm-5.3-flash'), true);
  assert.deepEqual(directOpenAIPicturePass('inspect', { image: { mediaType: 'image/png', data: 'YWJj' } }), [
    { type: 'text', text: 'inspect' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJj' } },
  ]);
});

test('GLM-5.3 and Flash always enable reasoning and send the selected effort', async (t) => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  for (const [variant, thinkingLevel] of [['glm-5.3', 'normal'], ['glm-5.3-flash', 'deep'], ['glm-5.3', 'max']]) {
    await runOpenAICompat('glm', new BarkConfig({ variant, thinkingLevel, apiKey: 'test-only' }), new AbortController().signal, () => {}, [{ role: 'user', content: 'hello' }], []);
  }
  assert.deepEqual(bodies.map(({ thinking, reasoning_effort }) => ({ thinking, reasoning_effort })), [
    { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
    { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
    { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
  ]);
});
