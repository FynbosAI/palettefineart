import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import CurrencyService from '../dist/src/services/currency/CurrencyService.js';

const createSupabaseMock = (selectQueue = []) => {
  const upsertCalls = [];

  return {
    supabaseAdmin: {
      from: mock.fn(() => ({
        upsert: async (payload) => {
          upsertCalls.push(payload);
          return { error: null };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => selectQueue.shift() ?? { data: null, error: null }
          })
        })
      }))
    },
    upsertCalls
  };
};

const buildHexResponse = (target, rate) => ({
  status_code: 200,
  data: {
    base: 'USD',
    target,
    mid: rate,
    unit: 1,
    timestamp: new Date().toISOString()
  }
});

const buildFallbackResponse = (rates) => ({
  result: 'success',
  rates
});

test('CurrencyService caches Hexarate results and persists them', async () => {
  const selectQueue = [{ data: null, error: null }];
  const { supabaseAdmin, upsertCalls } = createSupabaseMock(selectQueue);

  let fetchCount = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
    fetchCount += 1;
    if (url.includes('GBP')) {
      return {
        ok: true,
        json: async () => buildHexResponse('GBP', 0.78)
      };
    }
    if (url.includes('EUR')) {
      return {
        ok: true,
        json: async () => buildHexResponse('EUR', 0.92)
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  CurrencyService.__setSupabaseAdminForTests(supabaseAdmin);
  CurrencyService.__clearCacheForTests();

  const first = await CurrencyService.getRates();
  assert.equal(first.source, 'hexarate');
  assert.equal(first.rates.GBP, 0.78);
  assert.equal(first.rates.EUR, 0.92);
  assert.equal(fetchCount, 2, 'fetch called once per target');
  assert.equal(upsertCalls.length, 1, 'rates persisted to app_config');

  fetchMock.mock.restore();
  const second = await CurrencyService.getRates();
  assert.equal(second, first, 'cached instance reused');

  CurrencyService.__clearCacheForTests();
  CurrencyService.__setSupabaseAdminForTests(null);
});

test('CurrencyService falls back to secondary provider when Hexarate fails', async () => {
  const selectQueue = [{ data: null, error: null }];
  const { supabaseAdmin, upsertCalls } = createSupabaseMock(selectQueue);

  const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('hexarate')) {
      throw new Error('hexarate down');
    }
    if (url.includes('open.er-api.com')) {
      return {
        ok: true,
        json: async () => buildFallbackResponse({ EUR: 0.9, GBP: 0.8 })
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  CurrencyService.__setSupabaseAdminForTests(supabaseAdmin);
  CurrencyService.__clearCacheForTests();

  const result = await CurrencyService.getRates();
  assert.equal(result.source, 'fallback');
  assert.equal(result.rates.EUR, 0.9);
  assert.equal(result.rates.GBP, 0.8);
  assert.equal(upsertCalls.length, 1, 'fallback rates persisted');

  fetchMock.mock.restore();
  CurrencyService.__clearCacheForTests();
  CurrencyService.__setSupabaseAdminForTests(null);
});

test('CurrencyService surfaces cached rates when providers fail', async () => {
  const cachedRates = {
    base: 'USD',
    rates: { USD: 1, EUR: 0.87, GBP: 0.74 },
    fetchedAt: new Date().toISOString(),
    source: 'hexarate'
  };
  const selectQueue = [{ data: { value: cachedRates }, error: null }];
  const { supabaseAdmin } = createSupabaseMock(selectQueue);

  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('network outage');
  });

  CurrencyService.__setSupabaseAdminForTests(supabaseAdmin);
  CurrencyService.__clearCacheForTests();

  const result = await CurrencyService.getRates();
  assert.equal(result.source, 'cache');
  assert.equal(result.rates.GBP, 0.74);

  fetchMock.mock.restore();
  CurrencyService.__clearCacheForTests();
  CurrencyService.__setSupabaseAdminForTests(null);
});
