import crypto from 'crypto';

// Derive a 256-bit key from a secret string
export function deriveKey(secret: string): Buffer {
  const trimmed = (secret || '').trim();
  try {
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    const asBuf = Buffer.from(trimmed, 'base64');
    if (asBuf.length === 32) return asBuf;
  } catch {
    // fall through to KDF
  }
  return crypto.createHash('sha256').update(trimmed).digest();
}

// Encrypt with AES-256-GCM, returning iv and ciphertext||tag (concatenated)
export function encryptAesGcm(plaintext: Buffer | string, secret: string): { iv: Buffer; ciphertextWithTag: Buffer } {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const buffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertextWithTag: Buffer.concat([ciphertext, tag]) };
}

// Decrypt AES-256-GCM from iv and ciphertext||tag
export function decryptAesGcm(ciphertextWithTag: Buffer, iv: Buffer, secret: string): Buffer {
  const key = deriveKey(secret);
  if (ciphertextWithTag.length < 17) {
    throw new Error('Invalid ciphertext');
  }
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

