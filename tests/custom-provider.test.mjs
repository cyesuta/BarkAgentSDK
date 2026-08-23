import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkConfig } from '../core/config.mjs';
import { runOpenAICompat } from '../providers/openai-compat.mjs';
import { providerRegistered } from '../client/providers.mjs';
import { runCustom } from '../providers/custom.mjs';

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

test('custom OpenAI format sends the explicit thinking state', async (t) => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  for (const allowThinking of [false, true]) {
    const result = await runCustom(
      new BarkConfig({ channel: 'custom', apiFormat: 'openai', endpoint: 'https://example.invalid/v1/chat/completions', variant: 'custom-model', apiKey: 'test-only', allowThinking }),
      new AbortController().signal,
      () => {},
      [{ role: 'user', content: 'hello' }],
      [],
    );
    assert.equal(result.ok, true);
  }
  assert.deepEqual(bodies.map((body) => body.enable_thinking), [false, true]);
});

test('custom Anthropic format converts messages, tools, stream and usage', async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    const events = [
      { type: 'message_start', message: { usage: { input_tokens: 12, cache_read_input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":"a.txt"}' } },
      { type: 'message_delta', usage: { output_tokens: 7 } },
      { type: 'message_stop' },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
    return new Response(events, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  const messages = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'question' },
  ];
  const emitted = [];
  const result = await runCustom(
    new BarkConfig({ channel: 'custom', apiFormat: 'anthropic', endpoint: 'https://example.invalid/v1/messages', variant: 'custom-model', apiKey: 'test-only' }),
    new AbortController().signal,
    (type, data) => emitted.push([type, data]),
    messages,
    [{ type: 'function', function: { name: 'Read', description: 'read', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }],
  );
  assert.equal(request.url, 'https://example.invalid/v1/messages');
  assert.equal(request.options.headers['x-api-key'], 'test-only');
  assert.equal(request.options.headers['anthropic-version'], '2023-06-01');
  assert.equal(request.body.system, 'system prompt');
  assert.equal(request.body.tools[0].input_schema.properties.path.type, 'string');
  assert.deepEqual(emitted, [['text', 'hello']]);
  assert.equal(result.ok, true);
  assert.equal(result.tokensIn, 17);
  assert.equal(result.tokensCache, 5);
  assert.equal(result.tokensOut, 7);
  assert.equal(messages.at(-1).tool_calls[0].function.arguments, '{"path":"a.txt"}');
});

test('custom Anthropic format sends the explicit thinking state', async (t) => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response('data: {"type":"message_stop"}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  for (const allowThinking of [false, true]) {
    const result = await runCustom(
      new BarkConfig({ channel: 'custom', apiFormat: 'anthropic', endpoint: 'https://example.invalid/v1/messages', variant: 'custom-model', apiKey: 'test-only', allowThinking }),
      new AbortController().signal,
      () => {},
      [{ role: 'user', content: 'hello' }],
      [],
    );
    assert.equal(result.ok, true);
  }
  assert.deepEqual(bodies.map((body) => body.thinking), [
    { type: 'disabled' },
    { type: 'enabled', budget_tokens: 4096 },
  ]);
});

test('custom rejects an unsupported API format', async () => {
  const result = await runCustom(new BarkConfig({ apiFormat: 'other' }), new AbortController().signal, () => {}, [], []);
  assert.equal(result.ok, false);
  assert.match(result.fault, /Unsupported custom API format/);
});
