import { supabase } from './client';
import { Database } from './types';

type Organization = Database['public']['Tables']['organizations']['Row'];
type Membership = Database['public']['Tables']['memberships']['Row'];
type CreateOrganizationResult = {
  company_org_id: string;
  branch_org_id: string;
};

export class OrganizationService {
  // Get user's organization memberships
  static async getUserMemberships(userId: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select(`
        user_id,
        org_id,
        role,
        company_id,
        organization:organizations!memberships_org_id_fkey(*),
        company:organizations!memberships_company_fk(*)
      `)
      .eq('user_id', userId);

    return { data, error };
  }

  // Create organization with admin user
  static async createOrganization(name: string, userId?: string) {
    const { data, error } = await supabase.rpc('create_organization_with_admin', {
      _org_name: name,
      _user_id: userId
    });

    return {
      data: (data as CreateOrganizationResult | null) || null,
      error
    };
  }

  // Switch user's default organization
  static async switchDefaultOrganization(orgId: string) {
    const { data, error } = await supabase.rpc('set_my_default_org', {
      _org_id: orgId
    });

    return { data, error };
  }

  // Get organization details
  static async getOrganization(orgId: string) {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    return { data, error };
  }

  // Update organization
  static async updateOrganization(orgId: string, updates: Partial<Organization>) {
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();

    return { data, error };
  }

  // Add user to organization
  static async addMember(orgId: string, userId: string, role: 'viewer' | 'editor' | 'admin' = 'viewer') {
    const { data, error } = await supabase
      .from('memberships')
      .insert({
        org_id: orgId,
        user_id: userId,
        role
      })
      .select()
      .single();

    return { data, error };
  }

  // Update member role
  static async updateMemberRole(orgId: string, userId: string, role: 'viewer' | 'editor' | 'admin') {
    const { data, error } = await supabase
      .from('memberships')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .select()
      .single();

    return { data, error };
  }

  // Remove member from organization
  static async removeMember(orgId: string, userId: string) {
    const { error } = await supabase
      .from('memberships')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId);

    return { error };
  }

  // Get organization members
  static async getMembers(orgId: string) {
    const { data, error } = await supabase
      .from('memberships')
      .select(`
        *,
        profile:profiles(*)
      `)
      .eq('org_id', orgId);

    return { data, error };
  }
} 
