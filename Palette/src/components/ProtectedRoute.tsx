import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CircularProgress, Box } from '@mui/material';
import useSupabaseStore from '../store/useSupabaseStore';
import useChatStore from '../store/chatStore';
import logger from '../lib/utils/logger';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

let lastPrefetchedChatUserId: string | null = null;
const POST_AUTH_REDIRECT_KEY = 'palette:postAuthRedirect';

const prefetchChatThreads = (userId?: string | null) => {
  if (!userId) return;
  if (lastPrefetchedChatUserId === userId) return;

  useChatStore
    .getState()
    .fetchThreads({ reset: true })
    .then(() => {
      lastPrefetchedChatUserId = userId;
    })
    .catch((error) => {
      logger.warn('ProtectedRoute', 'Failed to preload chat threads/messages', error);
    });
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [handoffInProgress, setHandoffInProgress] = useState(false);
  const postAuthRedirectCacheRef = useRef<string | null | undefined>(undefined);

  // Track the last user id we processed to avoid duplicate heavy work when tab refocuses
  const lastHandledUserIdRef = useRef<string | null>(null);
  const initialLoading = useSupabaseStore(state => state.initialLoading);
  const memberships = useSupabaseStore(state => state.memberships);
  const membershipsLoaded = useSupabaseStore(state => state.membershipsLoaded);
  // Don't destructure store functions to avoid re-renders - use getState() instead

  const resolvePostAuthRedirectPath = () => {
    if (postAuthRedirectCacheRef.current !== undefined) {
      return postAuthRedirectCacheRef.current || '/dashboard';
    }

    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
      if (stored) {
        sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
      }
    } catch (err) {
      logger.warn('ProtectedRoute', 'Failed to access post-auth redirect cache', err);
    }

    postAuthRedirectCacheRef.current = stored;
    return stored || '/dashboard';
  };

  const clearPostAuthRedirect = () => {
    postAuthRedirectCacheRef.current = null;
    try {
      sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;
    
    // Let onAuthStateChange deal with initial session; keep loading until first event handled

    // Listen for auth changes - ignore initial session to prevent loops
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        // Treat INITIAL_SESSION same as SIGNED_IN but still detect duplicates later
        logger.auth('ProtectedRoute', event, !!session);
        
        if (session?.user) {
          // Ignore duplicate SIGNED_IN / INITIAL_SESSION events for the same user (e.g. when tab regains focus)
          if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session.user.id === lastHandledUserIdRef.current) {
            logger.debug('ProtectedRoute', 'Duplicate auth event for same user – skipping heavy work');
            return;
          }
          logger.debug('ProtectedRoute', 'Setting authenticated state');
          setAuthenticated(true);
          useSupabaseStore.getState().setUser(session.user);
          
          // Remember that we've already handled auth for this user
          lastHandledUserIdRef.current = session.user.id;
          
          // Finish initial loading
          setLoading(false);
          
          // --- Fire-and-forget background data fetches ---

          // 1. Profile fetch – independent
          (async () => {
            try {
              logger.debug('ProtectedRoute', 'Fetching profile in background for user');
              const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

              if (!isMounted) return;

              if (error) {
                console.error('🔍 ProtectedRoute: Profile fetch error (bg):', error);
              } else if (profile) {
                logger.debug('ProtectedRoute', 'Profile fetched (bg)');
                useSupabaseStore.getState().setProfile(profile);
              }
            } catch (err) {
              if (!isMounted) return;
              console.error('🔍 ProtectedRoute: Unexpected profile fetch error:', err);
            }
          })();

          // 2. Memberships and 3. Prefetch – run sequentially in their own async task, parallel to profile fetch
          (async () => {
            try {
              logger.debug('ProtectedRoute', 'Starting membership fetch in background');
              await useSupabaseStore.getState().fetchUserMemberships();

              if (!isMounted) return;
              logger.debug('ProtectedRoute', 'Memberships fetched (bg)');

              const storeSnapshot = useSupabaseStore.getState();
              const membershipsSnapshot = storeSnapshot.memberships || [];
              const derivedOrg: any = storeSnapshot.currentOrg || (membershipsSnapshot[0] as any)?.organization || null;
              const derivedOrgType = (derivedOrg && (derivedOrg as any).type) || 'client';
              const hasPartnerOrg = membershipsSnapshot.some((m: any) => (m as any).organization?.type === 'partner');
              const wantsGalleryPreload = !hasPartnerOrg && derivedOrgType !== 'partner';
              const requestingDashboardRoute = location.pathname.startsWith('/dashboard');
              const shouldPreloadGalleryData = wantsGalleryPreload && requestingDashboardRoute;

              if (shouldPreloadGalleryData) {
                if (!storeSnapshot.hasDashboardPreloaded) {
                  await useSupabaseStore.getState().preloadDashboardData();

                  if (!isMounted) return;
                  logger.debug('ProtectedRoute', 'Dashboard data preloaded (bg)');
                } else {
                  logger.debug('ProtectedRoute', 'Dashboard data already preloaded, skipping');
                }
              } else {
                // Skip Gallery preload – release the loading gate for handoff users
                useSupabaseStore.setState({ initialLoading: false });
              }

              prefetchChatThreads(session.user.id);
            } catch (err) {
              if (!isMounted) return;
              console.error('🔍 ProtectedRoute: Background membership/preload error:', err);
            }
          })();
        } else {
          logger.debug('ProtectedRoute', 'No session, clearing store');
          setAuthenticated(false);
          lastHandledUserIdRef.current = null;
          lastPrefetchedChatUserId = null;
          useSupabaseStore.getState().clearStore();
          clearPostAuthRedirect();
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - should only run once on mount

  logger.debug('ProtectedRoute', `Render state - loading: ${loading}, authenticated: ${authenticated}`);

  // Guard: partner users should not stay in Gallery dashboard
  useEffect(() => {
    const run = async () => {
      if (!authenticated || handoffInProgress || !membershipsLoaded) return;
      const store = useSupabaseStore.getState();
      const currentOrg: any = store.currentOrg || (memberships[0] as any)?.organization || null;
      const orgType = (currentOrg && (currentOrg as any).type) || 'client';
      const hasAnyPartnerOrg = memberships.some((m: any) => (m as any).organization?.type === 'partner');
      const shouldHandoff = orgType === 'partner' || hasAnyPartnerOrg;
      if (!shouldHandoff) {
        clearPostAuthRedirect();
        return;
      }

      const shipperUrl = (import.meta as any).env?.VITE_SHIPPER_APP_URL as string | undefined;
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
      if (!shipperUrl) {
        // No shipper URL configured: send back to Gallery auth
        navigate('/auth', { replace: true });
        return;
      }

      try {
        setHandoffInProgress(true);
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        const refreshToken = session?.refresh_token;
        if (!accessToken || !refreshToken) {
          navigate('/auth', { replace: true });
          return;
        }
        const redirectPath = resolvePostAuthRedirectPath();
        const resp = await fetch(`${API_BASE_URL}/api/auth/session-link/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            refresh_token: refreshToken,
            target_app: 'shipper',
            redirect_path: redirectPath,
          }),
        });
        if (!resp.ok) {
          // Do not allow partner users to remain in Gallery
          try { await supabase.auth.signOut({ scope: 'global' as any }); } catch {}
          navigate('/auth', { replace: true });
          return;
        }
        const { link } = await resp.json();
        if (!link) {
          try { await supabase.auth.signOut({ scope: 'global' as any }); } catch {}
          navigate('/auth', { replace: true });
          return;
        }
        window.location.replace(`${shipperUrl}/auth/handoff?link=${encodeURIComponent(link)}`);
      } catch (err) {
        try { await supabase.auth.signOut({ scope: 'global' as any }); } catch {}
        navigate('/auth', { replace: true });
      }
    };
    run();
  }, [authenticated, handoffInProgress, memberships, membershipsLoaded, navigate]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          flexDirection: 'column'
        }}
      >
        <CircularProgress />
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <div>Loading authentication...</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            Check browser console for debug info
          </div>
        </Box>
      </Box>
    );
  }

  if (!authenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Gate routing until Dashboard data is preloaded
  if (authenticated && (initialLoading || handoffInProgress)) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          flexDirection: 'column'
        }}
      >
        <CircularProgress />
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <div>Loading your dashboard...</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            Fetching shipments, quotes, and logistics partners
          </div>
        </Box>
      </Box>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute; 
