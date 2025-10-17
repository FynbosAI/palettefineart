export interface ArtworkImageCreateUploadParams {
  quoteId: string;
  artworkId: string;
  accessToken: string;
  originalFilename?: string | null;
  contentType?: string | null;
  baseUrl?: string;
}

export interface ArtworkImageCreateUploadResult {
  path: string;
  token: string;
  bucket: string;
}

export interface ArtworkImageConfirmUploadParams {
  quoteId: string;
  artworkId: string;
  path: string;
  accessToken: string;
  originalFilename?: string | null;
  baseUrl?: string;
}

export interface ArtworkImageConfirmUploadResult {
  id: string;
  path: string;
  original_filename: string | null;
}

export interface ArtworkImageGetUrlParams {
  artworkId: string;
  accessToken: string;
  baseUrl?: string;
}

export interface ArtworkImageGetUrlResult {
  url: string;
  legacy: boolean;
}

interface BackendEnvelope<T> {
  ok?: boolean;
  result?: T;
  error?: string;
  details?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const DEFAULT_API_BASE_URL = (() => {
  try {
    // Vite will replace import.meta.env at build time
    return (import.meta as any)?.env?.VITE_API_BASE_URL || 'http://localhost:3002';
  } catch (_err) {
    if (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) {
      return process.env.VITE_API_BASE_URL;
    }
    return 'http://localhost:3002';
  }
})();

function resolveBaseUrl(override?: string) {
  return override?.trim() || DEFAULT_API_BASE_URL;
}

async function requestJson<T>(
  input: RequestInfo,
  init: RequestInit,
  controller: AbortController
): Promise<T> {
  const response = await fetch(input, { ...init, signal: controller.signal });
  const text = await response.text();
  let parsed: BackendEnvelope<T>;
  try {
    parsed = text ? (JSON.parse(text) as BackendEnvelope<T>) : { ok: response.ok };
  } catch (err) {
    throw new Error(`Unexpected response format: ${(err as Error).message}`);
  }

  if (!response.ok || !parsed?.ok || !parsed.result) {
    const message = parsed?.error || response.statusText || 'Request failed';
    const details = parsed?.details ? ` (${parsed.details})` : '';
    throw new Error(`${message}${details}`);
  }

  return parsed.result;
}

export async function createArtworkImageUpload(
  params: ArtworkImageCreateUploadParams
): Promise<ArtworkImageCreateUploadResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const baseUrl = resolveBaseUrl(params.baseUrl);
    const body = {
      quote_id: params.quoteId,
      artwork_id: params.artworkId,
      original_filename: params.originalFilename ?? null,
      content_type: params.contentType ?? null,
    };

    return await requestJson<ArtworkImageCreateUploadResult>(
      `${baseUrl}/api/artwork-images/create-upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.accessToken}`,
        },
        body: JSON.stringify(body),
      },
      controller
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function confirmArtworkImageUpload(
  params: ArtworkImageConfirmUploadParams
): Promise<ArtworkImageConfirmUploadResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const baseUrl = resolveBaseUrl(params.baseUrl);
    const body = {
      quote_id: params.quoteId,
      artwork_id: params.artworkId,
      path: params.path,
      original_filename: params.originalFilename ?? null,
    };

    return await requestJson<ArtworkImageConfirmUploadResult>(
      `${baseUrl}/api/artwork-images/confirm-upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.accessToken}`,
        },
        body: JSON.stringify(body),
      },
      controller
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function getArtworkImageViewUrl(
  params: ArtworkImageGetUrlParams
): Promise<ArtworkImageGetUrlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const baseUrl = resolveBaseUrl(params.baseUrl);
    const url = new URL(`${baseUrl}/api/artwork-images/get-download-url`);
    url.searchParams.set('artwork_id', params.artworkId);

    return await requestJson<ArtworkImageGetUrlResult>(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
        },
      },
      controller
    );
  } finally {
    clearTimeout(timeout);
  }
}
