import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkConfig } from '../core/config.mjs';
import { runOpenAICompat } from '../providers/openai-compat.mjs';

function sseText(text) {
  return new Response([
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

test('OpenRouter retries an empty tool response once without tools', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const bodies = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });
  process.env.OPENROUTER_API_KEY = 'test-only';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    return bodies.length === 1
      ? new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      : sseText('fallback-ok');
  };
  const emitted = [];
  const messages = [{ role: 'user', content: 'hello' }];
  const result = await runOpenAICompat(
    'openrouter',
    new BarkConfig({ channel: 'openrouter', variant: 'stealth/ox-alpha' }),
    new AbortController().signal,
    (type, data) => emitted.push([type, data]),
    messages,
    [{ type: 'function', function: { name: 'Read', parameters: { type: 'object' } } }],
  );
  assert.equal(result.ok, true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].tools.length, 1);
  assert.equal('tools' in bodies[1], false);
  assert.deepEqual(emitted, [['text', 'fallback-ok']]);
  assert.equal(messages.at(-1).content, 'fallback-ok');
});

test('empty OpenRouter response without tools is an explicit failure', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });
  process.env.OPENROUTER_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response('data: [DONE]\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
  const result = await runOpenAICompat(
    'openrouter',
    new BarkConfig({ channel: 'openrouter', variant: 'stealth/ox-alpha' }),
    new AbortController().signal,
    () => {},
    [{ role: 'user', content: 'hello' }],
    [],
  );
  assert.equal(result.ok, false);
  assert.match(result.fault, /EMPTY_RESPONSE/);
});
