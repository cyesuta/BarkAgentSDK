import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCharge } from '../pricing/table.mjs';

test('computeCharge returns zero for unknown provider/model', () => {
  assert.equal(computeCharge('missing', 'missing', 1000, 1000, 0), 0);
});

test('computeCharge returns a non-negative number for known provider', () => {
  const cost = computeCharge('deepseek', 'deepseek-chat', 1000, 1000, 0);
  assert.equal(typeof cost, 'number');
  assert.equal(cost >= 0, true);
});