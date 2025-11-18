import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = readFileSync(
  path.join(__dirname, '..', 'changeRequests', 'lineItemDrafts.ts'),
  'utf8'
);

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
  throw new Error('No runtime requires expected in lineItemDrafts');
};
const wrapped = new Function(
  'exports',
  'require',
  'module',
  '__filename',
  '__dirname',
  outputText
);
wrapped(moduleObject.exports, localRequire, moduleObject, __filename, __dirname);

const {
  normalizeBidLineItems,
  calculateDraftTotal,
  diffLineItems,
  roundCurrency,
} = moduleObject.exports;

describe('lineItemDraft helpers', () => {
  it('normalizes numeric fields and clones arrays', () => {
    const normalized = normalizeBidLineItems([
      {
        id: 'a',
        category: 'Packing',
        description: ['Foam', 'Crate'],
        quantity: '2',
        unit_price: '125.5',
        total_amount: undefined,
        is_optional: false,
      },
    ]);

    assert.equal(normalized[0].quantity, 2);
    assert.equal(normalized[0].unit_price, 125.5);
    assert.equal(normalized[0].total_amount, roundCurrency(251));
    assert.notStrictEqual(normalized[0].description, undefined);
    assert.notStrictEqual(normalized[0].description, ['Foam', 'Crate']);
  });

  it('calculates totals with rounding', () => {
    const total = calculateDraftTotal([
      { id: 'a', category: 'Packing', description: [], quantity: 1, unit_price: 10.005, total_amount: 10.01 },
      { id: 'b', category: 'Transit', description: [], quantity: 1, unit_price: 20.335, total_amount: 20.34 },
    ]);
    assert.equal(total, 30.35);
  });

  it('diffs drafts against originals', () => {
    const original = normalizeBidLineItems([
      {
        id: 'line-1',
        category: 'Packing',
        description: ['Foam'],
        quantity: 1,
        unit_price: 100,
        total_amount: 100,
        is_optional: false,
      },
    ]);
    const drafts = normalizeBidLineItems([
      {
        id: 'line-1',
        category: 'Packing',
        description: ['Foam'],
        quantity: 2,
        unit_price: 110,
        total_amount: 220,
        is_optional: true,
      },
    ]);

    const [diff] = diffLineItems(original, drafts);
    assert.equal(diff.hasChanges, true);
    assert.equal(diff.fields.length, 3);
    assert.equal(diff.totalDelta, 120);
  });
});
