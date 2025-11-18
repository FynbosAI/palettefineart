import { supabase } from './client';
import { Database } from './types';
import { API_BASE_URL } from '../../config';

const resolveApiBaseUrl = (): string => {
  const importMetaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
  const processEnv = (typeof process !== 'undefined' && process?.env) || {};
  const base =
    importMetaEnv.VITE_API_BASE_URL ||
    processEnv.VITE_API_BASE_URL ||
    API_BASE_URL ||
    'http://localhost:3000';
  return String(base || '').replace(/\/+$/, '');
};

type Profile = Database['public']['Tables']['profiles']['Row'];

export class AuthService {
  // Sign up with email and password
  static async signUp(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    return { data, error };
  }

  // Sign in with email and password
  static async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { data, error };
  }

  // Sign out
  static async signOut() {
    const { error } = await supabase.auth.signOut({ scope: 'global' as any });
    return { error };
  }

  // Get current session
  static async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  }

  // Get current user
  static async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  }

  // Get user profile
  static async getUserProfile(userId: string): Promise<{ profile: Profile | null; error: any }> {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    return { profile, error };
  }

  // Update user profile
  static async updateProfile(userId: string, updates: Partial<Profile>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    return { data, error };
  }

  static async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    const base = resolveApiBaseUrl();
    const url = `${base}/api/auth/password-reset/request`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
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

  // Listen to auth state changes
  static onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }
}
