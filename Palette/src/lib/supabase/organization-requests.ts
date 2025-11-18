import { supabase } from './client';
import { Database } from './types';

type OrganizationRequest = Database['public']['Tables']['organization_requests']['Row'];
type OrganizationRequestInsert = Database['public']['Tables']['organization_requests']['Insert'];

export type SignupOrganization = {
  company_org_id: string;
  company_name: string;
  branches: Array<{
    branch_org_id: string;
    branch_name: string | null;
    branch_location_id: string | null;
  }>;
};

export class OrganizationRequestService {
  // Get all organizations for dropdown (SOC 2 compliant)
  static async getAllOrganizations(): Promise<{ data: SignupOrganization[] | null; error: any }> {
    try {
      // Get client IP and user agent for audit logging
      const clientIP = await this.getClientIP();
      const userAgent = navigator.userAgent;
      
      // Use SOC 2 compliant function with rate limiting and audit logging
      const { data, error } = await supabase.rpc('get_organizations_for_signup', {
        client_ip: clientIP,
        user_agent: userAgent
      });

      if (error) {
        return { data: null, error };
      }

      const normalized = Array.isArray(data)
        ? (data as any[]).map((row) => {
            const branchesRaw = Array.isArray(row?.branches) ? row.branches : [];
            const branches = branchesRaw
              .filter(Boolean)
              .map((branch: any) => ({
                branch_org_id: branch?.branch_org_id as string,
                branch_name: branch?.branch_name ?? null,
                branch_location_id: branch?.branch_location_id ?? null,
              }))
              .filter((branch: { branch_org_id: string }) => Boolean(branch.branch_org_id));

            return {
              company_org_id: row?.company_org_id as string,
              company_name: row?.company_name as string,
              branches,
            } as SignupOrganization;
          })
        : [];

      return { data: normalized, error: null };
    } catch (error) {
      console.error('Error fetching organizations:', error);
      return { data: null, error };
    }
  }

  // Helper method to get client IP (best effort)
  private static async getClientIP(): Promise<string | null> {
    try {
      // In a real production environment, you might get this from headers
      // For now, we'll use a placeholder or get it from a service
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip || null;
    } catch (error) {
      console.warn('Could not determine client IP:', error);
      return null;
    }
  }

  // Submit organization access request
  static async submitAccessRequest(request: OrganizationRequestInsert) {
    const { data, error } = await supabase
      .from('organization_requests')
      .insert(request)
      .select()
      .single();

    return { data, error };
  }

  // Get user's organization requests
  static async getUserRequests(userId: string) {
    const { data, error } = await supabase
      .from('organization_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return { data, error };
  }

  // Check if user has pending request for organization
  static async hasPendingRequest(userId: string, organizationName: string) {
    const { data, error } = await supabase
      .from('organization_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_name', organizationName)
      .eq('status', 'pending')
      .single();

    return { data, error };
  }

  // Admin functions (for future use)
  static async getPendingRequests() {
    const { data, error } = await supabase
      .from('organization_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    return { data, error };
  }

  // Get organization access statistics (SOC 2 compliance monitoring)
  static async getAccessStats() {
    const { data, error } = await supabase.rpc('get_organization_access_stats');
    return { data, error };
  }

  static async approveRequest(requestId: string, reviewerId: string) {
    const { data, error } = await supabase
      .from('organization_requests')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId
      })
      .eq('id', requestId)
      .select()
      .single();

    return { data, error };
  }

  static async rejectRequest(requestId: string, reviewerId: string) {
    const { data, error } = await supabase
      .from('organization_requests')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId
      })
      .eq('id', requestId)
      .select()
      .single();

    return { data, error };
  }
} 
