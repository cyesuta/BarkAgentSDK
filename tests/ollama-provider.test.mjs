import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkConfig } from '../core/config.mjs';
import { runOllama } from '../providers/ollama.mjs';

test('Ollama native adapter sends explicit think false and true', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    const output = [
      { message: { role: 'assistant', thinking: 'reason', content: '' }, done: false },
      { message: { role: 'assistant', content: 'answer' }, done: false },
      { message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 12, eval_count: 7 },
    ].map((item) => JSON.stringify(item)).join('\n') + '\n';
    return new Response(output, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  };

  for (const allowThinking of [false, true]) {
    const messages = [{ role: 'user', content: 'hello' }];
    const events = [];
    const result = await runOllama(
      new BarkConfig({ channel: 'ollama', endpoint: 'http://localhost:11434', variant: 'qwen3.8', allowThinking }),
      new AbortController().signal,
      (type, data) => events.push([type, data]),
      messages,
      [],
    );
    assert.equal(result.ok, true);
    assert.equal(result.tokensIn, 12);
    assert.equal(result.tokensOut, 7);
    assert.deepEqual(events, [['text', 'answer'], ['reason', 'reason']]);
    assert.equal(messages.at(-1).reasoning_content, 'reason');
  }
  assert.deepEqual(requests.map((request) => request.url), [
    'http://localhost:11434/api/chat',
    'http://localhost:11434/api/chat',
  ]);
  assert.deepEqual(requests.map((request) => request.body.think), [false, true]);
});
