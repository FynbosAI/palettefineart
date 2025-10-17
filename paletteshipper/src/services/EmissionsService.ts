import { supabase } from '../lib/supabase';
import type {
  BidEmissionsBackendResponse,
  BidEmissionsErrorResponse,
  BidEmissionsRequestPayload,
  BidEmissionsSuccessResponse,
} from '../../../shared/emissions/types';

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const API_BASE = rawApiBase ? (rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`) : '/api';
const EMISSIONS_ENDPOINT = `${API_BASE}/emissions`;

export class EmissionsService {
  static async calculateBidEmissions(payload: BidEmissionsRequestPayload): Promise<BidEmissionsSuccessResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('EmissionsService.calculateBidEmissions: unable to resolve Supabase session', err);
    }

    const response = await fetch(EMISSIONS_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    let parsed: BidEmissionsBackendResponse;
    try {
      parsed = (await response.json()) as BidEmissionsBackendResponse;
    } catch (err) {
      throw new Error(`Emissions request failed to parse response JSON: ${(err as Error).message}`);
    }

    if (!response.ok || !parsed?.ok) {
      const errorMessage = (parsed as BidEmissionsErrorResponse)?.error || response.statusText || 'Emissions request failed';
      const details = (parsed as BidEmissionsErrorResponse)?.details;
      throw new Error(details ? `${errorMessage} (${details})` : errorMessage);
    }

    return parsed as BidEmissionsSuccessResponse;
  }
}
