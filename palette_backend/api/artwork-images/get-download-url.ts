import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { setCorsHeaders } from '../../src/utils/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
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

    const artworkId = String(req.query?.artwork_id || req.query?.id || '').trim();
    if (!artworkId) {
      res.status(400).json({ error: 'Missing artwork_id' });
      return;
    }

    const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: artwork, error: artworkErr } = await supabaseAsUser
      .from('quote_artworks')
      .select('id, image_url')
      .eq('id', artworkId)
      .single();

    if (artworkErr || !artwork) {
      res.status(403).json({ error: 'Not authorized to view this artwork or it does not exist' });
      return;
    }

    if (!artwork.image_url) {
      res.status(404).json({ error: 'Artwork does not have an image on file' });
      return;
    }

    const storedValue = String(artwork.image_url);
    if (storedValue.startsWith('http://') || storedValue.startsWith('https://')) {
      res.status(200).json({ ok: true, result: { url: storedValue, legacy: true } });
      return;
    }

    const expiresIn = 60; // seconds
    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storedValue, expiresIn);

    if (signedErr || !signed?.signedUrl) {
      res.status(500).json({ error: 'Failed to create signed URL', details: signedErr?.message });
      return;
    }

    res.status(200).json({ ok: true, result: { url: signed.signedUrl, legacy: false } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
