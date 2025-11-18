import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../../src/utils/cors.js';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { provisionUserConversations } from '../../src/services/chat/chatProvisioner.js';

interface ProvisionRequestBody {
  organizationIds?: string[];
}

const parseBody = (body: unknown): ProvisionRequestBody => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      console.warn('[chat/provision] Failed to parse JSON body', error);
      return {};
    }
  }
  if (typeof body === 'object') {
    return body as ProvisionRequestBody;
  }
  return {};
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
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token', details: userErr?.message });
      return;
    }

    const userId = userRes.user.id;
    const body = parseBody(req.body);

    const result = await provisionUserConversations(userId, {
      organizationIds: Array.isArray(body.organizationIds) ? body.organizationIds : undefined,
    });

    res.status(200).json({ ok: true, result });
  } catch (error: any) {
    console.error('[chat/provision] error', error);
    res.status(500).json({ error: error?.message || 'Internal Server Error' });
  }
}
