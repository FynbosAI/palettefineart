import type { VercelResponse } from '@vercel/node';

function getAllowedOrigins(): string[] {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  // Default localhost origins for development if none provided
  const defaults = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
  ];
  return envOrigins.length > 0 ? envOrigins : defaults;
}

function normaliseToUrl(value: string): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

function matchesVercelPreview(originUrl: URL, allowedUrl: URL): boolean {
  const originHost = originUrl.hostname.toLowerCase();
  const allowedHost = allowedUrl.hostname.toLowerCase();

  if (!allowedHost.endsWith('.vercel.app')) {
    return false;
  }
  if (!originHost.endsWith('.vercel.app')) {
    return false;
  }

  const baseProject = allowedHost.slice(0, -'.vercel.app'.length);
  if (!baseProject) {
    return false;
  }

  return originHost.startsWith(`${baseProject}-git-`);
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin || allowedOrigins.length === 0) {
    return false;
  }

  const originUrl = normaliseToUrl(origin);
  if (!originUrl) {
    return false;
  }

  return allowedOrigins.some(allowed => {
    if (allowed === '*') {
      return true;
    }

    const allowedUrl = normaliseToUrl(allowed);
    if (!allowedUrl) {
      return false;
    }

    if (originUrl.origin === allowedUrl.origin) {
      return true;
    }

    return matchesVercelPreview(originUrl, allowedUrl);
  });
}

export function setCorsHeaders(res: VercelResponse, origin?: string, methods = 'GET, POST, OPTIONS') {
  const allowedOrigins = getAllowedOrigins();
  try {
    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      // Ensure caches differentiate by Origin
      res.setHeader('Vary', 'Origin');
    } else if (!origin) {
      // In some server-to-server invocations there is no Origin header
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } catch (error) {
    console.error('[cors] origin evaluation failed', error);
    if (!res.headersSent) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    }
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  // Allow common headers used by our frontends and Supabase client
  // Keep names case-insensitive; browsers compare case-insensitively
  res.setHeader(
    'Access-Control-Allow-Headers',
    [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Accept-Language',
      'Cache-Control',
      'Pragma',
      'X-Client-Info'
    ].join(', ')
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Cache successful preflights for 10 minutes where supported
  res.setHeader('Access-Control-Max-Age', '600');
}
