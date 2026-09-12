import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildThreadStartParams,
  buildTurnStartParams,
  resolveCodexSpawn,
} from '../providers/codex.mjs';
import { TurnSummary } from '../protocol/packets.mjs';

test('Codex spawn supports an executable path containing spaces', () => {
  assert.deepEqual(resolveCodexSpawn({
    BARK_SERVER_EXECUTABLE: 'C:\\Program Files\\BarkIDE\\codex.exe',
    BARK_SERVER_ARGS_JSON: '["app-server","--disable","browser_use"]',
  }, 'win32'), {
    executable: 'C:\\Program Files\\BarkIDE\\codex.exe',
    args: ['app-server', '--disable', 'browser_use'],
  });
});

test('Codex spawn retains the platform default', () => {
  assert.deepEqual(resolveCodexSpawn({}, 'win32'), {
    executable: 'codex.cmd',
    args: ['app-server', '--listen', 'stdio://'],
  });
});

test('Codex spawn rejects malformed argument JSON', () => {
  assert.throws(() => resolveCodexSpawn({
    BARK_SERVER_EXECUTABLE: 'codex',
    BARK_SERVER_ARGS_JSON: '{"not":"an array"}',
  }), /JSON string array/);
});

test('Codex app-server requests use the current thread and turn schemas', () => {
  assert.deepEqual(buildThreadStartParams({ workspace: 'C:\\work', guidance: 'Be useful' }), {
    cwd: 'C:\\work',
    skipGitRepoCheck: true,
    sandbox: { 'workspace-write': null },
    approvalPolicy: 'never',
    developerInstructions: 'Be useful',
  });
  assert.deepEqual(buildTurnStartParams('thread-1', 'hello', { variant: 'gpt-5.5' }), {
    threadId: 'thread-1',
    input: [{ type: 'text', text: 'hello' }],
    model: 'gpt-5.5',
  });
});

test('TurnSummary preserves Runtime usage metadata', () => {
  const summary = new TurnSummary({
    tokensIn: 10,
    tokensOut: 4,
    tokensCache: 7,
    tokensCacheWrite: 3,
    durationMs: 1250,
  });
  assert.equal(summary.tokensCacheWrite, 3);
  assert.equal(summary.durationMs, 1250);
});
