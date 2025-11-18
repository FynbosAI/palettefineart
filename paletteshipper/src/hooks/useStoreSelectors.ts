import useShipperStore from '../store/useShipperStore';
import { useMemo } from 'react';

// Prevent unnecessary re-renders by creating memoized selectors

export const useAuth = () => {
  const user = useShipperStore(state => state.user);
  const profile = useShipperStore(state => state.profile);
  const organization = useShipperStore(state => state.organization);
  const branchOrganization = useShipperStore(state => state.branchOrganization);
  const logisticsPartner = useShipperStore(state => state.logisticsPartner);
  const authLoading = useShipperStore(state => state.authLoading);
  const authHydrationPending = useShipperStore(state => state.authHydrationPending);
  const authHydrated = useShipperStore(state => state.authHydrated);
  const setUser = useShipperStore(state => state.setUser);
  const setProfile = useShipperStore(state => state.setProfile);
  const setOrganization = useShipperStore(state => state.setOrganization);
  const setBranchOrganization = useShipperStore(state => state.setBranchOrganization);
  const setLogisticsPartner = useShipperStore(state => state.setLogisticsPartner);
  const signIn = useShipperStore(state => state.signIn);
  const signUp = useShipperStore(state => state.signUp);
  const signOut = useShipperStore(state => state.signOut);
  
  return useMemo(() => ({
    user,
    profile,
    organization,
    branchOrganization,
    logisticsPartner,
    authLoading,
    authHydrationPending,
    authHydrated,
    setUser,
    setProfile,
    setOrganization,
    setBranchOrganization,
    setLogisticsPartner,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user,
    isPartner: !!logisticsPartner,
  }), [
    user,
    profile,
    organization,
    branchOrganization,
    logisticsPartner,
    authLoading,
    authHydrationPending,
    authHydrated,
    setUser,
    setProfile,
    setOrganization,
    setBranchOrganization,
    setLogisticsPartner,
    signIn,
    signUp,
    signOut
  ]);
};

export const useQuotes = () => {
  const availableQuotes = useShipperStore(state => state.availableQuotes);
  const selectedQuoteId = useShipperStore(state => state.selectedQuoteId);
  const fetchAvailableQuotes = useShipperStore(state => state.fetchAvailableQuotes);
  const fetchQuoteDetails = useShipperStore(state => state.fetchQuoteDetails);
  const selectQuote = useShipperStore(state => state.selectQuote);
  
  const selectedQuote = useMemo(() => 
    availableQuotes.find(q => q.id === selectedQuoteId),
    [availableQuotes, selectedQuoteId]
  );
  
  return useMemo(() => ({
    availableQuotes,
    selectedQuoteId,
    selectedQuote,
    fetchAvailableQuotes,
    fetchQuoteDetails,
    selectQuote,
  }), [availableQuotes, selectedQuoteId, selectedQuote, fetchAvailableQuotes, fetchQuoteDetails, selectQuote]);
};

export const useBids = () => {
  const myBids = useShipperStore(state => state.myBids);
  const selectedBidId = useShipperStore(state => state.selectedBidId);
  const fetchMyBids = useShipperStore(state => state.fetchMyBids);
  const selectBid = useShipperStore(state => state.selectBid);
  const saveBidDraft = useShipperStore(state => state.saveBidDraft);
  const submitBid = useShipperStore(state => state.submitBid);
  const withdrawBid = useShipperStore(state => state.withdrawBid);
  const confirmBid = useShipperStore(state => state.confirmBid);
  
  const selectedBid = useMemo(() => 
    myBids.find(b => b.id === selectedBidId),
    [myBids, selectedBidId]
  );
  
  return useMemo(() => ({
    myBids,
    selectedBidId,
    selectedBid,
    fetchMyBids,
    selectBid,
    saveBidDraft,
    submitBid,
    withdrawBid,
    confirmBid,
  }), [myBids, selectedBidId, selectedBid, fetchMyBids, selectBid, saveBidDraft, submitBid, withdrawBid, confirmBid]);
};

