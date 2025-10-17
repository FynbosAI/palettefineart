import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load env for local development:
// 1) Monorepo root .env for shared VITE_* values
// 2) Backend .env for server-only vars (SUPABASE_*, API keys)
try {
  const cwd = process.cwd()
  const rootEnv = path.resolve(cwd, '..', '.env')
  const localEnv = path.resolve(cwd, '.env')
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv })
  }
  if (fs.existsSync(localEnv)) {
    // load backend-specific vars without overriding anything already set
    dotenv.config({ path: localEnv })
  }
  // Fallback to default lookup if neither exists
  if (!fs.existsSync(rootEnv) && !fs.existsSync(localEnv)) {
    dotenv.config()
  }
} catch {
  // no-op: if dotenv fails, rely on process.env
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable')
}
if (!supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
