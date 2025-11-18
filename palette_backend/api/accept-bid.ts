import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../src/supabaseClient.js'
import { setCorsHeaders } from '../src/utils/cors.js'

interface AcceptBidRequestBody {
  p_quote_id?: string
  p_bid_id?: string
  p_branch_org_id?: string
  terms_document_path?: string
  terms_document_bucket?: string
  terms_document_name?: string
  terms_company_name?: string
  terms_branch_name?: string
  terms_acknowledged_at?: string
}

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
    const {
      p_quote_id,
      p_bid_id,
      p_branch_org_id,
      terms_document_path,
      terms_document_bucket,
      terms_document_name,
      terms_company_name,
      terms_branch_name,
      terms_acknowledged_at,
    } = (req.body || {}) as AcceptBidRequestBody
    if (!p_quote_id || !p_bid_id || !p_branch_org_id) {
      res.status(400).json({ error: 'Missing p_quote_id, p_bid_id, or p_branch_org_id' })
      return
    }

    // Authorization: require Supabase bearer token
    const authHeader = String(req.headers.authorization || '')
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization bearer token' })
      return
    }

    // Identify the user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    const userId = userRes.user.id

    // Ownership check: user must be member (editor/admin) of the quote's owner org
    const { data: quoteRow, error: quoteErr } = await supabaseAdmin
      .from('quotes')
      .select('id, owner_org_id, status')
      .eq('id', p_quote_id)
      .single()

    if (quoteErr || !quoteRow) {
      res.status(404).json({ error: 'Quote not found' })
      return
    }

    const { data: membership, error: memErr } = await supabaseAdmin
      .from('memberships')
      .select('user_id, org_id, role')
      .eq('user_id', userId)
      .eq('org_id', quoteRow.owner_org_id)
      .in('role', ['editor', 'admin'])
      .maybeSingle()

    if (memErr || !membership) {
      res.status(403).json({ error: 'Not authorized to accept bids for this quote' })
      return
    }

    // Optional sanity check: ensure bid belongs to quote
    const { data: bidRow, error: bidErr } = await supabaseAdmin
      .from('bids')
      .select('id, quote_id, branch_org_id, logistics_partner_id')
      .eq('id', p_bid_id)
      .maybeSingle()
    if (bidErr || !bidRow || bidRow.quote_id !== p_quote_id) {
      res.status(400).json({ error: 'Bid does not belong to quote' })
      return
    }

    if (!bidRow.branch_org_id) {
      res.status(400).json({ error: 'Bid is missing branch_org_id' })
      return
    }

    if (bidRow.branch_org_id !== p_branch_org_id) {
      res.status(400).json({ error: 'Branch mismatch for bid' })
      return
    }

    const { data: branchOrg, error: branchErr } = await supabaseAdmin
      .from('organizations')
      .select('id, parent_org_id, name, branch_name')
      .eq('id', p_branch_org_id)
      .maybeSingle()
    if (branchErr || !branchOrg) {
      res.status(400).json({ error: 'Branch organization not found' })
      return
    }

    const { data: partnerRow, error: partnerErr } = await supabaseAdmin
      .from('logistics_partners')
      .select('id, org_id, name')
      .eq('id', bidRow.logistics_partner_id)
      .maybeSingle()
    if (partnerErr || !partnerRow) {
      res.status(400).json({ error: 'Logistics partner not found for bid' })
      return
    }

    if (branchOrg.parent_org_id !== partnerRow.org_id) {
      res.status(400).json({ error: 'Branch does not belong to the logistics partner organization' })
      return
    }

    const trimmedPath = typeof terms_document_path === 'string' ? terms_document_path.trim().replace(/^\/+/, '') : ''
    const termsPath = trimmedPath.length > 0 ? trimmedPath : null
    const termsBucket = termsPath
      ? (typeof terms_document_bucket === 'string' && terms_document_bucket.trim().length > 0
          ? terms_document_bucket.trim()
          : 'TCs')
      : null
    const safeCompanyName =
      (typeof terms_company_name === 'string' && terms_company_name.trim().length > 0
        ? terms_company_name.trim()
        : partnerRow?.name || null)
    const safeBranchName =
      (typeof terms_branch_name === 'string' && terms_branch_name.trim().length > 0
        ? terms_branch_name.trim()
        : (branchOrg?.branch_name || branchOrg?.name || null))
    const ensurePdfName = (value: string) => (value.toLowerCase().endsWith('.pdf') ? value : `${value}.pdf`)
    const computedFileName = (() => {
      if (typeof terms_document_name === 'string' && terms_document_name.trim().length > 0) {
        return ensurePdfName(terms_document_name.trim())
      }
      const parts = [safeCompanyName, safeBranchName].filter(Boolean) as string[]
      const base = parts.length > 0 ? `${parts.join(' — ')} Terms & Conditions` : 'Terms & Conditions'
      return ensurePdfName(base)
    })()
    const acknowledgedAtIso = (() => {
      if (typeof terms_acknowledged_at === 'string' && terms_acknowledged_at.trim().length > 0) {
        const parsed = new Date(terms_acknowledged_at)
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString()
        }
      }
      return new Date().toISOString()
    })()

    // Create a user-scoped client so auth.uid() is available inside the SQL function
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(500).json({ ok: false, error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' })
      return
    }

    const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Call RPC as the user so RLS and auth.uid() apply correctly
    const { data, error } = await supabaseAsUser.rpc('accept_bid_with_compliance', {
      p_quote_id,
      p_bid_id,
      p_branch_org_id,
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

    const shipmentId = typeof data === 'string' ? data : String(data || '')
    if (!shipmentId) {
      res.status(500).json({ ok: false, error: 'accept_bid_with_compliance returned no shipment id' })
      return
    }

    if (termsPath && termsBucket) {
      const storedPath = `${termsBucket}::${termsPath}`
      const fallbackName = computedFileName || termsPath.split('/').pop() || 'Terms & Conditions.pdf'

      const { data: existingDoc, error: existingDocErr } = await supabaseAdmin
        .from('documents')
        .select('id')
        .eq('shipment_id', shipmentId)
        .eq('kind', 'terms_acceptance')
        .maybeSingle()

      if (existingDocErr) {
        console.error('[accept-bid] Failed to query existing terms acceptance document', {
          shipmentId,
          error: existingDocErr.message,
        })
        res.status(500).json({ ok: false, error: 'Failed to record terms acceptance (lookup).' })
        return
      }

      if (existingDoc) {
        const { error: updateErr } = await supabaseAdmin
          .from('documents')
          .update({
            file_url: storedPath,
            original_filename: fallbackName,
            uploaded_by: userId,
            created_at: acknowledgedAtIso,
            kind: 'terms_acceptance',
          })
          .eq('id', existingDoc.id)

        if (updateErr) {
          console.error('[accept-bid] Failed to update terms acceptance document', {
            shipmentId,
            documentId: existingDoc.id,
            error: updateErr.message,
          })
          res.status(500).json({ ok: false, error: 'Failed to record terms acceptance (update).' })
          return
        }
      } else {
        const { error: insertErr } = await supabaseAdmin
          .from('documents')
          .insert({
            shipment_id: shipmentId,
            file_url: storedPath,
            original_filename: fallbackName,
            uploaded_by: userId,
            kind: 'terms_acceptance',
            created_at: acknowledgedAtIso,
          })

        if (insertErr) {
          console.error('[accept-bid] Failed to insert terms acceptance document', {
            shipmentId,
            storedPath,
            error: insertErr.message,
          })
          res.status(500).json({ ok: false, error: 'Failed to record terms acceptance.' })
          return
        }
      }
    }

    res.status(200).json({ ok: true, shipment_id: shipmentId })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' })
  }
}
