import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal smoke test to ensure Node test runner works in CI
test('paletteshipper: basic truthiness', () => {
  assert.equal(true, true);
});

