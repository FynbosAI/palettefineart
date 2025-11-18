import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

// Types
interface Profile {
  id: string;
  full_name?: string;
  default_org?: string;
  created_at?: string;
  preferred_currency?: string;
  profile_image_path?: string | null;
}

interface Organization {
  id: string;
  name: string;
  type: 'client' | 'partner';
  created_at: string;
  parent_org_id?: string | null;
  branch_name?: string | null;
  branch_location_id?: string | null;
  company_id?: string | null;
  company?: Organization | null;
}

interface Membership {
  user_id: string;
  org_id: string;
  role: 'admin' | 'member' | 'viewer';
  company_id?: string | null;
  organization?: Organization | null;
  company?: Organization | null;
}

interface SignUpResult {
  success: boolean;
  user?: User;
  error?: string;
}

interface SignInResult {
  success: boolean;
  user?: User;
  profile?: Profile | null;
  error?: string;
}

export class AuthService {
  private static getApiBaseUrl(): string {
    const importMetaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
    const processEnv = (typeof process !== 'undefined' && process?.env) || {};
    const base =
      importMetaEnv.VITE_API_BASE_URL ||
      processEnv.VITE_API_BASE_URL ||
      'http://localhost:3000';
    return String(base || '').replace(/\/+$/, '');
  }

