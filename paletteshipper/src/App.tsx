import React, { useEffect, useCallback } from 'react';
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
  const fetchUserMemberships = useShipperStore((state) => state.fetchUserMemberships);
  const clearStore = useShipperStore((state) => state.clearStore);
  const fetchCurrencyRates = useShipperStore((state) => state.fetchCurrencyRates);

  useEffect(() => {
    console.log('🚀 App - Setting up auth state listener');
    
    // Check for existing session on mount only once
    const checkInitialSession = async () => {
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
          
          // Fetch memberships
          await fetchUserMemberships();

          prefetchChatThreads(session.user.id);
        } else {
          console.log('📍 No valid session found');
        }
      } catch (error) {
        console.error('❌ Error checking initial session:', error);
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
              
              // Fetch memberships
              await fetchUserMemberships();
              console.log('✅ Profile and memberships loaded');

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
    };
  }, []); // Empty dependency array to prevent infinite loops

  useEffect(() => {
    fetchCurrencyRates().catch((error) => {
      console.warn('⚠️ Failed to load currency rates on startup', error);
    });
  }, [fetchCurrencyRates]);

  return (
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
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default App; 
