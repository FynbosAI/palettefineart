import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import useCurrency from '../useCurrency';
import useShipperStore from '../../store/useShipperStore';

const renderHook = <T,>(hook: () => T): T => {
  let result!: T;
  const TestComponent: React.FC = () => {
    result = hook();
    return null;
  };
  renderToStaticMarkup(<TestComponent />);
  return result;
};

test('useCurrency returns formatter tied to shipper store preference', () => {
  const store = useShipperStore.getState();
  const previousPreference = store.currencyPreference;
  const previousRates = store.currencyRates;
  const previousError = store.currencyRatesError;
  const previousLoading = store.currencyRatesLoading;

  useShipperStore.setState({
    currencyPreference: 'EUR',
    currencyRates: {
      base: 'USD',
      rates: { USD: 1, EUR: 0.88, GBP: 0.75 },
      fetchedAt: new Date().toISOString(),
      source: 'hexarate'
    },
    currencyRatesError: null,
    currencyRatesLoading: false
  });

  const hook = renderHook(() => useCurrency());
  assert.equal(hook.preferredCurrency, 'EUR');
  assert.equal(hook.currencySymbol, '€');
  assert.equal(hook.convertAmount(100), 88);
  assert.ok(hook.formatCurrency(45).includes('€'));

  useShipperStore.setState({
    currencyPreference: previousPreference,
    currencyRates: previousRates,
    currencyRatesError: previousError,
    currencyRatesLoading: previousLoading
  });
});
