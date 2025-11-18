import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampSupportedCurrency,
  convertAmount,
  formatCurrencyValue
} from '../currency';

const sampleRates = {
  base: 'USD' as const,
  rates: {
    USD: 1,
    EUR: 0.89,
    GBP: 0.76
  },
  fetchedAt: new Date().toISOString(),
  source: 'hexarate' as const
};

test('clampSupportedCurrency normalises values', () => {
  assert.equal(clampSupportedCurrency('usd'), 'USD');
  assert.equal(clampSupportedCurrency('GBP'), 'GBP');
  assert.equal(clampSupportedCurrency('aud'), 'USD');
});

test('convertAmount converts USD amounts to target', () => {
  assert.equal(convertAmount(200, 'EUR', sampleRates), 178);
  assert.equal(convertAmount(50, 'GBP', sampleRates), 38);
});

test('formatCurrencyValue emits formatted strings with correct numeric value', () => {
  const formatted = formatCurrencyValue(120, 'EUR', sampleRates);
  assert.ok(formatted.includes('€'));
  const numeric = Number.parseFloat(formatted.replace(/[^0-9.,-]/g, '').replace(',', '.'));
  assert.equal(numeric, 106.8);
});
