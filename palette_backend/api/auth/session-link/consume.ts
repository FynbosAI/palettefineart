import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decryptAesGcm } from '../../../src/utils/crypto.js';
import { setCorsHeaders } from '../../../src/utils/cors.js';
import { supabaseAdmin } from '../../../src/supabaseClient.js';
import { parseSessionLinkToken } from '../../../src/utils/sessionLink.js';

function isSchemaMissingError(message?: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('session_link') || normalized.includes('session_links');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const secret = process.env.SESSION_LINK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!secret) {
      console.error('[session-link/consume] Missing SESSION_LINK_SECRET');
      res.status(500).json({ error: 'Server misconfiguration (missing SESSION_LINK_SECRET)' });
      return;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[session-link/consume] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
      res.status(500).json({ error: 'Server misconfiguration (missing SUPABASE_URL or SUPABASE_ANON_KEY)' });
      return;
    }

    const { link } = (req.body || {}) as { link?: string };
    if (!link) {
      console.error('[session-link/consume] Missing link param');
      res.status(400).json({ error: 'Missing link' });
      return;
    }

    let fallbackToToken = false;
    let refresh_token: string | undefined;
    let redirect_path = '/dashboard';
    let target_app: 'shipper' | 'gallery' = 'shipper';
    let user_id: string | undefined;
    let expSeconds: number | undefined;
    let branchOrgId: string | null = null;
    let companyOrgId: string | null = null;

    // Atomically claim the link (single-use + not expired)
    const nowIso = new Date().toISOString();
    const claimResp = await supabaseAdmin
      .from('session_links')
      .update({ used_at: nowIso })
      .eq('id', link)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .select('id, user_id, target_app, redirect_path, expires_at, branch_org_id, company_org_id')
      .single();

    let claimed = claimResp.data ?? null;

    if (claimResp.error) {
      if (isSchemaMissingError(claimResp.error.message)) {
        console.warn('[session-link/consume] session_links schema missing – falling back to token mode');
        fallbackToToken = true;
        claimed = null;
      } else {
        console.error('[session-link/consume] claim failed:', claimResp.error.message);
        res.status(400).json({ error: 'Invalid, expired, or already used link', details: claimResp.error.message });
        return;
      }
    }

    if (!fallbackToToken) {
      if (!claimed) {
        console.error('[session-link/consume] claim failed: link not found or already used');
        res.status(400).json({ error: 'Invalid, expired, or already used link' });
        return;
      }

      branchOrgId = claimed.branch_org_id as string | null;
      companyOrgId = claimed.company_org_id as string | null;

      if (!branchOrgId || !companyOrgId) {
        console.error('[session-link/consume] missing branch/company org on link', link);
        res.status(400).json({ error: 'Invalid link payload (org context missing)' });
        return;
      }

      const { data: membershipRow, error: membershipErr } = await supabaseAdmin
        .from('memberships')
        .select('company_id')
        .eq('user_id', claimed.user_id)
        .eq('org_id', branchOrgId)
        .maybeSingle();

      if (membershipErr || !membershipRow) {
        console.error('[session-link/consume] branch membership missing during handoff', membershipErr?.message);
        res.status(400).json({ error: 'Branch membership no longer valid for handoff' });
        return;
      }

      const membershipCompanyId = membershipRow.company_id as string | null;
      if (membershipCompanyId && membershipCompanyId !== companyOrgId) {
        console.error('[session-link/consume] company mismatch during handoff', {
          expected: companyOrgId,
          actual: membershipCompanyId,
        });
        res.status(400).json({ error: 'Branch/company mismatch for handoff' });
        return;
      }

      const viewResp = await supabaseAdmin
        .from('session_links_api')
        .select('encrypted_refresh_b64, nonce_b64')
        .eq('id', link)
        .single();

      if (viewResp.error || !viewResp.data) {
        console.error('[session-link/consume] view read failed:', viewResp.error?.message);
        res.status(500).json({ error: 'Failed to load handoff payload', details: viewResp.error?.message });
        return;
      }

      const iv = Buffer.from(String(viewResp.data.nonce_b64), 'base64');
      const ciphertextWithTag = Buffer.from(String(viewResp.data.encrypted_refresh_b64), 'base64');
      if (iv.length !== 12) {
        console.error('[session-link/consume] invalid IV length:', iv.length);
        res.status(500).json({ error: 'Invalid handoff payload (iv)' });
        return;
      }

      const refreshBuf = decryptAesGcm(ciphertextWithTag, iv, secret);
      refresh_token = refreshBuf.toString('utf8');
      redirect_path = claimed.redirect_path || '/dashboard';
      target_app = claimed.target_app as 'shipper' | 'gallery';
      user_id = claimed.user_id;
      expSeconds = Math.floor(new Date(claimed.expires_at as any).getTime() / 1000);
    } else {
      try {
        const payload = parseSessionLinkToken(link, secret);
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < nowSeconds) {
          res.status(400).json({ error: 'Invalid, expired, or already used link' });
          return;
        }
        refresh_token = payload.refresh_token;
        redirect_path = payload.redirect_path || '/dashboard';
        target_app = payload.target_app;
        user_id = payload.user_id;
        expSeconds = payload.exp;
        branchOrgId = null;
        companyOrgId = null;
      } catch (tokenErr: any) {
        console.error('[session-link/consume] token fallback parse failed:', tokenErr?.message);
        res.status(400).json({ error: 'Invalid link', details: tokenErr?.message });
        return;
      }
    }

    if (!refresh_token) {
      res.status(400).json({ error: 'Invalid link' });
      return;
    }

    // Exchange refresh_token for a fresh access_token using GoTrue endpoint
    const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[session-link/consume] token exchange failed:', err);
      res.status(400).json({ error: 'Failed to exchange refresh token', details: err });
      return;
    }
    const tokenJson = await resp.json();
    const access_token = tokenJson?.access_token as string | undefined;
    const new_refresh_token = (tokenJson?.refresh_token as string | undefined) || refresh_token;

    res.status(200).json({
      access_token,
      refresh_token: new_refresh_token,
      target_app,
      redirect_path,
      user_id,
      branch_org_id: branchOrgId,
      company_org_id: companyOrgId,
      exp: expSeconds || Math.floor(Date.now() / 1000) + 60,
    });
  } catch (err: any) {
    console.error('[session-link/consume] exception:', err?.message, err?.stack);
    res.status(400).json({ error: err?.message || 'Invalid link' });
  }
}
