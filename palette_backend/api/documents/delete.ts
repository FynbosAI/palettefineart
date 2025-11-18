import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { DocumentAccessError, resolveDocumentPermission } from '../../src/utils/documents.js';
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

    const { id } = (req.body || {}) as { id?: string };
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const userId = userRes.user.id;

    const { permission, context } = await resolveDocumentPermission(id, userId);

    if (!permission.canDelete) {
      console.warn('[documents/delete] Unauthorized delete attempt', {
        documentId: id,
        userId,
        uploaderOrgId: permission.uploaderOrgId,
        uploaderOrgType: permission.uploaderOrgType,
        requesterHasOwnerAccess: permission.requesterHasOwnerAccess,
        requesterHasPartnerAccess: permission.requesterHasPartnerAccess,
        ownerOrgId: context.ownerOrgId,
        partnerOrgId: context.partnerOrgId,
      });
      res.status(403).json({ error: 'Not authorized to delete this document or it does not exist' });
      return;
    }

    const filePath = permission.document.file_url;
    if (filePath) {
      const { bucket, path } = parseStorageReference(filePath);
      if (path) {
        const { error: rmErr } = await supabaseAdmin.storage.from(bucket).remove([path]);
        if (rmErr) {
          console.error('[documents/delete] Failed to remove file from storage', {
            documentId: id,
            userId,
            error: rmErr.message,
          });
          res.status(500).json({ error: 'Failed to remove file from storage', details: rmErr.message });
          return;
        }
      } else {
        console.warn('[documents/delete] Document has empty storage path', {
          documentId: id,
          userId,
        });
      }
    } else {
      console.warn('[documents/delete] Document missing file path', {
        documentId: id,
        userId,
      });
    }

    const { error: delErr } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', id);
    if (delErr) {
      console.error('[documents/delete] Failed to delete document record', {
        documentId: id,
        userId,
        error: delErr.message,
      });
      res.status(500).json({ error: 'Failed to delete document record', details: delErr.message });
      return;
    }

    res.status(200).json({ ok: true, result: { id } });
  } catch (err: any) {
    if (err instanceof DocumentAccessError) {
      if (err.status >= 500) {
        console.error('[documents/delete] Document access error', {
          status: err.status,
          message: err.message,
        });
      }
      res.status(err.status).json({ error: err.message });
      return;
    }

    console.error('[documents/delete] Unexpected error', {
      message: err?.message || String(err),
    });
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
