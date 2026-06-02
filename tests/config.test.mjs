import test from 'node:test';
import assert from 'node:assert/strict';
import { BarkConfig } from '../core/config.mjs';

test('BarkConfig freezes values and copies arrays', () => {
  const abilities = ['a'];
  const cfg = new BarkConfig({ guidance: 'g', workspace: 'w', abilities, allowThinking: true });
  abilities.push('b');
  assert.equal(Object.isFrozen(cfg), true);
  assert.deepEqual(cfg.abilities, ['a']);
  assert.equal(cfg.guidance, 'g');
  assert.equal(cfg.allowThinking, true);
});

test('BarkConfig.with returns a new frozen config', () => {
  const cfg = new BarkConfig({ channel: 'deepseek' });
  const next = cfg.with({ channel: 'gemini' });
  assert.notEqual(cfg, next);
  assert.equal(cfg.channel, 'deepseek');
  assert.equal(next.channel, 'gemini');
  assert.equal(Object.isFrozen(next), true);
});