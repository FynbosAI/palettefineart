import type { VercelRequest } from '@vercel/node';
import Twilio from 'twilio';

const getOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseForwardedProto = (headerValue?: string | string[]) => {
  if (!headerValue) return undefined;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return value.split(',')[0];
};

const parseForwardedHeader = (headerValue?: string | string[]) => {
  if (!headerValue) return undefined;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const match = value.match(/proto=([^;]+)/i);
  return match?.[1];
};

const buildRequestUrl = (req: VercelRequest): string => {
  const forwardedProto = parseForwardedProto(
    (req.headers['x-forwarded-proto'] as string) ||
      (req.headers['x-forwarded-protocol'] as string)
  );
  const forwardedHeaderProto = parseForwardedHeader(req.headers['forwarded']);

  const proto =
    forwardedProto ||
    forwardedHeaderProto ||
    ((req.socket as any)?.encrypted ? 'https' : 'http');

  const host =
    (req.headers['x-forwarded-host'] as string) ||
    (req.headers['host'] as string) ||
    'localhost';

  return `${proto}://${host}${req.url ?? ''}`;
};

export const validateTwilioSignature = (
  req: VercelRequest,
  rawBody: string
): boolean => {
  const signature = req.headers['x-twilio-signature'];
  if (typeof signature !== 'string') {
    return false;
  }

  const authToken =
    getOptionalEnv('TWILIO_WEBHOOK_AUTH_TOKEN') ||
    getOptionalEnv('TWILIO_AUTH_TOKEN');

  if (!authToken) {
    console.warn('[twilio] Missing webhook auth token env; skipping signature validation');
    return true;
  }
  const url = buildRequestUrl(req);

  return Twilio.validateRequest(authToken, signature, url, rawBody as any);
};
