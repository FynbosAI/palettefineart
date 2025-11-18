import { createClient } from '@supabase/supabase-js'
import { Database } from './types'

const importMetaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env)
  ? (import.meta as any).env
  : undefined;
const processEnv = (typeof globalThis !== 'undefined' && (globalThis as any)?.process?.env)
  ? (globalThis as any).process.env
  : undefined;

const supabaseUrl =
  importMetaEnv?.VITE_SUPABASE_URL ??
  processEnv?.VITE_SUPABASE_URL ??
  processEnv?.SUPABASE_URL ??
  '';

const supabaseAnonKey =
  importMetaEnv?.VITE_SUPABASE_ANON_KEY ??
  processEnv?.VITE_SUPABASE_ANON_KEY ??
  processEnv?.SUPABASE_ANON_KEY ??
  '';

const isServerContext = typeof window === 'undefined';
const isTestEnvironment = isServerContext && (
  processEnv?.NODE_ENV === 'test' ||
  processEnv?.CI === 'true' ||
  processEnv?.VITE_TEST === 'true'
);

const resolvedSupabaseUrl = supabaseUrl || (isTestEnvironment ? 'http://localhost:54321' : '');
const resolvedSupabaseAnonKey = supabaseAnonKey || (isTestEnvironment ? 'test-anon-key' : '');

if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}
// Configure Supabase client for browser SPA usage
// – persistSession & autoRefreshToken stay true (default)
// – disable detectSessionInUrl because the app does not rely on OAuth URL parsing
export const supabase = createClient<Database>(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// 🔍  Make the client accessible from DevTools for easier debugging
//      (non-enumerable to avoid polluting auto-complete results)
//      Remove this line in production if desired.
// @ts-ignore
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'supabase', {
    value: supabase,
    writable: false,
    configurable: false
  });
}
