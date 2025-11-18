import { useCallback } from 'react';
import useSupabaseStore from '../store/useSupabaseStore';
import {
  CURRENCY_SYMBOLS,
  DEFAULT_CURRENCY_RATES,
  convertAmount,
  formatCurrencyValue,
  type SupportedCurrency
} from '../lib/currency';

export const useCurrency = () => {
  const preferredCurrency = useSupabaseStore((state) => state.currencyPreference);
  const currencyRates = useSupabaseStore((state) => state.currencyRates);
  const fetchCurrencyRates = useSupabaseStore((state) => state.fetchCurrencyRates);
  const currencyRatesLoading = useSupabaseStore((state) => state.currencyRatesLoading);
  const currencyRatesError = useSupabaseStore((state) => state.currencyRatesError);

  const formatCurrency = useCallback(
    (amount: number | null | undefined, options?: Intl.NumberFormatOptions) =>
      formatCurrencyValue(amount, preferredCurrency, currencyRates, options),
    [preferredCurrency, currencyRates]
  );

  const convertTo = useCallback(
    (amount: number | null | undefined, target?: SupportedCurrency) =>
      convertAmount(amount, target ?? preferredCurrency, currencyRates),
    [preferredCurrency, currencyRates]
  );

  return {
    preferredCurrency,
    currencySymbol: CURRENCY_SYMBOLS[preferredCurrency],
    currencyRates: currencyRates ?? DEFAULT_CURRENCY_RATES,
    currencyRatesLoading,
    currencyRatesError,
    formatCurrency,
    convertAmount: convertTo,
    refreshCurrencyRates: fetchCurrencyRates
  };
};

export default useCurrency;
