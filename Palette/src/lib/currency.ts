export type SupportedCurrency = 'USD' | 'EUR' | 'GBP';

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['USD', 'EUR', 'GBP'];

export type CurrencyRateSource = 'hexarate' | 'fallback' | 'cache' | 'static';

export interface CurrencyRates {
  base: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
  fetchedAt: string | null;
  source: CurrencyRateSource;
}

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£'
};

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  USD: 'US Dollar (USD)',
  EUR: 'Euro (EUR)',
  GBP: 'British Pound (GBP)'
};

export const DEFAULT_CURRENCY_RATES: CurrencyRates = {
  base: 'USD',
  rates: {
    USD: 1,
    EUR: 1,
    GBP: 1
  },
  fetchedAt: null,
  source: 'static'
};

export const clampSupportedCurrency = (value: string | null | undefined): SupportedCurrency => {
  if (!value) {
    return 'USD';
  }

  const upper = value.toUpperCase();
  return (SUPPORTED_CURRENCIES.includes(upper as SupportedCurrency) ? upper : 'USD') as SupportedCurrency;
};

export const convertAmount = (
  amount: number | null | undefined,
  targetCurrency: SupportedCurrency,
  rates: CurrencyRates | null | undefined
): number => {
  if (!Number.isFinite(amount ?? NaN)) {
    return 0;
  }

  const safeRates = rates ?? DEFAULT_CURRENCY_RATES;
  const baseRate = safeRates.rates[safeRates.base] ?? 1;
  const targetRate = safeRates.rates[targetCurrency] ?? 1;

  const normalized = Number(amount);
  if (baseRate === 0) {
    return normalized * targetRate;
  }

  return normalized * (targetRate / baseRate);
};

export const formatCurrencyValue = (
  amount: number | null | undefined,
  targetCurrency: SupportedCurrency,
  rates: CurrencyRates | null | undefined,
  options?: Intl.NumberFormatOptions
): string => {
  const converted = convertAmount(amount, targetCurrency, rates);
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: targetCurrency,
    minimumFractionDigits: Math.abs(converted) < 1 ? 2 : 0,
    maximumFractionDigits: 2,
    ...options
  });

  return formatter.format(converted);
};
