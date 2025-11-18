import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal smoke test to ensure backend workspace test harness works in CI
test('palette_backend: basic math holds', () => {
  assert.equal(2 + 2, 4);
});

