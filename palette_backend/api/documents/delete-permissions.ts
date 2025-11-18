import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { DocumentAccessError, buildDocumentPermissionsForUser } from '../../src/utils/documents.js';
import { setCorsHeaders } from '../../src/utils/cors.js';

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
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    const { shipment_id } = (req.body || {}) as { shipment_id?: string };
    if (!shipment_id) {
      res.status(400).json({ error: 'Missing shipment_id' });
      return;
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const userId = userRes.user.id;

    const { permissionsById } = await buildDocumentPermissionsForUser(shipment_id, userId);
    const deletableIds = Array.from(permissionsById.values())
      .filter(permission => permission.canDelete)
      .map(permission => permission.document.id);

    res.status(200).json({ ok: true, result: { deletableIds } });
  } catch (err: any) {
    if (err instanceof DocumentAccessError) {
      if (err.status >= 500) {
        console.error('[documents/delete-permissions] Document access error', {
          status: err.status,
          message: err.message,
        });
      }
      res.status(err.status).json({ error: err.message });
      return;
    }

    console.error('[documents/delete-permissions] Unexpected error', {
      message: err?.message || String(err),
    });
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
