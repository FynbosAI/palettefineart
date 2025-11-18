import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { CircularProgress, Box, Typography } from '@mui/material';
import { useAuth } from '../hooks/useStoreSelectors';
import { useAuthBootstrap } from '../context/AuthBootstrapContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const { user, authLoading, authHydrationPending, authHydrated } = useAuth();
  const initialAuthResolved = useAuthBootstrap();

  useEffect(() => {
    if (authHydrationPending) {
      console.log('🔄 ProtectedRoute - Awaiting shipper hydration');
    }
  }, [authHydrationPending]);

  const renderSpinner = (message: string) => (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#F0F5F5'
      }}
    >
      <CircularProgress sx={{ color: '#00AAAB', mb: 2 }} />
      <Typography variant="body2" sx={{ color: '#666' }}>{message}</Typography>
    </Box>
  );

  if (!initialAuthResolved) {
    console.log('🔐 ProtectedRoute - Waiting for bootstrap to resolve');
    return renderSpinner('Setting up your session...');
  }

  if (authLoading) {
    console.log('🔐 ProtectedRoute - Waiting for initial auth resolution');
    return renderSpinner('Setting up your session...');
  }

  if (authHydrationPending) {
    return renderSpinner('Loading your dashboard...');
  }

  // If no user after initial check, redirect to Gallery login if configured
  if (!user) {
    const galleryUrl = (import.meta as any).env?.VITE_GALLERY_APP_URL as string | undefined;
    const target = galleryUrl
      ? `${galleryUrl}/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`
      : undefined;

    if (target) {
      console.log('🔐 ProtectedRoute - No user; redirecting to Gallery login:', target);
      // Use full-page redirect for cross-domain navigation
      window.location.replace(target);
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#F0F5F5' }}>
          <CircularProgress sx={{ color: '#00AAAB' }} />
        </Box>
      );
    }
    console.log('🔐 ProtectedRoute - No user; Gallery URL not set, redirecting to local /auth');
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!authHydrated) {
    return renderSpinner('Loading your dashboard...');
  }

  console.log('🔐 ProtectedRoute - User authenticated:', user.email);
  // User is authenticated, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute; 
