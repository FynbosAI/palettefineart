import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/supabaseClient.js';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

type LocationRecord = {
  id: string | number;
  address_full: string | null;
  latitude: number | null;
  longitude: number | null;
};

type DbWebhookPayload<T> = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: T | null;
  old_record: T | null;
};

type GeocodeResult = {
  latitude: number;
  longitude: number;
  postalCode: string | null;
};

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status).json(body);
}

function parsePayload(req: VercelRequest): DbWebhookPayload<LocationRecord> | null {
  const { body } = req;
  if (!body) return null;

  if (typeof body === 'string') {
    return JSON.parse(body) as DbWebhookPayload<LocationRecord>;
  }

  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString('utf8')) as DbWebhookPayload<LocationRecord>;
  }

  return body as DbWebhookPayload<LocationRecord>;
}

function normalizeAddress(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function shouldGeocode(payload: DbWebhookPayload<LocationRecord> | null): payload is DbWebhookPayload<LocationRecord> {
  if (!payload) return false;
  if (payload.schema !== 'public' || payload.table !== 'locations') return false;
  if (payload.type !== 'INSERT' && payload.type !== 'UPDATE') return false;
  const record = payload.record;
  if (!record) return false;

  const currentAddress = normalizeAddress(record.address_full);
  if (!currentAddress) return false;

  if (payload.type === 'INSERT') {
    return true;
  }

  const previousAddress = normalizeAddress(payload.old_record?.address_full ?? null);
  if (previousAddress !== currentAddress) {
    return true;
  }

  const needsCoordinates = record.latitude == null || record.longitude == null;
  const previouslyMissing = payload.old_record?.latitude == null || payload.old_record?.longitude == null;
  if (needsCoordinates && previouslyMissing) {
    return true;
  }

  return false;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateAddressVariants(address: string): string[] {
  const trimmed = address.trim();

  const parts = trimmed.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return [];

  const variants: string[] = [];
  const maxDrops = Math.min(parts.length - 1, 3);

  for (let drop = 0; drop <= maxDrops; drop += 1) {
    const variantParts = parts.slice(drop);
    if (variantParts.length === 0) break;
    const variant = variantParts.join(', ');
    if (!variants.includes(variant)) {
      variants.push(variant);
    }
  }

  return variants;
}

type NominatimResult = {
  lat: string;
  lon: string;
  address?: {
    postcode?: string;
    zip?: string;
  };
};

async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const MAX_ATTEMPTS = 3;
  const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
  const userAgent = process.env.NOMINATIM_USER_AGENT || 'PaletteGeocoder/1.0 (support@paletteartshipping.com)';

  const variants = generateAddressVariants(address);
  for (const variant of variants) {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set('q', variant);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          headers: {
            'User-Agent': userAgent,
            Accept: 'application/json',
          },
        });
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(750 * attempt);
          continue;
        }
        // Fetch failed after retries; move to next variant.
        break;
      }

      if (!response.ok) {
        if (RETRY_STATUSES.has(response.status)) {
          if (attempt < MAX_ATTEMPTS) {
            const backoffMs = 750 * attempt;
            await sleep(backoffMs);
            continue;
          }
          // Exhausted retryable attempts; try broader variant.
          break;
        }
        throw new Error(`Nominatim request failed with status ${response.status}`);
      }

      const results = (await response.json()) as NominatimResult[];
      if (!Array.isArray(results) || results.length === 0) {
        break; // try next variant with broader address
      }

      const primary = results[0];
      const latitude = Number.parseFloat(primary.lat);
      const longitude = Number.parseFloat(primary.lon);
      const postalCode = primary.address?.postcode ?? primary.address?.zip ?? null;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        break;
      }

      return { latitude, longitude, postalCode };
    }
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    return;
  }

  let payload: DbWebhookPayload<LocationRecord> | null = null;
  try {
    payload = parsePayload(req);
  } catch (error) {
    console.error('[geocode] Failed to parse payload', error);
    sendJson(res, 400, { ok: false, error: 'Invalid JSON payload' });
    return;
  }

  if (!shouldGeocode(payload)) {
    sendJson(res, 200, { ok: true, message: 'No geocoding needed' });
    return;
  }

  const record = payload.record as LocationRecord;
  const address = normalizeAddress(record.address_full);
  if (!address) {
    sendJson(res, 200, { ok: true, message: 'No geocoding needed' });
    return;
  }

  const id = record.id;
  if (id === undefined || id === null) {
    sendJson(res, 400, { ok: false, error: 'Missing record id' });
    return;
  }

  try {
    const geo = await geocodeAddress(address);

    if (!geo) {
      console.info('[geocode] No coordinates returned', { id, address });
      sendJson(res, 200, { ok: true, message: 'No geocoding result', address });
      return;
    }

    const updatePayload: Record<string, unknown> = {
      latitude: geo.latitude,
      longitude: geo.longitude,
    };

    if (geo.postalCode) {
      updatePayload.postal_code = geo.postalCode;
    }

    const { data, error } = await supabaseAdmin
      .from('locations')
      .update(updatePayload)
      .eq('id', id)
      .select('id');

    if (error) {
      console.error('[geocode] Failed to update locations', error);
      sendJson(res, 500, { ok: false, error: 'Database update failed', detail: error.message });
      return;
    }

    if (!data || data.length === 0) {
      sendJson(res, 404, { ok: false, error: 'Location not found for update', id });
      return;
    }

    console.info('[geocode] Updated coordinates', {
      id,
      address,
      latitude: geo.latitude,
      longitude: geo.longitude,
    });
    sendJson(res, 200, { ok: true, id, latitude: geo.latitude, longitude: geo.longitude });
  } catch (error) {
    console.error('[geocode] Geocoding failed', error);
    const detail = error instanceof Error ? error.message : String(error);
    sendJson(res, 502, { ok: false, error: 'Geocoding failed', detail });
  }
}