  /**
   * Sign up a new user (requires pre-approval)
   */
  static async signUp(
    email: string, 
    password: string, 
    fullName: string
  ): Promise<SignUpResult> {
    try {
      // Create user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          data: { 
            full_name: fullName 
          } 
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error('No user returned from sign up');

      const { data: branchLookup, error: resolveError } = await supabase.rpc(
        'resolve_preapproved_branch',
        { p_email: email }
      );

      const branchMatch = Array.isArray(branchLookup) ? branchLookup[0] : null;
      const branchOrgId = branchMatch?.branch_org_id as string | undefined;

      if (resolveError) {
        console.error('AuthService.signUp branch resolver error:', resolveError);
      }

      if (!branchOrgId) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Email is not pre-approved for any branch. Please contact your administrator.'
        };
      }

      // Attempt to join organization if pre-approved
      const { data: joinResult, error: joinError } = await supabase.rpc(
        'join_organization_if_approved',
        {
          user_email: email,
          user_id: data.user.id,
          org_id: branchOrgId
        }
      );

      const joinPayload = Array.isArray(joinResult) ? joinResult[0] : joinResult;

      if (joinError || !joinPayload?.success) {
        // Not pre-approved - sign out and return error
        await supabase.auth.signOut();
        return { 
          success: false, 
          error: joinError?.message || joinPayload?.message || 'Email not pre-approved. Please contact your administrator.' 
        };
      }

      return { 
        success: true, 
        user: data.user 
      };
    } catch (error: any) {
      console.error('AuthService.signUp error:', error);
      return { 
        success: false, 
        error: error.message || 'Sign up failed' 
      };
    }
  }

  /**
   * Sign in an existing user
   */
  static async signIn(email: string, password: string): Promise<SignInResult> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      if (!data.user) throw new Error('No user returned from sign in');

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      return { 
        success: true, 
        user: data.user,
        profile 
      };
    } catch (error: any) {
      console.error('AuthService.signIn error:', error);
      return { 
        success: false, 
        error: error.message || 'Sign in failed' 
      };
    }
  }

  static async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    const base = this.getApiBaseUrl();
    const url = `${base}/api/auth/password-reset/request`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      if (response.status === 202 || response.status === 204) {
        return { success: true };
      }

      if (response.ok) {
        return { success: true };
      }

      const payload = await response.json().catch(() => null);
      const message = payload?.error || `Request failed (${response.status})`;
      return { success: false, error: message };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      return { success: false, error: message };
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<void> {
    try {
      console.log('🚪 AuthService.signOut - Starting Supabase signOut');
      
      // Add timeout to prevent hanging
      const signOutPromise = supabase.auth.signOut({ scope: 'global' as any });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase signOut timeout')), 3000)
      );
      
      await Promise.race([signOutPromise, timeoutPromise]);
      console.log('✅ AuthService.signOut - Supabase signOut completed');
      // Always clear storage even on success (defensive)
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
            console.log(`🗑️ Removed localStorage key: ${key}`);
          }
        });
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            sessionStorage.removeItem(key);
            console.log(`🗑️ Removed sessionStorage key: ${key}`);
          }
        });
      } catch (storageError) {
        console.error('❌ Error clearing storage (post signOut):', storageError);
      }
    } catch (error) {
      console.error('❌ AuthService.signOut error:', error);
      
      // If Supabase signOut fails or times out, force clear the session manually
      console.log('🧹 AuthService.signOut - Force clearing session storage');
      try {
        // Clear Supabase session from localStorage
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
            console.log(`🗑️ Removed localStorage key: ${key}`);
          }
        });
        
        // Clear session storage as well
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            sessionStorage.removeItem(key);
            console.log(`🗑️ Removed sessionStorage key: ${key}`);
          }
        });
        
        console.log('✅ AuthService.signOut - Session storage forcefully cleared');
      } catch (storageError) {
        console.error('❌ Error clearing storage:', storageError);
      }
    }
  }

  /**
   * Get current session
   */
  static async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return session;
    } catch (error) {
      console.error('AuthService.getSession error:', error);
      return null;
    }
  }

  /**
   * Refresh the session
   */
  static async refreshSession() {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return session;
    } catch (error) {
      console.error('AuthService.refreshSession error:', error);
      return null;
    }
  }

  /**
   * Fetch user memberships and organization details
   */
  static async fetchUserMemberships(userId: string): Promise<{
    memberships: Membership[];
    currentOrg: Organization | null;
    branchOrg: Organization | null;
    logisticsPartnerId: string | null;
  }> {
    try {
      console.log('🔍 AuthService.fetchUserMemberships - Starting for userId:', userId);
      
      // Fetch memberships with organization details
      const { data: memberships, error } = await supabase
        .from('memberships')
        .select(`
          *,
          organization:organizations!memberships_org_id_fkey(*),
          company:organizations!memberships_company_fk(*)
        `)
        .eq('user_id', userId);

      console.log('📊 Memberships query result:', {
        count: memberships?.length || 0,
        memberships: memberships,
        error: error
      });

      if (error) throw error;

      const membershipData = (memberships || []) as Membership[];
      const normalizedMemberships = membershipData.map((membership: any) => {
        const branchOrg = membership.organization as Organization | null;
        const companyOrg = membership.company as Organization | null;
        const resolvedCompany = companyOrg
          ? {
              ...companyOrg,
              company: null,
              company_id: null,
            }
          : null;

        const mergedBranch = branchOrg
          ? {
              ...branchOrg,
              company_id: membership.company_id ?? branchOrg.parent_org_id,
              company: resolvedCompany,
            }
          : null;

        return {
          ...membership,
          organization: mergedBranch,
          company: resolvedCompany,
        } as Membership;
      });
      let currentOrg: Organization | null = null;
      let branchOrg: Organization | null = null;
      let logisticsPartnerId: string | null = null;

      const branchMembership = normalizedMemberships.find((membership) => {
        const org = membership.organization as Organization | null;
        return Boolean(org?.parent_org_id);
      });

      if (branchMembership?.organization) {
        branchOrg = branchMembership.organization as Organization;
        currentOrg = branchOrg;
      } else if (normalizedMemberships.length > 0 && normalizedMemberships[0].organization) {
        currentOrg = normalizedMemberships[0].organization as Organization;
        branchOrg = currentOrg;
      }

      if (currentOrg) {
        console.log('🏢 Selected branch organization:', {
          id: currentOrg.id,
          parent_org_id: currentOrg.parent_org_id,
          company_id: currentOrg.company_id,
        });

        // Fetch logistics partner ID using company org id when available
        const companyOrgId = currentOrg.company_id || currentOrg.parent_org_id || currentOrg.id;
        console.log('🔍 Fetching logistics partner for org_id:', companyOrgId);
        
        const { data: partner, error: partnerError } = await supabase
          .from('logistics_partners')
          .select('*')
          .eq('org_id', companyOrgId)
          .single();

        console.log('📊 Logistics partner query result:', {
          partner: partner,
          error: partnerError
        });

        if (partner) {
          logisticsPartnerId = partner.id;
          console.log('✅ Found logistics partner ID:', logisticsPartnerId);
        } else {
          console.log('⚠️ No logistics partner found for org:', currentOrg.id);
        }
      } else {
        console.log('⚠️ No memberships found for user:', userId);
      }

      const result = {
        memberships: normalizedMemberships,
        currentOrg,
        branchOrg,
        logisticsPartnerId
      };
      
      console.log('✅ AuthService.fetchUserMemberships - Final result:', result);
      
      return result;
    } catch (error: any) {
      console.error('❌ AuthService.fetchUserMemberships error:', error);
      return {
        memberships: [],
        currentOrg: null,
        branchOrg: null,
        logisticsPartnerId: null
      };
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, updates: Partial<Profile>) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('AuthService.updateProfile error:', error);
      return { data: null, error };
    }
  }

  /**
   * Check if email is pre-approved
   */
  static async checkEmailPreApproval(email: string) {
    try {
      const { data, error } = await supabase
        .from('organization_approved_users')
        .select('*')
        .eq('email', email)
        .is('used_at', null)
        .single();

      if (error || !data) {
        return { isApproved: false, organization: null };
      }

      // Get organization details
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', data.org_id)
        .single();

      return { 
        isApproved: true, 
        organization: org,
        role: data.role 
      };
    } catch (error) {
      console.error('AuthService.checkEmailPreApproval error:', error);
      return { isApproved: false, organization: null };
    }
  }

  /**
   * Request password reset
   */
  static async resetPassword(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      return { success: true, error: null };
    } catch (error: any) {
      console.error('AuthService.resetPassword error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update password
   */
  static async updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      return { success: true, error: null };
    } catch (error: any) {
      console.error('AuthService.updatePassword error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set up auth state change listener
   */
  static onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }

  /**
   * Get user role in organization
   */
  static async getUserRole(userId: string, orgId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .single();

      if (error) throw error;
      return data?.role || null;
    } catch (error) {
      console.error('AuthService.getUserRole error:', error);
      return null;
    }
  }

  /**
   * Check if user has specific permission
   */
  static async checkPermission(
    userId: string, 
    orgId: string, 
    permission: string
  ): Promise<boolean> {
    try {
      const role = await this.getUserRole(userId, orgId);
      
      // Define permission matrix
      const permissions: { [role: string]: string[] } = {
        admin: ['read', 'write', 'delete', 'manage_users', 'manage_billing'],
        member: ['read', 'write'],
        viewer: ['read']
      };

      if (!role || !permissions[role]) return false;
      return permissions[role].includes(permission);
    } catch (error) {
      console.error('AuthService.checkPermission error:', error);
      return false;
    }
  }
}
