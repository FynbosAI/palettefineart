import useSupabaseStore from '../store/useSupabaseStore';
import { useCallback, useMemo } from 'react';

/**
 * Optimized selector hooks for specific parts of the store
 * These hooks prevent unnecessary re-renders by only subscribing to specific slices
 */

// Auth selectors
export const useAuth = () => {
  const user = useSupabaseStore(state => state.user);
  const profile = useSupabaseStore(state => state.profile);
  const currentOrg = useSupabaseStore(state => state.currentOrg);
  const memberships = useSupabaseStore(state => state.memberships);
  const setUser = useSupabaseStore(state => state.setUser);
  const setProfile = useSupabaseStore(state => state.setProfile);
  const setCurrentOrg = useSupabaseStore(state => state.setCurrentOrg);
  const fetchUserMemberships = useSupabaseStore(state => state.fetchUserMemberships);
  const switchOrganization = useSupabaseStore(state => state.switchOrganization);

  return useMemo(() => ({
    user,
    profile,
    currentOrg,
    memberships,
    setUser,
    setProfile,
    setCurrentOrg,
    fetchUserMemberships,
    switchOrganization,
  }), [user, profile, currentOrg, memberships, setUser, setProfile, setCurrentOrg, fetchUserMemberships, switchOrganization]);
};

// Data loading selectors
export const useLoadingState = () => {
  const loading = useSupabaseStore(state => state.loading);
  const initialLoading = useSupabaseStore(state => state.initialLoading);
  const error = useSupabaseStore(state => state.error);
  const setLoading = useSupabaseStore(state => state.setLoading);
  const setError = useSupabaseStore(state => state.setError);

  return useMemo(() => ({
    loading,
    initialLoading,
    error,
    setLoading,
    setError,
  }), [loading, initialLoading, error, setLoading, setError]);
};

// Shipments selectors
export const useShipments = () => {
  const shipments = useSupabaseStore(state => state.shipments);
  const selectedShipmentId = useSupabaseStore(state => state.selectedShipmentId);
  const fetchShipments = useSupabaseStore(state => state.fetchShipments);
  const fetchShipmentDetails = useSupabaseStore(state => state.fetchShipmentDetails);
  const selectShipment = useSupabaseStore(state => state.selectShipment);

  return useMemo(() => ({
    shipments,
    selectedShipmentId,
    fetchShipments,
    fetchShipmentDetails,
    selectShipment,
  }), [shipments, selectedShipmentId, fetchShipments, fetchShipmentDetails, selectShipment]);
};

// Quotes selectors
export const useQuotes = () => {
  const quotes = useSupabaseStore(state => state.quotes);
  const selectedQuoteId = useSupabaseStore(state => state.selectedQuoteId);
  const fetchQuotes = useSupabaseStore(state => state.fetchQuotes);
  const fetchQuoteDetails = useSupabaseStore(state => state.fetchQuoteDetails);
  const selectQuote = useSupabaseStore(state => state.selectQuote);

  return useMemo(() => ({
    quotes,
    selectedQuoteId,
    fetchQuotes,
    fetchQuoteDetails,
    selectQuote,
  }), [quotes, selectedQuoteId, fetchQuotes, fetchQuoteDetails, selectQuote]);
};

// Unified selection for logistics page
export const useUnifiedSelection = () => {
  const selectedItemId = useSupabaseStore(state => state.selectedItemId);
  const selectedItemType = useSupabaseStore(state => state.selectedItemType);
  const selectUnifiedItem = useSupabaseStore(state => state.selectUnifiedItem);

  return useMemo(() => ({
    selectedItemId,
    selectedItemType,
    selectUnifiedItem,
  }), [selectedItemId, selectedItemType, selectUnifiedItem]);
};

// Logistics partners selector
export const useLogisticsPartners = () => {
  const logisticsPartners = useSupabaseStore(state => state.logisticsPartners);
  const fetchLogisticsPartners = useSupabaseStore(state => state.fetchLogisticsPartners);

  return useMemo(() => ({
    logisticsPartners,
    fetchLogisticsPartners,
  }), [logisticsPartners, fetchLogisticsPartners]);
};

// Data initialization selector
export const useDataInitialization = () => {
  const prefetchInitialData = useSupabaseStore(state => state.prefetchInitialData);
  const preloadDashboardData = useSupabaseStore(state => state.preloadDashboardData);
  const clearStore = useSupabaseStore(state => state.clearStore);

  return useMemo(() => ({
    prefetchInitialData,
    preloadDashboardData,
    clearStore,
  }), [prefetchInitialData, preloadDashboardData, clearStore]);
};

// Combined selectors for common use cases
export const useDashboardData = () => {
  const shipments = useSupabaseStore(state => state.shipments);
  const quotes = useSupabaseStore(state => state.quotes);
  const logisticsPartners = useSupabaseStore(state => state.logisticsPartners);
  const loading = useSupabaseStore(state => state.loading);
  const error = useSupabaseStore(state => state.error);
  const hasDashboardPreloaded = useSupabaseStore(state => state.hasDashboardPreloaded);
  const fetchShipments = useSupabaseStore(state => state.fetchShipments);
  const fetchQuotes = useSupabaseStore(state => state.fetchQuotes);
  const fetchLogisticsPartners = useSupabaseStore(state => state.fetchLogisticsPartners);
  const preloadDashboardData = useSupabaseStore(state => state.preloadDashboardData);

  return useMemo(() => ({
    shipments,
    quotes,
    logisticsPartners,
    loading,
    error,
    hasDashboardPreloaded,
    fetchShipments,
    fetchQuotes,
    fetchLogisticsPartners,
    preloadDashboardData,
  }), [shipments, quotes, logisticsPartners, loading, error, hasDashboardPreloaded, fetchShipments, fetchQuotes, fetchLogisticsPartners, preloadDashboardData]);
};

export const useLogisticsPageData = () => {
  const shipments = useSupabaseStore(state => state.shipments);
  const quotes = useSupabaseStore(state => state.quotes);
  const selectedItemId = useSupabaseStore(state => state.selectedItemId);
  const selectedItemType = useSupabaseStore(state => state.selectedItemType);
  const loading = useSupabaseStore(state => state.loading);
  const error = useSupabaseStore(state => state.error);
  const currentOrg = useSupabaseStore(state => state.currentOrg);
  const initialLoading = useSupabaseStore(state => state.initialLoading);
  const selectUnifiedItem = useSupabaseStore(state => state.selectUnifiedItem);
  const branchNetworkAuthError = useSupabaseStore(state => state.branchNetworkAuthError);

  return useMemo(() => ({
    shipments,
    quotes,
    selectedItemId,
    selectedItemType,
    loading,
    error,
    currentOrg,
    initialLoading,
    selectUnifiedItem,
    branchNetworkAuthError,
  }), [shipments, quotes, selectedItemId, selectedItemType, loading, error, currentOrg, initialLoading, selectUnifiedItem, branchNetworkAuthError]);
};
