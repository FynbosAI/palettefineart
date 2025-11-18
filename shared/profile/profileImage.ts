import type { SupabaseClient } from '@supabase/supabase-js';

export const PROFILE_IMAGE_BUCKET = 'user_profiles';
export const PROFILE_IMAGE_KEY_SUFFIX = '_profile_image';
export const PROFILE_IMAGE_MAX_BYTES = 6 * 1024 * 1024; // 6 MB
export const PROFILE_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
];
export const PROFILE_IMAGE_ACCEPT = PROFILE_IMAGE_ALLOWED_MIME_TYPES.join(',');

const EXTENSION_MAP: Record<string, string> = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  heic: 'heic',
  heif: 'heif',
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export interface ProfileImageSignedUrl {
  signedUrl: string | null;
  expiresAt: number | null;
}

const normalizeExtension = (extension: string | null | undefined): string | null => {
  if (!extension) {
    return null;
  }
  const lowered = extension.toLowerCase();
  return EXTENSION_MAP[lowered] ?? null;
};

const inferExtensionFromName = (fileName?: string | null): string | null => {
  if (!fileName) {
    return null;
  }
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName.trim());
  if (!match) {
    return null;
  }
  return normalizeExtension(match[1]);
};

const inferExtensionFromMime = (mimeType?: string | null): string | null => {
  if (!mimeType) {
    return null;
  }
  return MIME_EXTENSION_MAP[mimeType.toLowerCase()] ?? null;
};

const guessExtension = (file: File | Blob & { name?: string }): string | null => {
  return inferExtensionFromName(file.name) ?? inferExtensionFromMime((file as File).type);
};

export const validateProfileImageFile = (file: File): string => {
  if (!(file instanceof File)) {
    throw new Error('Select an image file to upload.');
  }

  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error('Profile photos must be 6 MB or smaller.');
  }

  const extension = guessExtension(file);
  if (!extension) {
    throw new Error('Profile photos must be JPEG, PNG, WebP, AVIF, HEIC, or HEIF.');
  }

  const mime = (file.type || '').toLowerCase();
  if (mime && !PROFILE_IMAGE_ALLOWED_MIME_TYPES.includes(mime)) {
    throw new Error('That image format is not supported. Please use JPEG, PNG, WebP, AVIF, HEIC, or HEIF.');
  }

  return extension;
};

export const buildProfileImagePath = (userId: string, extension: string): string => {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!userId) {
    throw new Error('Missing user identifier.');
  }
  const trimmedId = userId.trim();
  return `${trimmedId}${PROFILE_IMAGE_KEY_SUFFIX}.${safeExtension}`;
};

interface UploadProfileImageParams {
  client: SupabaseClient<any, any, any>;
  userId: string;
  file: File;
  cacheControlSeconds?: number;
}

export const uploadProfileImageForUser = async ({
  client,
  userId,
  file,
  cacheControlSeconds = 3600,
}: UploadProfileImageParams): Promise<{ path: string }> => {
  const extension = validateProfileImageFile(file);
  const objectPath = buildProfileImagePath(userId, extension);
  const contentType = file.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  const { error } = await client.storage
    .from(PROFILE_IMAGE_BUCKET)
    .upload(objectPath, file, {
      cacheControl: `${cacheControlSeconds}`,
      upsert: true,
      contentType,
    });

  if (error) {
    throw error;
  }

  return { path: objectPath };
};

export const createProfileImageSignedUrl = async (
  client: SupabaseClient<any, any, any>,
  path: string,
  expiresInSeconds = 3600,
): Promise<ProfileImageSignedUrl> => {
  const { data, error } = await client.storage
    .from(PROFILE_IMAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    throw error;
  }

  const signedUrl = data?.signedUrl ?? null;
  const expiresAt = data?.expiration
    ? Number(data.expiration) * 1000
    : Date.now() + expiresInSeconds * 1000;

  return { signedUrl, expiresAt };
};

export const shouldRefreshProfileImage = (expiresAt: number | null, bufferMs = 60_000): boolean => {
  if (!expiresAt) {
    return true;
  }
  return (expiresAt - bufferMs) <= Date.now();
};
