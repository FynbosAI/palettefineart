import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../../src/utils/cors.js';
import CurrencyService from '../../src/services/currency/CurrencyService.js';

const DEFAULT_ALLOWED_METHODS = 'GET, OPTIONS';

const getTtl = (): number => {
  const raw = Number(process.env.CURRENCY_RATES_TTL_MS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 10 * 60 * 1000;
  }
  return raw;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, DEFAULT_ALLOWED_METHODS);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const base = String(req.query.base ?? 'USD').toUpperCase();
  if (base !== 'USD') {
    res.status(400).json({
      error: 'Unsupported base currency',
      supported: CurrencyService.supportedCurrencies(),
      message: 'Only USD base rates are currently supported.'
    });
    return;
  }

  try {
    const rates = await CurrencyService.getRates();
    res.status(200).json({
      ...rates,
      supportedCurrencies: CurrencyService.supportedCurrencies(),
      ttlMs: getTtl()
    });
  } catch (error) {
    console.error('[api/currency/latest] Failed to load currency rates', error);
    res.status(503).json({
      error: 'Failed to load currency rates',
      supportedCurrencies: CurrencyService.supportedCurrencies()
    });
  }
}
