import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../../src/supabaseClient.js';
import { encryptAesGcm, deriveKey } from '../../../src/utils/crypto.js';
import { createSessionLinkToken } from '../../../src/utils/sessionLink.js';
import { setCorsHeaders } from '../../../src/utils/cors.js';

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
    if (!secret) {
      console.error('[session-link/create] Missing SESSION_LINK_SECRET');
      res.status(500).json({ error: 'Server misconfiguration (missing SESSION_LINK_SECRET)' });
      return;
    }

    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    // Identify user using access token
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      console.error('[session-link/create] getUser failed:', userErr?.message || 'no user');
      res.status(401).json({ error: 'Invalid or expired token', details: userErr?.message });
      return;
    }
    const userId = userRes.user.id;

    const { refresh_token, target_app, redirect_path } = (req.body || {}) as {
      refresh_token?: string;
      target_app?: 'shipper' | 'gallery';
      redirect_path?: string;
    };

    if (!refresh_token) {
      res.status(400).json({ error: 'Missing refresh_token' });
      return;
    }
    if (target_app !== 'shipper' && target_app !== 'gallery') {
      res.status(400).json({ error: 'Invalid target_app' });
      return;
    }

    // Resolve the user's current branch + company membership
    type MembershipRow = {
      org_id: string;
      company_id: string | null;
      organization?: { parent_org_id: string | null } | { parent_org_id: string | null }[] | null;
    };

    const extractParentOrgId = (row: MembershipRow | null): string | null => {
      if (!row?.organization) return null;
      const org = Array.isArray(row.organization) ? row.organization[0] : row.organization;
      return org?.parent_org_id ?? null;
    };

    let branchOrgId: string | null = null;
    let companyOrgId: string | null = null;

    const { data: profileRow, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('default_org')
      .eq('id', userId)
      .maybeSingle();

    if (profileRow?.default_org) {
      branchOrgId = profileRow.default_org as string;
      const { data: membershipRow, error: membershipErr } = await supabaseAdmin
        .from('memberships')
        .select('org_id, company_id, organization:organizations!memberships_org_id_fkey(parent_org_id)')
        .eq('user_id', userId)
        .eq('org_id', branchOrgId)
        .maybeSingle();

      if (membershipErr) {
        console.warn('[session-link/create] membership lookup failed for default_org:', membershipErr.message);
      } else if (membershipRow) {
        const typed = membershipRow as MembershipRow;
        companyOrgId = typed.company_id;
        if (!companyOrgId) {
          companyOrgId = extractParentOrgId(typed);
        }
      }
    } else if (profileErr) {
      console.warn('[session-link/create] profile lookup failed:', profileErr.message);
    }

    if (!branchOrgId || !companyOrgId) {
      const { data: firstMembership, error: firstMembershipErr } = await supabaseAdmin
        .from('memberships')
        .select('org_id, company_id, organization:organizations!memberships_org_id_fkey(parent_org_id)')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (firstMembershipErr) {
        console.error('[session-link/create] fallback membership lookup failed:', firstMembershipErr.message);
      } else if (firstMembership) {
        const typed = firstMembership as MembershipRow;
        branchOrgId = typed.org_id;
        companyOrgId = typed.company_id;
        if (!companyOrgId) {
          companyOrgId = extractParentOrgId(typed);
        }
      }
    }

    if (branchOrgId) {
      const { data: branchRow, error: branchErr } = await supabaseAdmin
        .from('organizations')
        .select('parent_org_id')
        .eq('id', branchOrgId)
        .maybeSingle();

      if (branchErr) {
        console.error('[session-link/create] organization lookup failed:', branchErr.message);
        branchOrgId = null;
        companyOrgId = null;
      } else {
        if (!branchRow?.parent_org_id) {
          console.error('[session-link/create] default_org is not a branch:', branchOrgId);
          branchOrgId = null;
          companyOrgId = null;
        } else if (!companyOrgId) {
          companyOrgId = branchRow.parent_org_id as string;
        } else if (companyOrgId !== branchRow.parent_org_id) {
          console.warn('[session-link/create] company mismatch, overriding with branch parent', {
            companyOrgId,
            parent: branchRow.parent_org_id,
          });
          companyOrgId = branchRow.parent_org_id as string;
        }
      }
    }

    if (!branchOrgId || !companyOrgId) {
      console.error('[session-link/create] unable to resolve branch/company org for user', userId);
      res.status(409).json({
        error: 'Branch membership unavailable for handoff',
      });
      return;
    }

    // TTL: 60 seconds
    const expiresAt = new Date(Date.now() + 60 * 1000);
    const expiresAtIso = expiresAt.toISOString();
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);

    // Encrypt the refresh token; store iv as nonce and ciphertext||tag as encrypted_refresh
    const { iv, ciphertextWithTag } = encryptAesGcm(refresh_token, secret);
    console.info('[session-link/create] key len:', deriveKey(secret).length, 'iv len:', iv.length, 'ct len:', ciphertextWithTag.length);

    // Insert via RPC to ensure server-side base64 -> bytea decode
    const { data, error } = await supabaseAdmin.rpc('session_link_put', {
      p_user_id: userId,
      p_target_app: target_app,
      p_redirect_path: redirect_path || null,
      p_encrypted_refresh_b64: ciphertextWithTag.toString('base64'),
      p_nonce_b64: iv.toString('base64'),
      p_expires_at: expiresAtIso,
      p_branch_org_id: branchOrgId,
      p_company_org_id: companyOrgId,
    });

    if (!error && data && Array.isArray(data) && data[0]?.id) {
      res.status(200).json({
        link: data[0].id,
        exp: expiresAtSeconds,
        branch_org_id: branchOrgId,
        company_org_id: companyOrgId,
      });
      return;
    }
    if (isSchemaMissingError(error?.message)) {
      console.warn('[session-link/create] session_links schema missing – falling back to token mode');
      try {
        const token = createSessionLinkToken({
          user_id: userId,
          target_app,
          refresh_token,
          redirect_path: redirect_path || undefined,
          exp: expiresAtSeconds,
        }, secret);
        res.status(200).json({ link: token, exp: expiresAtSeconds, mode: 'token' });
        return;
      } catch (tokenErr: any) {
        console.error('[session-link/create] token fallback failed:', tokenErr?.message);
        res.status(500).json({ error: 'Failed to create session link', details: tokenErr?.message });
        return;
      }
    }

    console.error('[session-link/create] rpc session_link_put failed:', error?.message);
    res.status(500).json({ error: 'Failed to create session link', details: error?.message });
  } catch (err: any) {
    console.error('[session-link/create] exception:', err?.message, err?.stack);
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
