import test from 'node:test';
import assert from 'node:assert/strict';
import { defineAction, buildActionHub } from '../tools/action.mjs';

test('defineAction and dispatch happy path', async () => {
  const action = defineAction('echo', 'Echo text', {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  }, async ({ text }) => text);
  const hub = buildActionHub([action]);
  assert.equal(hub.tools[0].function.name, 'echo');
  assert.deepEqual(await hub.dispatch('echo', { text: 'ok' }), { outcome: 'ok', failed: false });
});

test('dispatch unknown action returns failed outcome', async () => {
  const hub = buildActionHub([]);
  const result = await hub.dispatch('missing', {});
  assert.equal(result.failed, true);
  assert.match(result.outcome, /Unknown action/);
});