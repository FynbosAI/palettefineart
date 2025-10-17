import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuth } from '../hooks/useStoreSelectors';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const { user, authLoading } = useAuth();
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);

  // Give App.tsx a brief moment to complete initial session check
  useEffect(() => {
    // Only delay the initial check, not subsequent ones
    const timer = setTimeout(() => {
      setInitialCheckComplete(true);
    }, 200); // Slightly longer than before to ensure session loads
    
    return () => clearTimeout(timer);
  }, []);

  // Show loading spinner during auth operations or initial check
  if (authLoading || !initialCheckComplete) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#F0F5F5'
        }}
      >
        <CircularProgress sx={{ color: '#00AAAB' }} />
      </Box>
    );
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

  console.log('🔐 ProtectedRoute - User authenticated:', user.email);
  // User is authenticated, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute; 
