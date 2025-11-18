import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../../supabaseClient.js';

type SupabaseAdminClient = typeof supabaseAdmin;

export class PasswordResetError extends Error {
  status: number;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = 'PasswordResetError';
    this.status = status;
    if (cause && typeof this === 'object') {
      (this as any).cause = cause;
    }
  }
}

export interface PasswordResetOptions {
  redirectTo?: string;
}

export interface PasswordResetResult {
  emailHash: string;
  redirectTo: string;
  supabaseStatus: 'success' | 'error';
  supabaseStatusCode: number | null;
  supabaseErrorCode?: string;
  supabaseErrorMessage?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let supabaseAdapter: SupabaseAdminClient = supabaseAdmin;

const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

const defaultRedirect = (): string => {
  const explicit = process.env.GALLERY_RESET_PASSWORD_URL
    || process.env.PASSWORD_RESET_REDIRECT_URL;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const baseCandidate = (
    process.env.GALLERY_APP_URL
    || process.env.VITE_GALLERY_APP_URL
    || process.env.SITE_URL
    || 'http://localhost:5173'
  ).trim();

  const trimmedBase = baseCandidate.replace(/\/+$/, '');
  return `${trimmedBase}/reset-password`;
};

export class PasswordResetService {
  static __setSupabaseAdminForTests(adapter: SupabaseAdminClient | null): void {
    supabaseAdapter = adapter ?? supabaseAdmin;
  }

  static async requestPasswordReset(
    rawEmail: unknown,
    options: PasswordResetOptions = {}
  ): Promise<PasswordResetResult> {
    if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
      throw new PasswordResetError(400, 'Email is required');
    }

    const email = normaliseEmail(rawEmail);
    if (!EMAIL_REGEX.test(email)) {
      throw new PasswordResetError(400, 'Email is invalid');
    }

    const redirectTo = (options.redirectTo?.trim() || defaultRedirect());
    const emailHash = createHash('sha256').update(email).digest('hex');

    let supabaseStatus: 'success' | 'error' = 'success';
    let supabaseStatusCode: number | null = null;
    let supabaseErrorCode: string | undefined;
    let supabaseErrorMessage: string | undefined;

    try {
      const { error: resetError } = await supabaseAdapter.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) {
        supabaseStatus = 'error';
        supabaseStatusCode = typeof resetError.status === 'number' ? resetError.status : null;
        supabaseErrorCode = typeof (resetError as any)?.code === 'string' ? (resetError as any).code : undefined;
        supabaseErrorMessage = typeof resetError.message === 'string' ? resetError.message : undefined;
      }
    } catch (error) {
      supabaseStatus = 'error';
      supabaseErrorMessage = error instanceof Error ? error.message : 'Unknown reset error';
    }

    if (supabaseStatus === 'success') {
      console.info('[password-reset/service] reset requested', {
        emailHash,
      });
    } else {
      console.warn('[password-reset/service] reset request error', {
        emailHash,
        supabaseStatusCode,
        supabaseErrorCode,
      });
    }

    return {
      emailHash,
      redirectTo,
      supabaseStatus,
      supabaseStatusCode,
      ...(supabaseErrorCode ? { supabaseErrorCode } : {}),
      ...(supabaseErrorMessage ? { supabaseErrorMessage } : {}),
    };
  }
}

export default PasswordResetService;
