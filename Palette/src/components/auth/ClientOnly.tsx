import React from 'react';
import { useUserRole } from '../../hooks/useUserRole';

interface ClientOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireEditor?: boolean;
  requireAdmin?: boolean;
}

/**
 * Wrapper component that only renders children for client organization users
 * Optionally can require specific permission levels
 */
export const ClientOnly: React.FC<ClientOnlyProps> = ({ 
  children, 
  fallback = null,
  requireEditor = false,
  requireAdmin = false
}) => {
  const { isClient, isEditor, isAdmin } = useUserRole();

  // Check base requirement
  if (!isClient) {
    return <>{fallback}</>;
  }

  // Check permission requirements
  if (requireAdmin && !isAdmin) {
    return <>{fallback}</>;
  }

  if (requireEditor && !isEditor) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default ClientOnly;