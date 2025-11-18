import { supabase } from '../lib/supabase';

export type BranchRole = 'admin' | 'member' | 'viewer';

export interface BranchLocation {
  id: string;
  name: string;
  address_full: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface BranchNetworkMember {
  userId: string;
  role: BranchRole;
  fullName: string | null;
  locationId: string | null;
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

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const API_BASE = rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`;
const BRANCH_ENDPOINT = API_BASE ? `${API_BASE}/branch-network` : '/api/branch-network';

interface BranchNetworkResponse {
  ok: boolean;
  data?: BranchNetworkEntry[];
  error?: string;
}

export class BranchNetworkService {
  static async getBranchNetwork(): Promise<{
    data: BranchNetworkEntry[];
    error: Error | null;
  }> {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const nowInSeconds = Math.floor(Date.now() / 1000);
      const initialSession = sessionData.session;
      const sessionExpired =
        initialSession?.expires_at !== undefined && initialSession.expires_at <= nowInSeconds;

      let session = !initialSession || sessionExpired ? null : initialSession;

      // The branch network endpoint runs through our backend service-role handler, so
      // we proactively refresh the Supabase session when the cached token is missing
      // or past its expiry to avoid 401s after long idle periods.
      if (!session) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          throw refreshError;
        }

        session = refreshData.session ?? null;
      }

      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('No authenticated session available for branch lookup');
      }

      const endpoint = BRANCH_ENDPOINT || '/api/branch-network';
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      });

      if (!response.ok) {
        let message = `Branch network request failed with status ${response.status}`;
        try {
          const body = (await response.json()) as BranchNetworkResponse;
          if (body?.error) {
            message = body.error;
          }
        } catch {
          // ignore JSON parse errors – we'll use the default message
        }
        throw new Error(message);
      }

      const payload = (await response.json()) as BranchNetworkResponse;
      if (!payload.ok) {
        throw new Error(payload.error || 'Branch network request returned an unexpected response');
      }

      const entries = Array.isArray(payload.data) ? payload.data : [];
      return { data: entries, error: null };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
