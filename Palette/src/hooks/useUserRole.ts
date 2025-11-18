import useSupabaseStore from '../store/useSupabaseStore';

/**
 * Custom hook for user role and permission management
 * Determines if user is a client or partner and provides helper functions
 */
export const useUserRole = () => {
  const {
    user,
    currentOrg,
    userType,
    memberships,
  } = useSupabaseStore();

  // Helper functions for role checking
  const isPartner = userType === 'partner';
  const isClient = userType === 'client';
  const isAuthenticated = !!user;

  // Get user's role in current organization
  const currentMembership = memberships.find(m => m.org_id === currentOrg?.id);
  const userRole = currentMembership?.role || null;

  // Permission helpers
  const isAdmin = userRole === 'admin';
  const isEditor = userRole === 'editor' || userRole === 'admin';
  const isViewer = userRole === 'viewer' || userRole === 'editor' || userRole === 'admin';

  // Check if user can edit quotes
  const canEditQuotes = isClient && isEditor;
  
  // Check if user can create quotes
  const canCreateQuotes = isClient && isEditor;
  
  // Check if user can submit bids
  const canSubmitBids = isPartner && isEditor;
  
  // Check if user can accept bids
  const canAcceptBids = isClient && isEditor;
  
  // Check if user can view all bids (clients can see all, partners only their own)
  const canViewAllBids = isClient;
  
  // Check if user can edit shipments
  const canEditShipments = isClient && isEditor;
  
  // Check if user can view audit logs
  const canViewAuditLogs = isAdmin;
  
  // Check if user can manage organization
  const canManageOrganization = isAdmin;

  return {
    // User state
    user,
    currentOrg,
    userType,
    isAuthenticated,
    
    // Role checks
    isPartner,
    isClient,
    isAdmin,
    isEditor,
    isViewer,
    
    // Permission checks
    canEditQuotes,
    canCreateQuotes,
    canSubmitBids,
    canAcceptBids,
    canViewAllBids,
    canEditShipments,
    canViewAuditLogs,
    canManageOrganization,
    
    // Raw data
    userRole,
    currentMembership,
  };
};