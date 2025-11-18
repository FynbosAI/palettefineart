import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { setCorsHeaders } from '../../src/utils/cors.js';

interface ConfirmUploadBody {
  quote_id?: string;
  artwork_id?: string;
  path?: string;
  original_filename?: string | null;
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
    const BUCKET = process.env.STORAGE_ARTWORK_IMAGES_BUCKET || 'artwork-imgs';
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!BUCKET) {
      res.status(500).json({ error: 'Server misconfiguration (missing STORAGE_ARTWORK_IMAGES_BUCKET)' });
      return;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(500).json({ error: 'Server misconfiguration (missing SUPABASE_URL or SUPABASE_ANON_KEY)' });
      return;
    }

    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    const body = (req.body || {}) as ConfirmUploadBody;
    const quoteId = body.quote_id?.trim();
    const artworkId = body.artwork_id?.trim();
    const path = body.path?.trim();

    if (!quoteId || !artworkId || !path) {
      res.status(400).json({ error: 'Missing quote_id, artwork_id, or path' });
      return;
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const userId = userRes.user.id;

    const { data: artwork, error: artworkErr } = await supabaseAdmin
      .from('quote_artworks')
      .select('id, quote_id, locked_at')
      .eq('id', artworkId)
      .eq('quote_id', quoteId)
      .single();

    if (artworkErr || !artwork) {
      res.status(404).json({ error: 'Quote artwork not found' });
      return;
    }

    if (artwork.locked_at) {
      res.status(409).json({ error: 'Artwork is locked and cannot be updated' });
      return;
    }

    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from('quotes')
      .select('id, owner_org_id')
      .eq('id', quoteId)
      .single();

    if (quoteErr || !quote?.owner_org_id) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    const requiredPrefix = `${quote.owner_org_id}/${quoteId}/${artworkId}/`;
    if (!path.startsWith(requiredPrefix)) {
      res.status(400).json({ error: 'Storage path does not match expected prefix for this artwork' });
      return;
    }

    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from('memberships')
      .select('user_id')
      .eq('user_id', userId)
      .eq('org_id', quote.owner_org_id)
      .in('role', ['editor', 'admin'])
      .maybeSingle();

    if (membershipErr || !membership) {
      res.status(403).json({ error: 'Not authorized to confirm artwork uploads for this quote' });
      return;
    }

    const prefix = path.split('/').slice(0, -1).join('/');
    const filename = path.split('/').pop();
    if (!filename) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const { data: list, error: listErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(prefix, { search: filename, limit: 10 });

    if (listErr) {
      res.status(500).json({ error: 'Failed to verify uploaded object', details: listErr.message });
      return;
    }

    const found = list?.some((entry) => entry.name === filename);
    if (!found) {
      res.status(400).json({ error: 'Uploaded object not found in storage' });
      return;
    }

    const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: updated, error: updateErr } = await supabaseAsUser
      .from('quote_artworks')
      .update({
        image_url: path,
        // future: store filename metadata when column exists
      } as any)
      .eq('id', artworkId)
      .eq('quote_id', quoteId)
      .is('locked_at', null)
      .select('id')
      .single();

    if (updateErr || !updated) {
      res.status(400).json({ error: 'Failed to update artwork record', details: (updateErr as any)?.message });
      return;
    }

    res.status(200).json({
      ok: true,
      result: {
        id: updated.id,
        path,
        original_filename: body.original_filename || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
