import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
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

    const { shipment_id, original_filename, kind, content_type, branch_org_id } = (req.body || {}) as {
      shipment_id?: string;
      original_filename?: string;
      kind?: string | null;
      content_type?: string | null;
      branch_org_id?: string | null;
    };

    if (!shipment_id) {
      res.status(400).json({ error: 'Missing shipment_id' });
      return;
    }

    // Authorization: allow logistics partner editors/admins OR gallery owner-org editors/admins
    // Resolve the orgs tied to this shipment
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
      console.warn('[documents/create-upload] Unauthorized upload attempt', {
        shipmentId: shipment_id,
        userId,
        logisticsPartnerId: ship.logistics_partner_id || null,
        ownerOrgId: ship.owner_org_id || null,
        branchOrgId: branchOrgId || null,
      });
      res.status(403).json({ error: 'Not authorized to upload documents for this shipment' });
      return;
    }

    // Build storage path: shipments/<shipment_id>/<uuid>.<ext>
    const safeExt = (() => {
      const fromName = (original_filename || '').split('.').pop();
      const ext = (fromName || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (ext && ext.length <= 8) return `.${ext}`;
      // try infer from content_type
      if (content_type) {
        if (content_type.includes('pdf')) return '.pdf';
        if (content_type.includes('png')) return '.png';
        if (content_type.includes('jpg') || content_type.includes('jpeg')) return '.jpg';
      }
      return '';
    })();

    const objectName = `${randomUUID()}${safeExt}`;
    const path = `shipments/${shipment_id}/${objectName}`;

    // Create a signed upload URL (short-lived, one-time)
    const { data: bucketInfo, error: bucketErr } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (bucketErr) {
      console.error('[documents/create-upload] Failed to inspect storage bucket', {
        bucket: BUCKET,
        error: bucketErr.message,
      });
      res.status(500).json({ error: 'Failed to inspect storage bucket', details: bucketErr.message });
      return;
    }

    if (!bucketInfo) {
      const { error: createBucketErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: undefined,
      } as any);
      if (createBucketErr && !createBucketErr.message?.includes('already exists')) {
        console.error('[documents/create-upload] Failed to create storage bucket', {
          bucket: BUCKET,
          error: createBucketErr.message,
        });
        res.status(500).json({ error: 'Failed to provision storage bucket', details: createBucketErr.message });
        return;
      }
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !signed?.token || !signed?.path) {
      res.status(500).json({ error: 'Failed to create signed upload URL', details: error?.message });
      return;
    }

    // Return token + path; client will call uploadToSignedUrl(path, token, file)
    res.status(200).json({ ok: true, result: { path, token: signed.token, kind: kind || null } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
