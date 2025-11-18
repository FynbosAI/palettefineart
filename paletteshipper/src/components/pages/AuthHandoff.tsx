import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CircularProgress, Box, Typography } from '@mui/material';
import { supabase } from '../../lib/supabase';
import useShipperStore from '../../store/useShipperStore';

const AuthHandoff: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  const ranRef = React.useRef(false);
  const normalizeRedirectPath = (raw?: string | null) => {
    if (!raw) return '/dashboard';
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/dashboard';
    if (trimmed === '/' || trimmed.startsWith('/auth')) return '/dashboard';
    return trimmed;
  };

  useEffect(() => {
    if (ranRef.current) return; // avoid double-run in StrictMode
    ranRef.current = true;
    const run = async () => {
      const params = new URLSearchParams(location.search);
      const link = params.get('link');
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
      const galleryUrl = (import.meta as any).env?.VITE_GALLERY_APP_URL as string | undefined;

      if (!link) {
        setError('Missing link parameter');
        if (galleryUrl) {
          window.location.replace(`${galleryUrl}/auth?redirect=${encodeURIComponent('/dashboard')}`);
        } else {
          navigate('/auth', { replace: true });
        }
        return;
      }

      try {
        const resp = await fetch(`${API_BASE_URL}/api/auth/session-link/consume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ link }),
        });
        if (!resp.ok) {
          const msg = await resp.text();
          throw new Error(`Consume failed: ${msg}`);
        }
        const json = await resp.json();
        const access_token = json?.access_token as string | undefined;
        const refresh_token = json?.refresh_token as string | undefined;
        const redirect_path = normalizeRedirectPath(json?.redirect_path as string | undefined);

        if (!refresh_token || !access_token) {
          throw new Error('Missing tokens from handoff');
        }

        // Set session in Supabase
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          throw error;
        }

        const store = useShipperStore.getState();
        const sessionUser = data?.session?.user;
        if (sessionUser) {
          store.setUser(sessionUser);
        }

        try {
          await store.hydrateFromSession();
          await store.waitForAuthHydration();
        } catch (hydrationError: any) {
          console.error('Auth handoff hydration error:', hydrationError);
        }

        // Navigate to destination once hydration completes (or best-effort)
        navigate(redirect_path, { replace: true });
      } catch (e: any) {
        console.error('Auth handoff error:', e);
        setError(e?.message || 'Auth handoff failed');
        // Fallback: go to Gallery login or local auth
        const galleryUrl = (import.meta as any).env?.VITE_GALLERY_APP_URL as string | undefined;
        if (galleryUrl) {
          window.location.replace(`${galleryUrl}/auth?redirect=${encodeURIComponent('/dashboard')}`);
        } else {
          navigate('/auth', { replace: true });
        }
      }
    };
    run();
  }, [location.search, navigate]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#F0F5F5' }}>
      <CircularProgress sx={{ color: '#00AAAB', mb: 2 }} />
      <Typography variant="body2" sx={{ color: '#666' }}>
        {error ? 'Redirecting to login...' : 'Setting up your session...'}
      </Typography>
    </Box>
  );
};

export default AuthHandoff;
