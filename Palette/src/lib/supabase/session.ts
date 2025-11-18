import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';

const DEFAULT_MIN_VALIDITY_SECONDS = 60;

let inFlightRefresh: Promise<Session> | null = null;

export class MissingSupabaseSessionError extends Error {
  constructor(message = 'Missing authenticated Supabase session') {
    super(message);
    this.name = 'MissingSupabaseSessionError';
  }
}

interface FreshSessionOptions {
  minValiditySeconds?: number;
  forceRefresh?: boolean;
}

const needsRefreshSoon = (expiresAt: number | null | undefined, bufferSeconds: number): boolean => {
  if (!expiresAt) {
    return true;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt - nowSeconds <= bufferSeconds;
};

const ensureRefreshedSession = async (): Promise<Session> => {
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        throw error;
      }

      const refreshedSession = data.session;
      if (!refreshedSession || !refreshedSession.access_token) {
        throw new MissingSupabaseSessionError('Unable to refresh Supabase session');
      }

      return refreshedSession;
    })();

    inFlightRefresh
      .then(() => {
        inFlightRefresh = null;
      })
      .catch(() => {
        inFlightRefresh = null;
      });
  }

  return inFlightRefresh;
};

export const getFreshSupabaseSession = async (
  options: FreshSessionOptions = {}
): Promise<Session> => {
  const minValidity = options.minValiditySeconds ?? DEFAULT_MIN_VALIDITY_SECONDS;

  if (options.forceRefresh) {
    return ensureRefreshedSession();
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const session = data.session;
  if (!session || !session.access_token) {
    throw new MissingSupabaseSessionError();
  }

  if (needsRefreshSoon(session.expires_at ?? null, minValidity)) {
    return ensureRefreshedSession();
  }

  return session;
};

export const getFreshAccessToken = async (
  options: FreshSessionOptions = {}
): Promise<string> => {
  const session = await getFreshSupabaseSession(options);
  if (!session.access_token) {
    throw new MissingSupabaseSessionError('Supabase session missing access token');
  }
  return session.access_token;
};
