import crypto from 'crypto';

// Base64 URL helpers
function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4);
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(base64, 'base64');
}

// Derive a 256-bit key from a secret string
function deriveKey(secret: string): Buffer {
  // If secret looks like hex or base64 of correct length, try to use directly
  const trimmed = (secret || '').trim();
  try {
    // 32-byte raw key in hex
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    // 32-byte raw key in base64
    const asBuf = Buffer.from(trimmed, 'base64');
    if (asBuf.length === 32) return asBuf;
  } catch (_) {
    // fall through to KDF
  }
  // Fallback: HKDF-like derivation using SHA-256
  return crypto.createHash('sha256').update(trimmed).digest();
}

export interface SessionLinkPayload {
  user_id: string;
  target_app: 'shipper' | 'gallery';
  refresh_token: string;
  redirect_path?: string;
  exp: number; // unix seconds
}

export function createSessionLinkToken(payload: SessionLinkPayload, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12); // AES-GCM 96-bit IV
  const header = Buffer.from(JSON.stringify({ v: 1, alg: 'A256GCM' }), 'utf8');
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [b64urlEncode(header), b64urlEncode(iv), b64urlEncode(ciphertext), b64urlEncode(tag)].join('.');
}

export function parseSessionLinkToken(token: string, secret: string): SessionLinkPayload {
  const key = deriveKey(secret);
  const parts = token.split('.');
  if (parts.length !== 4) throw new Error('Invalid token format');
  const [h, i, c, t] = parts;
  const header = b64urlDecode(h);
  const iv = b64urlDecode(i);
  const ciphertext = b64urlDecode(c);
  const tag = b64urlDecode(t);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const payload = JSON.parse(plaintext.toString('utf8')) as SessionLinkPayload;
  return payload;
}

