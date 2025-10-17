import { supabase } from './client';
import { Database } from './types';

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

  // Listen to auth state changes
  static onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  }
} 
