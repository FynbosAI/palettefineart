import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { AuthService } from '../../lib/supabase';
import currencyApi from '../../lib/api/currency';

const ensureDomStorage = () => {
  const createStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      }
    };
  };

  const globalObj = globalThis as any;
  if (typeof globalObj.localStorage === 'undefined') {
    Object.defineProperty(globalObj, 'localStorage', {
      value: createStorage(),
      writable: false,
      configurable: true
    });
  }
  if (typeof globalObj.sessionStorage === 'undefined') {
    Object.defineProperty(globalObj, 'sessionStorage', {
      value: createStorage(),
      writable: false,
      configurable: true
    });
  }
};

ensureDomStorage();

const { default: useSupabaseStore } = await import('../useSupabaseStore');

const resetStoreFields = (fields: Partial<ReturnType<typeof useSupabaseStore.getState>>) => {
  useSupabaseStore.setState(fields);
};

test('updateCurrencyPreference persists selection via AuthService', async () => {
  const originalState = useSupabaseStore.getState();
  resetStoreFields({
    user: { id: 'user-1' } as any,
    profile: { id: 'user-1', preferred_currency: 'USD' } as any,
    currencyPreference: 'USD'
  });

  const updateMock = mock.method(AuthService, 'updateProfile', async () => ({
    data: { id: 'user-1', preferred_currency: 'EUR' } as any,
    error: null
  }));

  await useSupabaseStore.getState().updateCurrencyPreference('EUR');

  assert.equal(useSupabaseStore.getState().currencyPreference, 'EUR');
  assert.equal(useSupabaseStore.getState().profile?.preferred_currency, 'EUR');
  assert.equal(updateMock.mock.callCount(), 1);

  updateMock.mock.restore();
  resetStoreFields({
    user: originalState.user,
    profile: originalState.profile,
    currencyPreference: originalState.currencyPreference
  });
});

test('updateCurrencyPreference restores previous state when update fails', async () => {
  const originalState = useSupabaseStore.getState();
  resetStoreFields({
    user: { id: 'user-2' } as any,
    profile: { id: 'user-2', preferred_currency: 'USD' } as any,
    currencyPreference: 'USD',
    error: null
  });

  const updateMock = mock.method(AuthService, 'updateProfile', async () => ({
    data: null,
    error: new Error('write failed')
  }));

  await assert.rejects(() => useSupabaseStore.getState().updateCurrencyPreference('GBP'), /write failed/);
  assert.equal(useSupabaseStore.getState().currencyPreference, 'USD');
  assert.equal(useSupabaseStore.getState().error, 'write failed');

  updateMock.mock.restore();
  resetStoreFields({
    user: originalState.user,
    profile: originalState.profile,
    currencyPreference: originalState.currencyPreference,
    error: originalState.error
  });
});

test('fetchCurrencyRates updates store with latest rates', async () => {
  const originalState = useSupabaseStore.getState();
  const fetchMock = mock.method(currencyApi, 'fetchLatestCurrencyRates', async () => ({
    base: 'USD',
    rates: { USD: 1, EUR: 0.95, GBP: 0.8 },
    fetchedAt: '2025-10-15T17:11:00.000Z',
    source: 'hexarate'
  }));

  await useSupabaseStore.getState().fetchCurrencyRates(true);

  const state = useSupabaseStore.getState();
  assert.equal(state.currencyRates.rates.EUR, 0.95);
  assert.equal(state.currencyRatesLoading, false);
  assert.equal(state.currencyRatesError, null);
  assert.equal(fetchMock.mock.callCount(), 1);

  fetchMock.mock.restore();
  resetStoreFields({
    currencyRates: originalState.currencyRates,
    currencyRatesLoading: originalState.currencyRatesLoading,
    currencyRatesError: originalState.currencyRatesError
  });
});

test('fetchCurrencyRates records errors from provider', async () => {
  const originalState = useSupabaseStore.getState();
  const fetchMock = mock.method(currencyApi, 'fetchLatestCurrencyRates', async () => {
    throw new Error('provider offline');
  });

  await assert.rejects(() => useSupabaseStore.getState().fetchCurrencyRates(true), /provider offline/);

  const state = useSupabaseStore.getState();
  assert.equal(state.currencyRatesLoading, false);
  assert.equal(state.currencyRatesError, 'provider offline');

  fetchMock.mock.restore();
  resetStoreFields({
    currencyRatesError: originalState.currencyRatesError,
    currencyRatesLoading: originalState.currencyRatesLoading
  });
});
