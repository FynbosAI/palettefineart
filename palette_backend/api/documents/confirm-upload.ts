import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { DocumentAccessError, resolveShipmentAccessForUser } from '../../src/utils/documents.js';
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
    const BUCKET = process.env.STORAGE_SHIPMENT_DOCS_BUCKET || 'shipment-docs';
    if (!BUCKET) {
      res.status(500).json({ error: 'Server misconfiguration (missing STORAGE_SHIPMENT_DOCS_BUCKET)' });
      return;
    }

    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    // Identify user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const userId = userRes.user.id;

    const { shipment_id, path, original_filename, kind, branch_org_id } = (req.body || {}) as {
      shipment_id?: string;
      path?: string;
      original_filename?: string | null;
      kind?: string | null;
      branch_org_id?: string | null;
    };

    if (!shipment_id || !path) {
      res.status(400).json({ error: 'Missing shipment_id or path' });
      return;
    }

    const { data: ship, error: shipErr } = await supabaseAdmin
      .from('shipments')
      .select('id, logistics_partner_id, owner_org_id, quote_id')
      .eq('id', shipment_id)
      .single();
    if (shipErr || !ship) {
      res.status(404).json({ error: 'Shipment not found' });
      return;
    }

    const branchOrgId = branch_org_id ?? null;

    let access;
    try {
      access = await resolveShipmentAccessForUser(ship as any, userId, { branchOrgId });
    } catch (err) {
      if (err instanceof DocumentAccessError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }

    if (!access.ownerAccess && !access.branchAccess) {
      console.warn('[documents/confirm-upload] Unauthorized confirm attempt', {
        shipmentId: shipment_id,
        userId,
        logisticsPartnerId: ship.logistics_partner_id || null,
        ownerOrgId: ship.owner_org_id || null,
        branchOrgId: branchOrgId || null,
      });
      res.status(403).json({ error: 'Not authorized to confirm documents for this shipment' });
      return;
    }

    // Quick existence check for the uploaded object
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
    const found = list?.some((o) => o.name === filename);
    if (!found) {
      res.status(400).json({ error: 'Uploaded object not found in storage' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        shipment_id,
        file_url: path,
        uploaded_by: userId,
        kind: kind || null,
        original_filename: original_filename || null,
      } as any)
      .select('id')
      .single();

    if (error || !data) {
      console.error('[documents/confirm-upload] Insert failed', {
        shipmentId: shipment_id,
        userId,
        error: (error as any)?.message || error,
      });
      res.status(400).json({ error: 'Failed to create document record', details: (error as any)?.message });
      return;
    }

    res.status(200).json({ ok: true, result: { id: data.id } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
