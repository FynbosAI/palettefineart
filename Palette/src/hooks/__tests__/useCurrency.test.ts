import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

const { default: useCurrency } = await import('../useCurrency');
const { default: useSupabaseStore } = await import('../../store/useSupabaseStore');

const renderHook = <T,>(hook: () => T): T => {
  let result!: T;
  const TestComponent: React.FC = () => {
    result = hook();
    return null;
  };
  renderToStaticMarkup(React.createElement(TestComponent));
  return result;
};

test('useCurrency reflects store preference and conversion rate', async () => {
  const store = useSupabaseStore.getState();
  const previousPreference = store.currencyPreference;
  const previousRates = store.currencyRates;
  const previousError = store.currencyRatesError;
  const previousLoading = store.currencyRatesLoading;

  const initialHook = renderHook(() => useCurrency());
  assert.equal(initialHook.preferredCurrency, previousPreference);

  useSupabaseStore.setState((state) => ({
    ...state,
    profile: state.profile
      ? { ...state.profile, preferred_currency: 'GBP' }
      : { id: 'test-user', preferred_currency: 'GBP' } as any,
    currencyPreference: 'GBP',
    currencyRates: {
      base: 'USD',
      rates: { USD: 1, EUR: 0.9, GBP: 0.78 },
      fetchedAt: new Date().toISOString(),
      source: 'hexarate'
    },
    currencyRatesError: null,
    currencyRatesLoading: false
  }));

  await Promise.resolve();

  const { convertAmount, formatCurrencyValue } = await import('../../lib/currency');
  const stateSnapshot = useSupabaseStore.getState();
  assert.equal(stateSnapshot.currencyPreference, 'GBP');
  assert.equal(convertAmount(100, 'GBP', stateSnapshot.currencyRates), 78);
  assert.ok(formatCurrencyValue(250, 'GBP', stateSnapshot.currencyRates).includes('£'));

  useSupabaseStore.setState((state) => ({
    ...state,
    profile: state.profile
      ? { ...state.profile, preferred_currency: previousPreference ?? 'USD' }
      : state.profile,
    currencyPreference: previousPreference,
    currencyRates: previousRates,
    currencyRatesError: previousError,
    currencyRatesLoading: previousLoading
  }));
});
