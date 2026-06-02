import test from 'node:test';
import assert from 'node:assert/strict';
import { obtainVault, dropVault, vaults } from '../core/vault.mjs';

test('obtainVault reuses vaults by id and dropVault removes them', () => {
  const id = `test-${Date.now()}`;
  const a = obtainVault(id);
  const b = obtainVault(id);
  assert.equal(a, b);
  assert.equal(vaults.has(id), true);
  dropVault(id);
  assert.equal(vaults.has(id), false);
});