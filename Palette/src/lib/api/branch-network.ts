import { API_BASE_URL } from '../../config';
import { getFreshAccessToken, MissingSupabaseSessionError } from '../supabase';

export type BranchRole = 'admin' | 'member' | 'viewer';

export interface BranchNetworkMember {
  userId: string;
  role: BranchRole;
  fullName: string | null;
  locationId: string | null;
}

export interface BranchLocation {
  id: string;
  name: string;
  address_full: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export type BranchContactType = 'location' | 'member';

export interface BranchNetworkContact {
  type: BranchContactType;
  name: string;
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
  role?: BranchRole;
}

export interface BranchNetworkEntry {
  branchOrgId: string;
  companyOrgId: string;
  companyName?: string | null;
  branchName?: string | null;
  displayName: string;
  location: BranchLocation | null;
  contact: BranchNetworkContact | null;
  members: BranchNetworkMember[];
  logoUrl?: string | null;
}

interface BranchNetworkResponse {
  ok: boolean;
  data?: BranchNetworkEntry[];
  error?: string;
}

const normalizedBase = API_BASE_URL.replace(/\/+$/, '');
const apiBase = normalizedBase.endsWith('/api') ? normalizedBase : `${normalizedBase}/api`;
const BRANCH_ENDPOINT = apiBase ? `${apiBase}/branch-network` : '/api/branch-network';

const AUTH_FALLBACK_MESSAGE = 'Your session expired. Please sign in again to load branch network data.';

export class BranchNetworkAuthError extends Error {
  constructor(message = AUTH_FALLBACK_MESSAGE) {
    super(message);
    this.name = 'BranchNetworkAuthError';
  }
}

class BranchNetworkRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BranchNetworkRequestError';
    this.status = status;
  }
}

export class BranchNetworkClient {
  static async getBranchNetwork(): Promise<{
    data: BranchNetworkEntry[];
    error: Error | null;
  }> {
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const forceRefresh = attempt > 0;

      try {
        const accessToken = await getFreshAccessToken(
          forceRefresh ? { forceRefresh: true } : undefined
        );

        const entries = await this.fetchWithToken(accessToken);
        return { data: entries, error: null };
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));

        if (
          normalizedError instanceof BranchNetworkRequestError &&
          normalizedError.status === 401 &&
          attempt === 0
        ) {
          // Retry once after forcing a refresh
          continue;
        }

        if (normalizedError instanceof BranchNetworkRequestError) {
          if (normalizedError.status === 401 || normalizedError.status === 403) {
            return {
              data: [],
              error: new BranchNetworkAuthError(normalizedError.message || AUTH_FALLBACK_MESSAGE),
            };
          }
          return { data: [], error: normalizedError };
        }

        if (normalizedError instanceof MissingSupabaseSessionError) {
          return {
            data: [],
            error: new BranchNetworkAuthError(normalizedError.message || AUTH_FALLBACK_MESSAGE),
          };
        }

        return { data: [], error: normalizedError };
      }
    }

    return { data: [], error: new BranchNetworkAuthError() };
  }

  private static async fetchWithToken(accessToken: string): Promise<BranchNetworkEntry[]> {
    const response = await fetch(BRANCH_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const rawBody = await response.text();
    let parsedBody: BranchNetworkResponse | null = null;

    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody) as BranchNetworkResponse;
      } catch (parseError) {
        // Ignore JSON parse errors; rely on status-based messaging below
      }
    }

    if (!response.ok) {
      const message = parsedBody?.error || `Branch network request failed with status ${response.status}`;
      throw new BranchNetworkRequestError(message, response.status);
    }

    if (!parsedBody?.ok) {
      const message = parsedBody?.error || 'Branch network request returned an unexpected response';
      throw new BranchNetworkRequestError(message, response.status);
    }

    const entries = Array.isArray(parsedBody.data) ? parsedBody.data : [];
    return entries;
  }
}
