import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { setCorsHeaders } from '../../src/utils/cors.js';

const DEFAULT_BUCKET = process.env.STORAGE_SHIPMENT_DOCS_BUCKET || 'shipment-docs';

const parseStorageReference = (raw: string | null | undefined): { bucket: string; path: string } => {
  const fallbackBucket = DEFAULT_BUCKET || 'shipment-docs';
  if (!raw) {
    return { bucket: fallbackBucket, path: '' };
  }
  const value = raw.trim();
  if (value.includes('::')) {
    const [bucketPart, ...rest] = value.split('::');
    const bucket = bucketPart?.trim() || fallbackBucket;
    const path = rest.join('::').replace(/^\/+/, '').trim();
    return { bucket, path };
  }
  if (value.startsWith('shipments/')) {
    return { bucket: fallbackBucket, path: value };
  }
  return { bucket: fallbackBucket, path: value };
};

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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
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

    const id = String((req.query?.id as string) || '');
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    // Query document as the user; rely on RLS to authorize access
    const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: doc, error: docErr } = await supabaseAsUser
      .from('documents')
      .select('id, file_url, original_filename')
      .eq('id', id)
      .single();

    if (docErr || !doc) {
      res.status(403).json({ error: 'Not authorized to view this document or it does not exist' });
      return;
    }

    const { bucket: bucketName, path: objectPath } = parseStorageReference(doc.file_url as string);
    if (!objectPath) {
      res.status(404).json({ error: 'Document path is missing' });
      return;
    }

    const wantsInline = (() => {
      const mode = String((req.query?.mode as string) || '').toLowerCase();
      if (mode === 'inline' || mode === 'preview') return true;
      const inlineFlag = String((req.query?.inline as string) || '').toLowerCase();
      return inlineFlag === '1' || inlineFlag === 'true';
    })();

    // Create a short-lived signed URL for download/preview
    const expiresIn = wantsInline ? 300 : 90; // seconds
    const signedOptions = wantsInline
      ? undefined
      : ({ download: (doc.original_filename as string) || undefined } as any);

    const { data: signed, error } = await supabaseAdmin.storage
      .from(bucketName)
      .createSignedUrl(objectPath, expiresIn, signedOptions);

    if (error || !signed?.signedUrl) {
      res.status(500).json({ error: 'Failed to create signed URL', details: error?.message });
      return;
    }

    res.status(200).json({ ok: true, result: { url: signed.signedUrl } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
