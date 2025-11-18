import {
  DEFAULT_CURRENCY_RATES,
  clampSupportedCurrency,
  type CurrencyRates,
  type SupportedCurrency,
  type CurrencyRateSource
} from '../currency';

const resolveApiBase = (): string | null => {
  const importMetaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env)
    ? (import.meta as any).env
    : undefined;
  const processEnv = (typeof globalThis !== 'undefined' && (globalThis as any)?.process?.env)
    ? (globalThis as any).process.env
    : undefined;
  const rawBase = (
    importMetaEnv?.VITE_API_BASE_URL ??
    processEnv?.VITE_API_BASE_URL ??
    processEnv?.API_BASE_URL
  );

  if (rawBase && typeof rawBase === 'string') {
    return rawBase.replace(/\/+$/, '');
  }

  return null;
};

const API_BASE = resolveApiBase();

const buildCurrencyUrl = () => {
  const suffix = '/currency/latest?base=USD';
  if (API_BASE) {
    const baseWithApi = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;
    return `${baseWithApi}${suffix}`;
  }
  return `/api${suffix}`;
};

type CurrencyApiResponse = {
  base: string;
  rates: Record<string, number>;
  fetchedAt?: string;
  source?: CurrencyRateSource;
};

const fetchLatestCurrencyRatesImpl = async (): Promise<CurrencyRates> => {
  const url = buildCurrencyUrl();
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    throw new Error(`Failed to fetch currency rates (${response.status})`);
  }

  const payload = (await response.json()) as CurrencyApiResponse;

  const base = clampSupportedCurrency(payload.base);
  const safeRates: Record<SupportedCurrency, number> = {
    ...DEFAULT_CURRENCY_RATES.rates
  };

  Object.entries(payload.rates || {}).forEach(([currency, value]) => {
    const key = clampSupportedCurrency(currency);
    if (Number.isFinite(value)) {
      safeRates[key] = Number(value);
    }
  });

  return {
    base,
    rates: safeRates,
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    source: payload.source ?? 'hexarate'
  };
};

export const currencyApi = {
  fetchLatestCurrencyRates: fetchLatestCurrencyRatesImpl
};

export const fetchLatestCurrencyRates = () => currencyApi.fetchLatestCurrencyRates();

export default currencyApi;
