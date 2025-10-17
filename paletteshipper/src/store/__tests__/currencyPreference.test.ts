import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import useShipperStore from '../useShipperStore';
import { AuthService } from '../../services/AuthService';
import * as currencyApi from '../../lib/api/currency';

const resetStoreFields = (fields: Partial<ReturnType<typeof useShipperStore.getState>>) => {
  useShipperStore.setState(fields);
};

test('updateCurrencyPreference synchronises with Supabase profile', async () => {
  const originalState = useShipperStore.getState();
  resetStoreFields({
    user: { id: 'shipper-1' } as any,
    profile: { id: 'shipper-1', preferred_currency: 'USD' } as any,
    currencyPreference: 'USD'
  });

  const updateMock = mock.method(AuthService, 'updateProfile', async () => ({
    data: { id: 'shipper-1', preferred_currency: 'GBP' } as any,
    error: null
  }));

  await useShipperStore.getState().updateCurrencyPreference('GBP');
  assert.equal(useShipperStore.getState().currencyPreference, 'GBP');
  assert.equal(useShipperStore.getState().profile?.preferred_currency, 'GBP');
  assert.equal(updateMock.mock.callCount(), 1);

  updateMock.mock.restore();
  resetStoreFields({
    user: originalState.user,
    profile: originalState.profile,
    currencyPreference: originalState.currencyPreference
  });
});

test('updateCurrencyPreference rolls back when Supabase update fails', async () => {
  const originalState = useShipperStore.getState();
  resetStoreFields({
    user: { id: 'shipper-2' } as any,
    profile: { id: 'shipper-2', preferred_currency: 'USD' } as any,
    currencyPreference: 'USD',
    error: null
  });

  const updateMock = mock.method(AuthService, 'updateProfile', async () => ({
    data: null,
    error: new Error('supabase unavailable')
  }));

  await assert.rejects(() => useShipperStore.getState().updateCurrencyPreference('EUR'), /supabase unavailable/);
  assert.equal(useShipperStore.getState().currencyPreference, 'USD');
  assert.equal(useShipperStore.getState().error, 'supabase unavailable');

  updateMock.mock.restore();
  resetStoreFields({
    user: originalState.user,
    profile: originalState.profile,
    currencyPreference: originalState.currencyPreference,
    error: originalState.error
  });
});

test('fetchCurrencyRates updates shipper store state', async () => {
  const originalState = useShipperStore.getState();
  const fetchMock = mock.method(currencyApi, 'fetchLatestCurrencyRates', async () => ({
    base: 'USD',
    rates: { USD: 1, EUR: 0.93, GBP: 0.79 },
    fetchedAt: '2025-10-15T17:11:00.000Z',
    source: 'hexarate'
  }));

  await useShipperStore.getState().fetchCurrencyRates(true);
  const state = useShipperStore.getState();
  assert.equal(state.currencyRates.rates.GBP, 0.79);
  assert.equal(state.currencyRatesLoading, false);
  assert.equal(state.currencyRatesError, null);

  fetchMock.mock.restore();
  resetStoreFields({
    currencyRates: originalState.currencyRates,
    currencyRatesLoading: originalState.currencyRatesLoading,
    currencyRatesError: originalState.currencyRatesError
  });
});

test('fetchCurrencyRates records provider failures', async () => {
  const originalState = useShipperStore.getState();
  const fetchMock = mock.method(currencyApi, 'fetchLatestCurrencyRates', async () => {
    throw new Error('network error');
  });

  await assert.rejects(() => useShipperStore.getState().fetchCurrencyRates(true), /network error/);
  const state = useShipperStore.getState();
  assert.equal(state.currencyRatesLoading, false);
  assert.equal(state.currencyRatesError, 'network error');

  fetchMock.mock.restore();
  resetStoreFields({
    currencyRatesLoading: originalState.currencyRatesLoading,
    currencyRatesError: originalState.currencyRatesError
  });
});
