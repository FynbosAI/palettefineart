import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = readFileSync(path.join(__dirname, '..', 'deadlineCore.ts'), 'utf8');
const { outputText } = transpileModule(source, {
  compilerOptions: {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});

const moduleExports = {};
const moduleObject = { exports: moduleExports };
const localRequire = () => {
  throw new Error('Unexpected require in deadlineCore.test.js');
};
const wrapped = new Function('exports', 'require', 'module', '__filename', '__dirname', outputText);
wrapped(moduleObject.exports, localRequire, moduleObject, path.join(__dirname, '..', 'deadlineCore.ts'), path.join(__dirname, '..'));

const { computeDeadlineState } = moduleObject.exports;

const baseNow = new Date('2025-09-29T12:00:00Z').getTime();

describe('computeDeadlineState', () => {
  it('returns manual close messaging when auto close is disabled', () => {
    const state = computeDeadlineState(null, { manualClose: true, now: baseNow });
    assert.equal(state.label, 'Manual close');
    assert.equal(state.urgency, 'none');
    assert.equal(state.isExpired, false);
  });

  it('flags past deadlines as expired', () => {
    const state = computeDeadlineState('2025-09-28T12:00:00Z', { now: baseNow });
    assert.equal(state.isExpired, true);
    assert.equal(state.label, 'Bidding closed');
    assert.equal(state.urgency, 'expired');
  });

  it('describes deadlines more than a day out in days', () => {
    const state = computeDeadlineState('2025-10-02T12:00:00Z', { now: baseNow });
    assert.equal(state.label, '3 days left');
    assert.equal(state.urgency, 'normal');
  });

  it('switches to hours when under 24 hours remain', () => {
    const state = computeDeadlineState('2025-09-30T06:00:00Z', { now: baseNow });
    assert.equal(state.label, '18 hours left');
    assert.equal(state.urgency, 'warning');
  });

  it('switches to minutes when under an hour remains', () => {
    const state = computeDeadlineState('2025-09-29T12:20:00Z', { now: baseNow });
    assert.equal(state.label, '20 minutes left');
    assert.equal(state.urgency, 'critical');
  });

  it('returns open messaging when no deadline provided', () => {
    const state = computeDeadlineState(null, { now: baseNow });
    assert.equal(state.label, 'Open');
    assert.equal(state.urgency, 'none');
  });

  it('uses invalid copy when date parse fails', () => {
    const state = computeDeadlineState('not-a-real-date', { now: baseNow });
    assert.equal(state.label, 'Invalid deadline');
  });
});
