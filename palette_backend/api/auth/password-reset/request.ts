import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../../../src/utils/cors.js';
import PasswordResetService, { PasswordResetError } from '../../../src/services/auth/passwordReset.js';

const resolveRedirect = (): string => {
  const explicit = process.env.GALLERY_RESET_PASSWORD_URL
    || process.env.PASSWORD_RESET_REDIRECT_URL;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const base = (
    process.env.GALLERY_APP_URL
    || process.env.VITE_GALLERY_APP_URL
    || process.env.SITE_URL
    || 'http://localhost:5173'
  ).trim().replace(/\/+$/, '');

  return `${base}/reset-password`;
};

const extractEmail = (req: VercelRequest): unknown => {
  if (req.body && typeof req.body === 'object') {
    const candidate = (req.body as Record<string, unknown>).email;
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed.email === 'string') {
        return parsed.email;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const redirectTo = resolveRedirect();
    const result = await PasswordResetService.requestPasswordReset(extractEmail(req), { redirectTo });

    const logBase = {
      emailHash: result.emailHash,
      supabaseStatus: result.supabaseStatus,
      supabaseStatusCode: result.supabaseStatusCode,
      ...(result.supabaseErrorCode ? { supabaseErrorCode: result.supabaseErrorCode } : {}),
      ...(result.supabaseErrorMessage ? { supabaseErrorMessage: result.supabaseErrorMessage } : {}),
    };

    if (result.supabaseStatus === 'success') {
      console.info('[password-reset/request] accepted', logBase);
      res.status(202).json({ status: 'accepted' });
      return;
    }

    console.warn('[password-reset/request] rejected-upstream', logBase);
    res.status(503).json({ error: 'reset_unavailable' });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      console.error('[password-reset/request] rejected', {
        status: error.status,
        message: error.message,
      });
      res.status(error.status).json({ error: error.message });
      return;
    }

    console.error('[password-reset/request] unexpected error', error);
    res.status(500).json({ error: 'Unexpected server error' });
  }
}
