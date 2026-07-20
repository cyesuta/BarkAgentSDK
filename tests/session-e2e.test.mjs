import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkClient } from '../client/BarkClient.mjs';
import { registerProvider } from '../providers/registry.mjs';
import { TurnSummary } from '../protocol/packets.mjs';

registerProvider('mock-e2e', 'Mock E2E', async (_cfg, signal, onEvent, messages) => {
  if (signal.aborted) return new TurnSummary({ ok: false, fault: 'aborted' });

  const last = messages.at(-1);
  if (last?.role === 'tool') {
    onEvent('text', `final:${last.content}`);
    messages.push({ role: 'assistant', content: `final:${last.content}` });
    return new TurnSummary({ ok: true, tokensIn: 7, tokensOut: 11, tokensCache: 2 });
  }

  onEvent('reason', 'thinking');
  onEvent('text', 'requesting-tool');
  messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [{
      id: 'call_echo',
      type: 'function',
      function: { name: 'echo', arguments: JSON.stringify({ text: 'ok' }) },
    }],
  });
  return new TurnSummary({ ok: true, tokensIn: 3, tokensOut: 5 });
});

test('BarkClient Session.send runs an end-to-end mocked tool turn', async () => {
  const clientEvents = [];
  const client = new BarkClient({ provider: 'mock-e2e', builtinTools: false });
  client.registerTool({
    name: 'echo',
    description: 'Echo text',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    handler: async ({ text }) => `echo:${text}`,
  });
  client.on('text', (event) => clientEvents.push(['text', event.text]));
  client.on('tool_use', (event) => clientEvents.push(['tool_use', event.tool.name]));
  client.on('tool_result', (event) => clientEvents.push(['tool_result', event.result.output]));
  client.on('done', (event) => clientEvents.push(['done', event.stats.ok]));

  const session = client.session({ cwd: process.cwd(), sessionId: 'mock-e2e-session' });
  const callbacks = [];
  const result = await session.send('run mocked turn', {
    onText: (text) => callbacks.push(['text', text]),
    onThinking: (text) => callbacks.push(['thinking', text]),
    onToolUse: (tool) => callbacks.push(['tool_use', tool.name]),
    onToolResult: (toolResult) => callbacks.push(['tool_result', toolResult.output]),
    onDone: (stats) => callbacks.push(['done', stats.ok]),
  });

  assert.equal(result.ok, true);
  assert.equal(result.tokensIn, 10);
  assert.equal(result.tokensOut, 16);
  assert.equal(result.tokensCache, 2);
  assert.equal(result.numTurns, 2);
  assert.equal(result.usageAvailable, true);
  assert.deepEqual(result.usage.turn, {
    scope: 'turn',
    inputTokens: 8,
    totalInputTokens: 10,
    outputTokens: 16,
    cacheReadTokens: 2,
    cacheCreationTokens: 0,
    cost: result.cost,
    modelCalls: 2,
    available: true,
  });
  assert.equal(result.sessionId, 'mock-e2e-session');
  assert.deepEqual(callbacks, [
    ['thinking', 'thinking'],
    ['text', 'requesting-tool'],
    ['tool_use', 'echo'],
    ['tool_result', 'echo:ok'],
    ['text', 'final:echo:ok'],
    ['done', true],
  ]);
  assert.deepEqual(clientEvents, [
    ['text', 'requesting-tool'],
    ['tool_use', 'echo'],
    ['tool_result', 'echo:ok'],
    ['text', 'final:echo:ok'],
    ['done', true],
  ]);
  assert.equal(session.getHistory().at(-1).content, 'final:echo:ok');

  await session.reset();
  assert.deepEqual(session.getHistory(), []);
  client.destroy();
});

test('Session usage is scoped to each send and never accumulates across sends', async () => {
  registerProvider('mock-usage-scope', 'Mock Usage Scope', async (_cfg, _signal, _onEvent, messages) => {
    messages.push({ role: 'assistant', content: 'ok' });
    return new TurnSummary({ ok: true, tokensIn: 9, tokensOut: 4, tokensCache: 3 });
  });
  const client = new BarkClient({ provider: 'mock-usage-scope', builtinTools: false });
  const session = client.session({ cwd: process.cwd(), sessionId: 'mock-usage-scope' });

  const first = await session.send('first');
  const second = await session.send('second');

  assert.equal(first.usage.turn.scope, 'turn');
  assert.equal(first.usage.turn.totalInputTokens, 9);
  assert.equal(first.usage.turn.inputTokens, 6);
  assert.equal(first.usage.turn.cacheReadTokens, 3);
  assert.equal(first.usage.turn.outputTokens, 4);
  assert.equal(first.usage.turn.modelCalls, 1);
  assert.equal(second.usage.turn.totalInputTokens, 9);
  assert.equal(second.usage.turn.inputTokens, 6);
  assert.equal(second.usage.turn.cacheReadTokens, 3);
  assert.equal(second.usage.turn.outputTokens, 4);
  assert.equal(second.usage.turn.modelCalls, 1);

  client.destroy();
});
