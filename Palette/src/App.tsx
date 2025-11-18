import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import AuthPage from './components/pages/AuthPage';
import LoginDesigner from './components/pages/LoginDesigner';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Dashboard from './components/pages/Dashboard';
import GenericPage from './components/pages/GenericPage';
import AccountPage from './components/pages/AccountPage';
import LogisticsPage from './components/pages/LogisticsPage';
import InsurancePage from './components/pages/InsurancePage';
import MessagesPage from './components/pages/MessagesPage';
import ViewBidsPage from './components/pages/ViewBidsPage';
import CreateShipment from './components/CreateShipment';
import CreateShipmentDetail from './components/CreateShipmentDetail';
import ShipmentPage from './components/lae1';
import { useRealtime } from './hooks/useRealtime';
import logger from './lib/utils/logger';
import MessagingModal from './components/MessagingModal';
import useSupabaseStore from './store/useSupabaseStore';
import BetaBanner from '../../shared/ui/BetaBanner';
import CopyrightFooterPortal from './components/layout/CopyrightFooterPortal';
import ResetPasswordPage from './components/pages/ResetPasswordPage';
import NotificationCenter from './components/notifications/NotificationCenter';
import RealtimeConnectionToast from './components/realtime/RealtimeConnectionToast';
import GalleryGlobalHeader from './components/layout/GalleryGlobalHeader';

// Protected routes component to handle all internal routing
const ProtectedRoutes = () => {
  // Initialize real-time subscriptions for authenticated users
  const { isConnected, subscriptionCount } = useRealtime();
  const fetchCurrencyRates = useSupabaseStore((state) => state.fetchCurrencyRates);

  // Log realtime status for debugging
  useEffect(() => {
    logger.realtime('App', isConnected ? 'Connected' : 'Disconnected', subscriptionCount);
  }, [isConnected, subscriptionCount]);

  useEffect(() => {
    fetchCurrencyRates();
  }, [fetchCurrencyRates]);

  return (
    <div className="dashboard">
      <Sidebar />
      <NotificationCenter />
      <RealtimeConnectionToast />
      <GalleryGlobalHeader />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/logistics" element={<LogisticsPage />} />
        {/* Legacy routes redirect to logistics */}
        <Route path="/shipments" element={<Navigate to="/logistics" replace />} />
        <Route path="/estimates" element={<Navigate to="/logistics" replace />} />
        <Route path="/estimates/new" element={<ShipmentPage />} />
        <Route path="/estimates/new/legacy" element={<CreateShipment />} />
        <Route path="/estimates/new/detail" element={<CreateShipmentDetail />} />
        <Route path="/estimates/:id/bids" element={<ViewBidsPage />} />
        <Route path="/estimates/:id/edit" element={<CreateShipmentDetail />} />
        <Route path="/insurance" element={<InsurancePage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Routes>
      <MessagingModal />
      <CopyrightFooterPortal />
    </div>
  );
};

const App = () => {
  const paperTextureEnabled = useSupabaseStore((state) => state.uiPreferences.paperTextureEnabled);
  const paperTextureOpacity = useSupabaseStore((state) => state.uiPreferences.paperTextureOpacity);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const searchParams = new URLSearchParams(location.search || '');
    const typeParam = (hashParams.get('type') || searchParams.get('type') || '').toLowerCase();

    if (typeParam !== 'recovery') {
      return;
    }

    const hasTokenLikeParam = ['access_token', 'refresh_token', 'token_hash', 'code'].some((key) => {
      const fromHash = hashParams.get(key);
      const fromSearch = searchParams.get(key);
      return (fromHash && fromHash.trim()) || (fromSearch && fromSearch.trim());
    });

    if (!hasTokenLikeParam) {
      return;
    }

    if (location.pathname === '/reset-password') {
      return;
    }

    const nextHash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;

    navigate(
      {
        pathname: '/reset-password',
        search: location.search,
        hash: nextHash || undefined,
      },
      { replace: true }
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    // Auth state watcher to track token expiry
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      logger.auth('App', event, !!session);
    });

    // Provider sign out probe (dev-only)
    const auth = (supabase as any)._auth;
    if (auth && auth._handleProviderSignOut) {
      const orig = auth._handleProviderSignOut;
      auth._handleProviderSignOut = async (...args: any[]) => {
        console.log('👋 _handleProviderSignOut called, isRefreshing=', auth._isRefreshing);
        return orig.apply(auth, args);
      };
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const className = 'gallery-texture-enabled';
    const overlayClass = 'gallery-paper-overlay';
    const { body } = document;
    if (!body) {
      return;
    }

    if (!paperTextureEnabled) {
      body.classList.remove(className);
      body.style.removeProperty('--gallery-paper-texture-opacity');
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
      body.style.removeProperty('--gallery-paper-texture-opacity');
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
      body.style.removeProperty('--gallery-paper-texture-opacity');
      return;
    }

    body.style.setProperty('--gallery-paper-texture-opacity', paperTextureOpacity.toString());
  }, [paperTextureEnabled, paperTextureOpacity]);

  return (
    <div className="app-shell">
      <BetaBanner className="beta-banner--gallery" />
      <div className="app-shell__content">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login-designer" element={<LoginDesigner />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <ProtectedRoutes />
          </ProtectedRoute>
          } />
        </Routes>
      </div>
    </div>
  );
};

export default App; 
