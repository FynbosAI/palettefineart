import useSupabaseStore from '../store/useSupabaseStore';
import { useUserRole } from './useUserRole';
import { useQuoteSelector } from './useQuoteSelector';

/**
 * Combined hook for common app state selections
 * Reduces the number of hooks components need to import
 */
export const useAppState = () => {
  const store = useSupabaseStore();
  const userRole = useUserRole();
  const quoteSelector = useQuoteSelector();

  return {
    // Authentication & Organization
    user: store.user,
    currentOrg: store.currentOrg,
    memberships: store.memberships,
    
    // Loading states
    loading: quoteSelector.loading || store.loading,
    initialLoading: store.initialLoading,
    error: quoteSelector.error || store.error,
    
    // Data
    shipments: store.shipments,
    quotes: quoteSelector.quotes,
    logisticsPartners: store.logisticsPartners,
    
    // User role helpers
    userType: userRole.userType,
    isClient: userRole.isClient,
    isPartner: userRole.isPartner,
    canEditShipments: userRole.canEditShipments,
    canViewAllBids: userRole.canViewAllBids,
    canAcceptBids: userRole.canAcceptBids,
    
    // Quote selection helpers
    selectedQuoteId: quoteSelector.selectedQuoteId,
    selectedQuote: quoteSelector.selectedQuote,
    selectedQuoteDetails: quoteSelector.selectedQuoteDetails,
    selectAndFetchQuote: quoteSelector.selectAndFetchQuote,
    selectQuote: quoteSelector.selectQuote,
    
    // Actions
    setLoading: store.setLoading,
    setError: store.setError,
    fetchShipments: store.fetchShipments,
    fetchQuotes: store.fetchQuotes,
    fetchLogisticsPartners: store.fetchLogisticsPartners,
  };
};