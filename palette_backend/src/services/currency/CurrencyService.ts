import { supabaseAdmin } from '../../supabaseClient.js';

export type SupportedCurrency = 'USD' | 'EUR' | 'GBP';

export interface CurrencyRates {
  base: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
  fetchedAt: string;
  source: 'hexarate' | 'fallback' | 'cache';
}

const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['USD', 'EUR', 'GBP'];
const HEXARATE_BASE_URL = process.env.HEXARATE_BASE_URL ?? 'https://hexarate.paikama.co/api';
const FALLBACK_API_URL = process.env.CURRENCY_FALLBACK_URL ?? 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = Number(process.env.CURRENCY_RATES_TTL_MS ?? 10 * 60 * 1000);
const APP_CONFIG_KEY = 'fx_rates_usd';

type CachedRates = {
  value: CurrencyRates;
  expiresAt: number;
};

let memoryCache: CachedRates | null = null;
let supabaseAdapter = supabaseAdmin;

const now = () => Date.now();

const isCacheValid = (cache: CachedRates | null): cache is CachedRates => {
  if (!cache) return false;
  return cache.expiresAt > now();
};

const parseSupabaseValue = (value: unknown): CurrencyRates | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, any>;
  const base = record.base as SupportedCurrency | undefined;
  const rates = record.rates as Record<string, number> | undefined;
  const fetchedAt = record.fetchedAt as string | undefined;
  const source = (record.source as CurrencyRates['source'] | undefined) ?? 'cache';

  if (!base || !rates || !fetchedAt) {
    return null;
  }

  const normalisedRates: Record<SupportedCurrency, number> = {
    USD: 1,
    EUR: 1,
    GBP: 1
  };

  SUPPORTED_CURRENCIES.forEach((currency) => {
    const rate = rates[currency];
    if (typeof rate === 'number' && Number.isFinite(rate)) {
      normalisedRates[currency] = rate;
    }
  });

  return {
    base,
    rates: normalisedRates,
    fetchedAt,
    source
  };
};

const storeRatesInAppConfig = async (rates: CurrencyRates) => {
  try {
    const payload = {
      key: APP_CONFIG_KEY,
      value: rates,
      category: 'currency'
    };

    const { error } = await supabaseAdapter
      .from('app_config')
      .upsert(payload, { onConflict: 'key' });

    if (error) {
      console.error('[CurrencyService] Failed to persist rates to app_config', error);
    }
  } catch (persistError) {
    console.error('[CurrencyService] Unexpected error while persisting rates', persistError);
  }
};

const loadRatesFromAppConfig = async (): Promise<CurrencyRates | null> => {
  try {
    const { data, error } = await supabaseAdapter
      .from('app_config')
      .select('value')
      .eq('key', APP_CONFIG_KEY)
      .maybeSingle();

    if (error) {
      console.error('[CurrencyService] Failed to fetch cached rates from app_config', error);
      return null;
    }

    if (!data?.value) {
      return null;
    }

    return parseSupabaseValue(data.value);
  } catch (readError) {
    console.error('[CurrencyService] Unexpected error reading cached rates', readError);
    return null;
  }
};

const fetchHexarateRates = async (): Promise<CurrencyRates> => {
  const rates: Record<SupportedCurrency, number> = {
    USD: 1,
    EUR: 1,
    GBP: 1
  };

  const targets = SUPPORTED_CURRENCIES.filter((currency) => currency !== 'USD');

  await Promise.all(targets.map(async (target) => {
    const url = `${HEXARATE_BASE_URL}/rates/latest/USD?target=${target}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Hexarate request failed for ${target}: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const mid = Number(json?.data?.mid);

    if (!Number.isFinite(mid)) {
      throw new Error(`Hexarate response missing mid rate for ${target}`);
    }

    rates[target as SupportedCurrency] = mid;
  }));

  return {
    base: 'USD',
    rates,
    fetchedAt: new Date().toISOString(),
    source: 'hexarate'
  };
};

const fetchFallbackRates = async (): Promise<CurrencyRates> => {
  const response = await fetch(FALLBACK_API_URL);
  if (!response.ok) {
    throw new Error(`Fallback FX API failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json?.result !== 'success' || typeof json?.rates !== 'object') {
    throw new Error('Fallback FX API returned unexpected payload');
  }

  const rates: Record<SupportedCurrency, number> = {
    USD: 1,
    EUR: 1,
    GBP: 1
  };

  SUPPORTED_CURRENCIES.forEach((currency) => {
    if (currency === 'USD') return;
    const rate = Number(json.rates[currency]);
    if (Number.isFinite(rate)) {
      rates[currency] = rate;
    }
  });

  return {
    base: 'USD',
    rates,
    fetchedAt: new Date().toISOString(),
    source: 'fallback'
  };
};

export class CurrencyService {
  static supportedCurrencies(): SupportedCurrency[] {
    return [...SUPPORTED_CURRENCIES];
  }

  /**
   * Testing helper to clear the in-memory cache between test cases.
   */
  static __clearCacheForTests(): void {
    memoryCache = null;
  }

  /**
   * Testing helper to override the Supabase adapter.
   */
  static __setSupabaseAdminForTests(adapter: typeof supabaseAdmin | null): void {
    supabaseAdapter = adapter ?? supabaseAdmin;
  }

  static async getRates(): Promise<CurrencyRates> {
    if (isCacheValid(memoryCache)) {
      return memoryCache!.value;
    }

    try {
      const freshRates = await fetchHexarateRates();
      memoryCache = {
        value: freshRates,
        expiresAt: now() + CACHE_TTL_MS
      };

      await storeRatesInAppConfig(freshRates);
      return freshRates;
    } catch (hexarateError) {
      console.error('[CurrencyService] Hexarate fetch failed, attempting fallback', hexarateError);
    }

    try {
      const fallbackRates = await fetchFallbackRates();
      memoryCache = {
        value: fallbackRates,
        expiresAt: now() + CACHE_TTL_MS
      };

      await storeRatesInAppConfig(fallbackRates);
      return fallbackRates;
    } catch (fallbackError) {
      console.error('[CurrencyService] Fallback fetch failed', fallbackError);
    }

    const cached = await loadRatesFromAppConfig();
    if (cached) {
      memoryCache = {
        value: { ...cached, source: 'cache' },
        expiresAt: now() + CACHE_TTL_MS
      };

      return memoryCache.value;
    }

    throw new Error('Unable to load currency rates at this time');
  }
}

export default CurrencyService;
