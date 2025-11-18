import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/pages/Dashboard';
import Shipments from './components/pages/Shipments';
import Estimates from './components/pages/Estimates';
import SubmitBid from './components/pages/SubmitBid';
import Messages from './components/pages/Messages';
import CostsAndMargins from './components/pages/CostsAndMargins';
import Insurance from './components/pages/Insurance';
import Profile from './components/pages/Profile';
import AuthPage from './components/pages/AuthPage';
import AuthHandoff from './components/pages/AuthHandoff';
import Network from './components/pages/Network';
import ProtectedRoute from './components/ProtectedRoute';
import { supabase } from './lib/supabase';
import useShipperStore from './store/useShipperStore';
import QuoteMessagingModal from './components/messaging/QuoteMessagingModal';
import useChatStore from './store/chatStore';
import BetaBanner from '../../shared/ui/BetaBanner';
import CopyrightFooterPortal from './components/layout/CopyrightFooterPortal';
import NotificationCenter from './components/notifications/NotificationCenter';
import { AuthBootstrapProvider } from './context/AuthBootstrapContext';
import ShipperGlobalHeader from './components/layout/ShipperGlobalHeader';
import { useRealtime as useRealtimeSubscriptions } from './hooks/useRealtime';

let lastPrefetchedChatUserId: string | null = null;

const prefetchChatThreads = (userId?: string | null) => {
  if (!userId) return;
  if (lastPrefetchedChatUserId === userId) return;

  useChatStore
    .getState()
    .preloadThreadsAndMessages()
    .then(() => {
      lastPrefetchedChatUserId = userId;
    })
    .catch((error) => {
      console.warn('⚠️ Failed to prefetch chat threads/messages:', error);
    });
};

function App() {
  const user = useShipperStore((state) => state.user);
  const setUser = useShipperStore((state) => state.setUser);
  const setProfile = useShipperStore((state) => state.setProfile);
  const hydrateFromSession = useShipperStore((state) => state.hydrateFromSession);
  const clearStore = useShipperStore((state) => state.clearStore);
  const fetchCurrencyRates = useShipperStore((state) => state.fetchCurrencyRates);
  const setAuthLoading = useShipperStore((state) => state.setAuthLoading);
  const paperTextureEnabled = useShipperStore((state) => state.uiPreferences.paperTextureEnabled);
  const paperTextureOpacity = useShipperStore((state) => state.uiPreferences.paperTextureOpacity);
  const [initialAuthResolved, setInitialAuthResolved] = useState(false);
  useRealtimeSubscriptions();

  useEffect(() => {
    console.log('🚀 App - Setting up auth state listener');
    let isMounted = true;

    // Check for existing session on mount only once
    const checkInitialSession = async () => {
      setAuthLoading(true);
      try {
        // Small delay to ensure any logout storage clearing is complete
        await new Promise(resolve => setTimeout(resolve, 100));

        const { data: { session } } = await supabase.auth.getSession();
        console.log('📍 Initial session check:', session?.user?.email || 'No session');
        
        if (session?.user) {
          console.log('✅ Found existing session:', session.user.email);
          setUser(session.user);
          
          // Fetch profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            setProfile(profile);
          }
          
          try {
            await hydrateFromSession();
            prefetchChatThreads(session.user.id);
          } catch (hydrationError) {
            console.error('❌ Error hydrating partner dashboard during initial session:', hydrationError);
          }
        } else {
          console.log('📍 No valid session found');
        }
      } catch (error) {
        console.error('❌ Error checking initial session:', error);
      } finally {
        setAuthLoading(false);
        if (isMounted) {
          setInitialAuthResolved(true);
        }
      }
    };

    checkInitialSession();
    
    // Set up auth state listener for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state changed:', event, session?.user?.email);
      
      // Handle auth events
      if (event === 'SIGNED_IN' && session) {
        console.log('✅ User signed in:', session.user.email);
        
        // Set user IMMEDIATELY to prevent race conditions
        setUser(session.user);
        
        // Then do the rest async without awaiting
        (async () => {
          try {
            // Double-check that this isn't a stale session by verifying it's still valid
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession?.user?.id === session.user.id) {
              console.log('🔄 Fetching profile and memberships...');
              
              // Fetch profile
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
              
              if (profile) {
                setProfile(profile);
              }
              
              await hydrateFromSession();
              console.log('✅ Profile and partner dashboard hydrated');

              prefetchChatThreads(session.user.id);
            } else {
              console.log('⚠️ Stale session detected, clearing user');
              setUser(null);
            }
          } catch (error) {
            console.error('❌ Error loading user data:', error);
            // Don't clear user on error, just log it
          }
        })();
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        clearStore();
        lastPrefetchedChatUserId = null;
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
        // Update user object with fresh session
        if (session?.user) {
          setUser(session.user);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      isMounted = false;
    };
  }, []); // Empty dependency array to prevent infinite loops

  useEffect(() => {
    fetchCurrencyRates().catch((error) => {
      console.warn('⚠️ Failed to load currency rates on startup', error);
    });
  }, [fetchCurrencyRates]);

  useEffect(() => {
    const className = 'shipper-texture-enabled';
    const overlayClass = 'shipper-paper-overlay';
    const { body } = document;
    if (!body) {
      return;
    }

    if (!paperTextureEnabled) {
      body.classList.remove(className);
      body.style.removeProperty('--shipper-paper-texture-opacity');
      const existingOverlay = body.querySelector(`.${overlayClass}`);
      if (existingOverlay) {
        existingOverlay.remove();
      }
      return;
    }

    body.classList.add(className);
    if (!body.querySelector(`.${overlayClass}`)) {
      const overlay = document.createElement('div');
      overlay.className = overlayClass;
      body.appendChild(overlay);
    }

    return () => {
      body.classList.remove(className);
      body.style.removeProperty('--shipper-paper-texture-opacity');
      const existingOverlay = body.querySelector(`.${overlayClass}`);
      if (existingOverlay) {
        existingOverlay.remove();
      }
    };
  }, [paperTextureEnabled]);

  useEffect(() => {
    const { body } = document;
    if (!body) {
      return;
    }

    if (!paperTextureEnabled) {
      body.style.removeProperty('--shipper-paper-texture-opacity');
      return;
    }

    body.style.setProperty('--shipper-paper-texture-opacity', paperTextureOpacity.toString());
  }, [paperTextureEnabled, paperTextureOpacity]);

  return (
    <AuthBootstrapProvider value={initialAuthResolved}>
      <div className="app-shell">
        <BetaBanner
          className="beta-banner--shipper"
          message="Palette Shipper is in beta. Some features may be unavailable."
        />
        <div className="app-shell__content">
          <Routes>
          {/* Public auth route */}
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/handoff" element={<AuthHandoff />} />
          
          {/* Protected routes with sidebar */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="dashboard">
                  <Sidebar />
                  <NotificationCenter />
                  <ShipperGlobalHeader />
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/shipments" element={<Shipments />} />
                    <Route path="/estimates" element={<Estimates />} />
                    <Route path="/estimates/:id/bid" element={<SubmitBid />} />
                    <Route path="/estimates/:id/quote" element={<SubmitBid />} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/costs" element={<CostsAndMargins />} />
                    <Route path="/insurance" element={<Insurance />} />
                  <Route path="/network" element={<Network />} />
                  <Route path="/profile" element={<Profile />} />
                </Routes>
                <QuoteMessagingModal />
                <CopyrightFooterPortal />
              </div>
              </ProtectedRoute>
            }
          />
          </Routes>
        </div>
      </div>
    </AuthBootstrapProvider>
  );
}

export default App; 
