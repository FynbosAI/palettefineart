import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Alert, Button, CircularProgress, Typography } from '@mui/material';
import { supabase } from '../../lib/supabase';
import useSupabaseStore from '../../store/useSupabaseStore';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const clearStore = useSupabaseStore(state => state.clearStore);

  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const isMobile = windowSize.width <= 768;
  const isTablet = windowSize.width > 768 && windowSize.width <= 1440;
  const isDesktop = windowSize.width > 1440;

  const [status, setStatus] = useState<'verifying' | 'ready' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const recoveryProcessedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const searchParams = new URLSearchParams(location.search);
    const typeParam = (hashParams.get('type') || searchParams.get('type') || '').toLowerCase();
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const codeParam = hashParams.get('code') || searchParams.get('code');
    const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
    const hasRecoveryParams = Boolean(accessToken || refreshToken || codeParam || tokenHash);

    const clearAuthParams = () => {
      try {
        const url = new URL(window.location.href);
        url.hash = '';
        url.searchParams.delete('code');
        url.searchParams.delete('type');
        url.searchParams.delete('token_hash');
        const cleanSearch = url.searchParams.toString();
        url.search = cleanSearch ? `?${cleanSearch}` : '';
        window.history.replaceState({}, document.title, url.toString());
      } catch {
        navigate('/reset-password', { replace: true });
      }
    };

    const handleRecovery = async () => {
      if (!hasRecoveryParams || typeParam !== 'recovery') {
        if (!recoveryProcessedRef.current) {
          setStatus('error');
          setError('This reset link is invalid or has expired. Request a new link from the login page.');
        }
        return;
      }

      if (recoveryProcessedRef.current) {
        setStatus('ready');
        setError(null);
        return;
      }

      setStatus('verifying');

      let shouldClearAuthParams = false;

      if (typeof (supabase.auth as any).getSessionFromUrl === 'function') {
        const { data: sessionData, error: sessionFromUrlError } =
          await (supabase.auth as any).getSessionFromUrl({ storeSession: true });

        if (!active) {
          return;
        }

        if (!sessionFromUrlError && sessionData?.session) {
          clearAuthParams();
          recoveryProcessedRef.current = true;
          setStatus('ready');
          setError(null);
          return;
        }

        if (sessionFromUrlError) {
          shouldClearAuthParams = true;
        }
      }

      if (!recoveryProcessedRef.current && tokenHash && typeof supabase.auth.verifyOtp === 'function') {
        const { data: verifiedSession, error: verifyError } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        });

        if (!active) {
          return;
        }

        if (!verifyError && verifiedSession?.session) {
          clearAuthParams();
          recoveryProcessedRef.current = true;
          setStatus('ready');
          setError(null);
          return;
        }

        if (verifyError) {
          shouldClearAuthParams = true;
        }
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!active) {
          return;
        }

        if (sessionError) {
          setStatus('error');
          setError('This reset link is invalid or has expired. Request a new link from the login page.');
          return;
        }

        clearAuthParams();
        recoveryProcessedRef.current = true;
        setStatus('ready');
        setError(null);
        return;
      }

      if (codeParam) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(codeParam);
        if (!active) {
          return;
        }

        if (codeError) {
          setStatus('error');
          setError('This reset link is invalid or has expired. Request a new link from the login page.');
          return;
        }

        clearAuthParams();
        recoveryProcessedRef.current = true;
        setStatus('ready');
        setError(null);
        return;
      }

      if (shouldClearAuthParams) {
        clearAuthParams();
      }

      setStatus('error');
      setError('This reset link is invalid or has expired. Request a new link from the login page.');
    };

    handleRecovery();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (!active) {
        return;
      }

      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        recoveryProcessedRef.current = true;
        setStatus('ready');
        setError(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [location.hash, location.search]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!password.trim() || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Unable to update password.');
        return;
      }

      try {
        await supabase.auth.signOut({ scope: 'global' as any });
      } catch {
        // ignore sign-out failure; local state clear below
      }

      try {
        clearStore();
      } catch {
        // ignore store reset errors
      }

      setSuccess('Password updated. Redirecting to login...');
      setTimeout(() => {
        navigate('/auth?reset=1', { replace: true });
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' as any });
    } catch {
      // ignore sign-out failure; navigation still proceeds
    }

    try {
      clearStore();
    } catch {
      // ignore local state clear errors
    }

    navigate('/auth', { replace: true });
  };

  return (
    <>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#EAD9F9',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            transform: isMobile ? 'scale(0.7)' : isTablet ? 'scale(0.85)' : 'scale(1)',
            transformOrigin: 'top left',
            zIndex: 50
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -187,
              top: 37,
              width: 1287,
              height: 1014,
              zIndex: 53,
              backgroundImage: 'url("/logo.png")',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center'
            }}
          />

          <div
            style={{
              position: 'absolute',
              left: 299,
              top: 402,
              width: 294,
              height: 72,
              zIndex: 54,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 98 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            >
              <path d="M27.415 14.7456C27.415 16.0707 26.1527 16.9612 24.3066 16.9612C22.9516 16.9612 21.9358 16.0707 21.9358 14.9312C21.9358 13.7916 22.9516 12.9303 24.3066 12.9303H27.415V14.7456ZM18.9183 4.09462V7.8181L23.5293 7.80221L29.1207 7.81546V8.30044C28.6476 8.30044 28.2193 8.49123 27.909 8.8013C27.6344 9.07692 27.454 9.44266 27.415 9.85078H23.383C20.2121 9.85078 17.811 12.0372 17.811 14.9921C17.811 17.9179 20.2121 20.1652 23.383 20.1652C24.1126 20.1652 24.7932 20.0566 25.4109 19.8525C26.4106 19.5265 27.2494 18.9514 27.8775 18.1935V19.7942H31.4173V4.09462H18.9183Z" fill="#1B1C42" />
              <path d="M38.584 5.72205e-06H34.5823V19.7944H41.5303V16.132H38.584V5.72205e-06Z" fill="#1B1C42" />
              <path d="M46.1537 10.406C46.6776 8.49627 48.2476 7.2337 50.2486 7.2337C52.2183 7.2337 53.8493 8.49627 54.3729 10.406H46.1537ZM58.6825 11.9736C58.6825 7.26553 55.0503 3.72453 50.2486 3.72453C45.445 3.72453 41.813 7.26554 41.813 11.9444C41.813 16.6233 45.445 20.1643 50.2486 20.1643C53.0477 20.1643 55.4474 19.0078 56.9932 17.1618L54.0238 14.8648C53.3731 15.8806 51.9689 16.6233 50.3096 16.6233C48.216 16.6233 46.615 15.3316 46.0927 13.329H58.56C58.6526 12.9603 58.6825 12.3741 58.6825 11.9736Z" fill="#1B1C42" />
              <path d="M85.2091 10.406C85.733 8.49627 87.3027 7.2337 89.3037 7.2337C91.2737 7.2337 92.9047 8.49627 93.4283 10.406H85.2091ZM97.7377 11.9736C97.7377 7.26553 94.106 3.72453 89.3037 3.72453C84.5004 3.72453 80.8684 7.26554 80.8684 11.9444C80.8684 16.6233 84.5004 20.1643 89.3037 20.1643C92.1031 20.1643 94.5028 19.0078 96.0486 17.1618L93.0792 14.8648C92.4283 15.8806 91.0244 16.6233 89.365 16.6233C87.2714 16.6233 85.6704 15.3316 85.1479 13.329H97.6154C97.708 12.9603 97.7377 12.3741 97.7377 11.9736Z" fill="#1B1C42" />
              <path d="M64.2961 7.75833V8.24254C65.2421 8.24254 66.0091 9.01035 66.0091 9.95473V16.132H69.14V19.7944H62.0071V7.75833H59.175V4.09585H62.0071V5.72205e-06H66.0091V4.09585H72.9122V7.75833H64.2961Z" fill="#1B1C42" />
              <path d="M79.5389 16.132V19.7944H72.4063V7.75833H69.574V4.09585H72.4063V5.72205e-06H76.4083V4.09585H80.0277V7.75833H74.6953V8.24254C75.1683 8.24254 75.5966 8.43519 75.9072 8.74552C76.2175 9.05585 76.4083 9.48388 76.4083 9.95473V16.132H79.5389Z" fill="#1B1C42" />
              <path d="M76.449 4.09461H78.0113L76.449 7.75714V4.09461Z" fill="#1B1C42" />
              <path d="M79.2812 16.1305H79.5394V19.7941H79.2812V16.1305Z" fill="#1B1C42" />
              <path d="M12.6196 11.9868C12.6018 14.2156 11.0918 15.9568 8.94299 16.243C8.7384 16.2721 8.52798 16.2854 8.31172 16.2854C6.18973 16.2854 4.52462 14.8914 4.1051 12.9303C4.03646 12.6149 4.00068 12.2863 4.00068 11.9444V9.95678C4.00068 9.90113 3.99326 9.90643 3.98875 9.85077C3.9498 9.4453 3.76958 9.07958 3.49476 8.80396C3.18443 8.49389 2.75616 8.30307 2.2831 8.30307V7.81809H4.00227L7.87471 7.80748L8.4445 7.81809C10.65 7.81809 12.5229 9.5301 12.6167 11.7324C12.6196 11.8039 12.6212 11.8728 12.6212 11.9444C12.6212 11.9577 12.6212 11.9709 12.6196 11.9868ZM16.7411 11.6608C16.6367 7.43647 13.1152 4.09461 8.8876 4.09461H0V24H4.00068V17.7323C4.81402 18.7262 5.85262 19.4656 7.07621 19.8551C7.5445 20.0036 8.04167 20.1042 8.56243 20.144C8.74158 20.1572 8.92497 20.1652 9.11155 20.1652C13.4822 20.1652 16.7456 16.6219 16.7456 11.9444C16.7456 11.849 16.7443 11.7536 16.7411 11.6608Z" fill="#1B1C42" />
            </svg>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: isDesktop ? '63vw' : isMobile ? '50%' : '30%',
            top: '50%',
            width: isDesktop ? '26vw' : isTablet ? '40vw' : '90vw',
            maxWidth: !isMobile ? 'none' : '400px',
            minHeight: isMobile ? 'auto' : '60vh',
            maxHeight: isMobile ? 'calc(100vh - 48px)' : 'calc(100vh - 120px)',
            zIndex: 60,
            backgroundColor: '#FFFFFF',
            borderRadius: '10px',
            boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)',
            padding: !isMobile ? '32px' : '24px',
            boxSizing: 'border-box',
            overflow: 'auto',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
            transform: isMobile ? 'translate(-50%, -50%)' : 'translateY(-50%)'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1
              style={{
                fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: '24px',
                fontWeight: '500',
                color: '#170849',
                margin: '0 0 8px 0',
                lineHeight: '1.4'
              }}
            >
              Reset your password
            </h1>
            <Typography variant="body2" sx={{ color: '#475467' }}>
              Choose a new password to regain access to your Palette workspace.
            </Typography>
          </div>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          {status === 'verifying' && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '24px 0' }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary">
                Confirming your reset link...
              </Typography>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center', marginTop: '24px' }}>
              <Button variant="contained" onClick={handleBackToLogin}>
                Return to login
              </Button>
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} style={{ marginTop: '8px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#181D27',
                  marginBottom: '8px'
                }}>
                  New password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 16px',
                    border: '1px solid #E9EAEB',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                    boxSizing: 'border-box',
                    backgroundColor: loading ? '#f9fafb' : '#FFFFFF'
                  }}
                  onFocus={(event) => event.target.style.borderColor = '#8412FF'}
                  onBlur={(event) => event.target.style.borderColor = '#E9EAEB'}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#181D27',
                  marginBottom: '8px'
                }}>
                  Confirm new password *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 16px',
                    border: '1px solid #E9EAEB',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                    boxSizing: 'border-box',
                    backgroundColor: loading ? '#f9fafb' : '#FFFFFF'
                  }}
                  onFocus={(event) => event.target.style.borderColor = '#8412FF'}
                  onBlur={(event) => event.target.style.borderColor = '#E9EAEB'}
                />
              </div>

              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                fullWidth
                sx={{
                  mt: 2,
                  py: 1.4,
                  fontSize: '16px',
                  fontWeight: 500,
                  textTransform: 'none'
                }}
              >
                {loading ? 'Saving...' : 'Update password'}
              </Button>

              <Button
                type="button"
                variant="text"
                onClick={handleBackToLogin}
                fullWidth
                sx={{ mt: 1.5, textTransform: 'none' }}
              >
                Back to login
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
};

export default ResetPasswordPage;
