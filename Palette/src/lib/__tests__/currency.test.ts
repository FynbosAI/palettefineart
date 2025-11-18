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
    EUR: 0.91,
    GBP: 0.78
  },
  fetchedAt: new Date().toISOString(),
  source: 'hexarate' as const
};

test('clampSupportedCurrency normalises arbitrary values', () => {
  assert.equal(clampSupportedCurrency('eur'), 'EUR');
  assert.equal(clampSupportedCurrency('gbp'), 'GBP');
  assert.equal(clampSupportedCurrency('jpy'), 'USD');
  assert.equal(clampSupportedCurrency(null), 'USD');
});

test('convertAmount applies target currency rate from USD base', () => {
  const amount = convertAmount(100, 'EUR', sampleRates);
  assert.equal(amount, 91);

  const gbpAmount = convertAmount(250, 'GBP', sampleRates);
  assert.equal(gbpAmount, 195);
});

test('formatCurrencyValue produces locale aware strings', () => {
  const formatted = formatCurrencyValue(150, 'EUR', sampleRates, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  assert.ok(formatted.includes('€'));

  const numericPortion = Number.parseFloat(formatted.replace(/[^0-9.,-]/g, '').replace(',', '.'));
  assert.equal(numericPortion, 136.5);

  const gbpFormatted = formatCurrencyValue(75.5, 'GBP', sampleRates);
  assert.ok(gbpFormatted.includes('£'));
});
