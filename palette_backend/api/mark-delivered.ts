import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../src/supabaseClient.js'
import { setCorsHeaders } from '../src/utils/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const { p_shipment_id, branch_org_id, p_branch_org_id } = (req.body || {}) as {
      p_shipment_id?: string
      branch_org_id?: string
      p_branch_org_id?: string
    }
    if (!p_shipment_id) {
      res.status(400).json({ error: 'Missing p_shipment_id' })
      return
    }

    const branchOrgId = p_branch_org_id || branch_org_id
    if (!branchOrgId) {
      res.status(400).json({ error: 'Missing branch_org_id' })
      return
    }

    // Require Supabase bearer token
    const authHeader = String(req.headers.authorization || '')
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization bearer token' })
      return
    }

    // Early user validation (DB RLS/SECURITY DEFINER will also enforce)
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(500).json({ ok: false, error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' })
      return
    }

    // Create a user-scoped client so auth.uid() is available inside the SQL function
    const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabaseAsUser.rpc('mark_shipment_delivered', {
      p_shipment_id,
      p_branch_org_id: branchOrgId,
    })

    if (error) {
      const anyErr: any = error as any
      res.status(400).json({
        ok: false,
        error: {
          message: anyErr?.message || String(anyErr),
          code: anyErr?.code,
          details: anyErr?.details,
          hint: anyErr?.hint,
        },
      })
      return
    }

    res.status(200).json({ ok: true, result: data })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' })
  }
}