export const useShipments = () => {
  const assignedShipments = useShipperStore(state => state.assignedShipments);
  const selectedShipmentId = useShipperStore(state => state.selectedShipmentId);
  const fetchAssignedShipments = useShipperStore(state => state.fetchAssignedShipments);
  const selectShipment = useShipperStore(state => state.selectShipment);
  const pendingChangeByShipmentId = useShipperStore(state => state.pendingChangeByShipmentId);
  
  const selectedShipment = useMemo(() => 
    assignedShipments.find(s => s.id === selectedShipmentId),
    [assignedShipments, selectedShipmentId]
  );
  
  return useMemo(() => ({
    assignedShipments,
    selectedShipmentId,
    selectedShipment,
    fetchAssignedShipments,
    selectShipment,
    pendingChangeByShipmentId,
  }), [assignedShipments, selectedShipmentId, selectedShipment, fetchAssignedShipments, selectShipment, pendingChangeByShipmentId]);
};

export const usePartners = () => {
  const partners = useShipperStore(state => state.partners);
  const fetchPartners = useShipperStore(state => state.fetchPartners);
  
  return useMemo(() => ({
    partners,
    fetchPartners,
  }), [partners, fetchPartners]);
};

export const useBranchNetwork = () => {
  const branchNetwork = useShipperStore(state => state.branchNetwork);
  const branchNetworkLoading = useShipperStore(state => state.branchNetworkLoading);
  const branchNetworkError = useShipperStore(state => state.branchNetworkError);
  const fetchBranchNetwork = useShipperStore(state => state.fetchBranchNetwork);

  return useMemo(() => ({
    branchNetwork,
    branchNetworkLoading,
    branchNetworkError,
    fetchBranchNetwork,
  }), [branchNetwork, branchNetworkLoading, branchNetworkError, fetchBranchNetwork]);
};

export const useContactableShippers = () => {
  const contactableShippers = useShipperStore(state => state.contactableShippers);
  const fetchContactableShippers = useShipperStore(state => state.fetchContactableShippers);

  return useMemo(() => ({
    contactableShippers,
    fetchContactableShippers,
  }), [contactableShippers, fetchContactableShippers]);
};

// Shipment Change Requests
export const useChangeRequests = () => {
  const currentChangeRequests = useShipperStore(state => state.currentChangeRequests);
  const fetchShipmentChangeRequests = useShipperStore(state => state.fetchShipmentChangeRequests);
  const createChangeRequest = useShipperStore(state => state.createChangeRequest);
  const respondToChangeRequest = useShipperStore(state => state.respondToChangeRequest);
  const withdrawChangeRequestAndShipment = useShipperStore(state => state.withdrawChangeRequestAndShipment);
  const changeRequestActionLoading = useShipperStore(state => state.changeRequestActionLoading);
  const counterDraftLineItems = useShipperStore(state => state.counterDraftLineItems);
  const initializeCounterDraft = useShipperStore(state => state.initializeCounterDraft);
  const updateCounterDraftLineItem = useShipperStore(state => state.updateCounterDraftLineItem);
  const addCounterDraftLineItem = useShipperStore(state => state.addCounterDraftLineItem);
  const removeCounterDraftLineItem = useShipperStore(state => state.removeCounterDraftLineItem);
  const clearCounterDraft = useShipperStore(state => state.clearCounterDraft);

  return useMemo(() => ({
    currentChangeRequests,
    fetchShipmentChangeRequests,
    createChangeRequest,
    respondToChangeRequest,
    withdrawChangeRequestAndShipment,
    changeRequestActionLoading,
    counterDraftLineItems,
    initializeCounterDraft,
    updateCounterDraftLineItem,
    addCounterDraftLineItem,
    removeCounterDraftLineItem,
    clearCounterDraft,
  }), [
    currentChangeRequests,
    fetchShipmentChangeRequests,
    createChangeRequest,
    respondToChangeRequest,
    withdrawChangeRequestAndShipment,
    changeRequestActionLoading,
    counterDraftLineItems,
    initializeCounterDraft,
    updateCounterDraftLineItem,
    addCounterDraftLineItem,
    removeCounterDraftLineItem,
    clearCounterDraft
  ]);
};

export const useBidForm = () => {
  const bidForm = useShipperStore(state => state.forms.bid);
  const updateBidForm = useShipperStore(state => state.updateBidForm);
  
  return useMemo(() => ({
    bidForm,
    updateBidForm,
  }), [bidForm, updateBidForm]);
};

