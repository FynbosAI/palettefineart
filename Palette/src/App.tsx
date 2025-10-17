import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import { useRealtime } from './hooks/useRealtime';
import logger from './lib/utils/logger';
import MessagingModal from './components/MessagingModal';
import useSupabaseStore from './store/useSupabaseStore';
import BetaBanner from '../../shared/ui/BetaBanner';

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
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/logistics" element={<LogisticsPage />} />
        {/* Legacy routes redirect to logistics */}
        <Route path="/shipments" element={<Navigate to="/logistics" replace />} />
        <Route path="/estimates" element={<Navigate to="/logistics" replace />} />
        <Route path="/estimates/new" element={<CreateShipment />} />
        <Route path="/estimates/new/detail" element={<CreateShipmentDetail />} />
        <Route path="/estimates/:id/bids" element={<ViewBidsPage />} />
        <Route path="/estimates/:id/edit" element={<CreateShipmentDetail />} />
        <Route path="/insurance" element={<InsurancePage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Routes>
      <MessagingModal />
    </div>
  );
};

const App = () => {
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

  return (
    <div className="app-shell">
      <BetaBanner className="beta-banner--gallery" />
      <div className="app-shell__content">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
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
