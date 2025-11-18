import { supabase } from '../lib/supabase';

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiBase = rawApiBase
  ? rawApiBase.endsWith('/api')
    ? rawApiBase
    : `${rawApiBase}/api`
  : '/api';

const EXPORT_ENDPOINT = `${apiBase}/estimates/export-pdf`;

export type ExportLineItemPayload = {
  id: string;
  name: string;
  cost: number;
  subItems?: string[];
};

export type ExportEstimatePayload = {
  quoteId: string;
  quoteTitle: string;
  quoteCode: string;
  currencyCode?: 'USD' | 'EUR' | 'GBP';
  galleryName?: string;
  origin?: string;
  originAddress?: string | null;
  destination?: string;
  destinationAddress?: string | null;
  validUntil?: string;
  notes?: string;
  total: number;
  lineItems: ExportLineItemPayload[];
  branchOrgId: string;
  companyOrgId?: string | null;
  branchName?: string | null;
  companyName?: string | null;
  artworkCount?: number | null;
  artworkValue?: number | null;
};

const getAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('No active session');
  return token;
};

export const checkLetterheadAvailability = async (branchOrgId: string): Promise<{
  available: boolean;
  reason: string | null;
  path: string | null;
}> => {
  if (!branchOrgId) {
    throw new Error('Branch organization is required for letterhead lookup.');
  }

  const token = await getAccessToken();
  const url = `${EXPORT_ENDPOINT}?branchOrgId=${encodeURIComponent(branchOrgId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details?.error || 'Unable to verify letterhead availability.');
  }

  const payload = (await response.json()) as {
    ok: boolean;
    available: boolean;
    reason: string | null;
    path: string | null;
  };

  return {
    available: Boolean(payload.available),
    reason: payload.reason || null,
    path: payload.path || null,
  };
};

export const exportEstimatePdf = async (payload: ExportEstimatePayload): Promise<Blob> => {
  const token = await getAccessToken();

  const response = await fetch(EXPORT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const message = details?.error || 'Failed to generate estimate PDF.';
    const code = details?.code as string | undefined;
    const error = new Error(message);
    if (code) (error as any).code = code;
    throw error;
  }

  return response.blob();
};