export const useLoadingState = () => {
  const loading = useShipperStore(state => state.loading);
  const error = useShipperStore(state => state.error);
  const setLoading = useShipperStore(state => state.setLoading);
  const setError = useShipperStore(state => state.setError);
  
  return useMemo(() => ({
    loading,
    error,
    setLoading,
    setError,
  }), [loading, error, setLoading, setError]);
};

// Combined selector for dashboard data
export const useDashboardData = () => {
  const quotes = useShipperStore(state => state.availableQuotes);
  const bids = useShipperStore(state => state.myBids);
  const shipments = useShipperStore(state => state.assignedShipments);
  const loading = useShipperStore(state => state.loading);
  const error = useShipperStore(state => state.error);
  const fetchAvailableQuotes = useShipperStore(state => state.fetchAvailableQuotes);
  const fetchMyBids = useShipperStore(state => state.fetchMyBids);
  const fetchAssignedShipments = useShipperStore(state => state.fetchAssignedShipments);
  
  const stats = useMemo(() => ({
    totalQuotes: quotes.length,
    openQuotes: quotes.filter(q => q.status === 'active').length,
    activeBids: bids.filter(b => b.status === 'pending' || b.status === 'submitted').length,
    wonBids: bids.filter(b => b.status === 'accepted').length,
    activeShipments: shipments.filter(s => 
      ['in_transit', 'pending', 'checking', 'collected'].includes(s.status)
    ).length,
    deliveredShipments: shipments.filter(s => s.status === 'delivered').length,
    totalShipmentValue: shipments.reduce((sum, s) => sum + (s.total_value || 0), 0),
  }), [quotes, bids, shipments]);
  
  // Calculate bid success rate
  const bidSuccessRate = useMemo(() => {
    const acceptedBids = bids.filter(b => b.status === 'accepted').length;
    const rejectedBids = bids.filter(b => b.status === 'rejected').length;
    const totalDecided = acceptedBids + rejectedBids;
    
    return totalDecided > 0 ? (acceptedBids / totalDecided) * 100 : 0;
  }, [bids]);
  
  // Calculate average response time (requires timestamp data from Supabase)
  const avgResponseTime = useMemo(() => {
    // This would need to be calculated from actual submitted_at and created_at timestamps
    // Currently not available in the data structure
    return null;
  }, [bids]);
  
  return useMemo(() => ({
    quotes,
    bids,
    shipments,
    stats,
    bidSuccessRate,
    avgResponseTime,
    loading,
    error,
    fetchAvailableQuotes,
    fetchMyBids,
    fetchAssignedShipments,
  }), [quotes, bids, shipments, stats, bidSuccessRate, avgResponseTime, loading, error, fetchAvailableQuotes, fetchMyBids, fetchAssignedShipments]);
};

// Selector for real-time state
export const useRealtime = () => {
  const realtime = useShipperStore(state => state.realtime);
  const initializeRealtime = useShipperStore(state => state.initializeRealtime);
  const unsubscribeFromAll = useShipperStore(state => state.unsubscribeFromAll);
  
  return useMemo(() => ({
    isConnected: realtime.isConnected,
    subscriptionCount: realtime.subscriptions.size,
    initializeRealtime,
    unsubscribeFromAll,
  }), [realtime, initializeRealtime, unsubscribeFromAll]);
};

// Selector for specific quote with details
export const useQuoteDetails = (quoteId: string | null) => {
  const availableQuotes = useShipperStore(state => state.availableQuotes);
  const myBids = useShipperStore(state => state.myBids);
  
  const quote = useMemo(() => 
    quoteId ? availableQuotes.find(q => q.id === quoteId) : null,
    [availableQuotes, quoteId]
  );
  
  const bidForQuote = useMemo(() => 
    quoteId ? myBids.find(b => b.quote_id === quoteId) : null,
    [myBids, quoteId]
  );
  
  return useMemo(() => ({
    quote,
    bidForQuote,
    hasBid: !!bidForQuote,
    bidStatus: bidForQuote?.status,
  }), [quote, bidForQuote]);
};
