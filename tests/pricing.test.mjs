import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCharge, pricingTable } from '../pricing/table.mjs';

test('computeCharge returns zero for unknown provider/model', () => {
  assert.equal(computeCharge('missing', 'missing', 1000, 1000, 0), 0);
});

test('GLM-5.3 models use official Z.AI Global USD pricing', () => {
  assert.deepEqual(pricingTable('glm', 'glm-5.3'), [1.4, 4.4, 0.26, false]);
  assert.deepEqual(pricingTable('glm', 'glm-5.3-flash'), [0.15, 0.5, 0.03, false]);
});

test('computeCharge returns a non-negative number for known provider', () => {
  const cost = computeCharge('deepseek', 'deepseek-v4-flash', 1000, 1000, 0);
  assert.equal(typeof cost, 'number');
  assert.equal(cost >= 0, true);
});
