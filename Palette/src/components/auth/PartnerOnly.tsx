import React from 'react';
import { useUserRole } from '../../hooks/useUserRole';

interface PartnerOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireEditor?: boolean;
  requireAdmin?: boolean;
}

/**
 * Wrapper component that only renders children for partner organization users
 * Optionally can require specific permission levels
 */
export const PartnerOnly: React.FC<PartnerOnlyProps> = ({ 
  children, 
  fallback = null,
  requireEditor = false,
  requireAdmin = false
}) => {
  const { isPartner, isEditor, isAdmin } = useUserRole();

  // Check base requirement
  if (!isPartner) {
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

export default PartnerOnly;