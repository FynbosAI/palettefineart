import React from 'react';
import { useUserRole } from '../../hooks/useUserRole';
import { Alert, Box } from '@mui/material';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedTypes?: ('client' | 'partner')[];
  allowedRoles?: ('viewer' | 'editor' | 'admin')[];
  requireAuthentication?: boolean;
  fallback?: React.ReactNode;
  showError?: boolean;
  errorMessage?: string;
}

/**
 * Flexible role-based access control component
 * Can check user type (client/partner) and roles (viewer/editor/admin)
 */
export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  allowedTypes,
  allowedRoles,
  requireAuthentication = true,
  fallback = null,
  showError = false,
  errorMessage = 'You do not have permission to view this content'
}) => {
  const { isAuthenticated, userType, userRole } = useUserRole();

  // Check authentication
  if (requireAuthentication && !isAuthenticated) {
    if (showError) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">Please log in to access this content</Alert>
        </Box>
      );
    }
    return <>{fallback}</>;
  }

  // Check user type
  if (allowedTypes && userType && !allowedTypes.includes(userType)) {
    if (showError) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">{errorMessage}</Alert>
        </Box>
      );
    }
    return <>{fallback}</>;
  }

  // Check user role
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    if (showError) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">
            You need {allowedRoles.join(' or ')} permissions to access this content
          </Alert>
        </Box>
      );
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default RoleGuard;