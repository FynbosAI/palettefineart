import { createClient } from '@supabase/supabase-js'

// Get environment variables with proper fallback for Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
})

// Helpful for debugging in development
if (import.meta.env.DEV) {
  (window as any).supabase = supabase
}

// Export types for better TypeScript support
export type { Session, User } from '@supabase/supabase-js' 