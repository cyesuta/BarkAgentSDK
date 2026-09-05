import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodexSpawn } from '../providers/codex.mjs';

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
