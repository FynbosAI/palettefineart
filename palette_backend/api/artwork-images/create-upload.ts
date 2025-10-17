import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { setCorsHeaders } from '../../src/utils/cors.js';

interface CreateUploadBody {
  quote_id?: string;
  artwork_id?: string;
  original_filename?: string | null;
  content_type?: string | null;
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
    if (!BUCKET) {
      res.status(500).json({ error: 'Server misconfiguration (missing STORAGE_ARTWORK_IMAGES_BUCKET)' });
      return;
    }

    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    const body = (req.body || {}) as CreateUploadBody;
    const quoteId = body.quote_id?.trim();
    const artworkId = body.artwork_id?.trim();
    if (!quoteId || !artworkId) {
      res.status(400).json({ error: 'Missing quote_id or artwork_id' });
      return;
    }

    // Identify user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const userId = userRes.user.id;

    // Ensure artwork exists and is still editable
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

    // Fetch owning organization for authorization
    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from('quotes')
      .select('id, owner_org_id')
      .eq('id', quoteId)
      .single();

    if (quoteErr || !quote?.owner_org_id) {
      res.status(404).json({ error: 'Quote not found' });
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
      res.status(403).json({ error: 'Not authorized to upload artwork images for this quote' });
      return;
    }

    const safeExt = (() => {
      const originalName = (body.original_filename || '').split('/').pop() || '';
      const fromName = originalName.split('.').pop();
      const ext = (fromName || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (ext && ext.length <= 8) {
        return `.${ext}`;
      }
      const contentType = body.content_type || '';
      if (contentType.includes('png')) return '.png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
      if (contentType.includes('webp')) return '.webp';
      if (contentType.includes('gif')) return '.gif';
      return '';
    })();

    const objectName = `${randomUUID()}${safeExt}`;
    const storagePath = `${quote.owner_org_id}/${quoteId}/${artworkId}/${objectName}`;

    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedErr || !signed?.token || !signed?.path) {
      res.status(500).json({ error: 'Failed to create signed upload URL', details: signedErr?.message });
      return;
    }

    res.status(200).json({
      ok: true,
      result: {
        path: storagePath,
        token: signed.token,
        bucket: BUCKET,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
