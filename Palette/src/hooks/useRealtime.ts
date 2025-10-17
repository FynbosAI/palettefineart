import { useEffect, useCallback } from 'react';
import useSupabaseStore from '../store/useSupabaseStore';
import logger from '../lib/utils/logger';

/**
 * Custom hook for managing Supabase realtime subscriptions
 * Handles subscription lifecycle and automatic cleanup
 */
export const useRealtime = () => {
  const {
    realtime,
    currentOrg,
    initializeRealtime,
    subscribeToQuotes,
    subscribeToShipments,
    subscribeToQuoteBids,
    unsubscribeFromAll,
  } = useSupabaseStore();

  // Initialize realtime on mount
  useEffect(() => {
    if (!realtime.isConnected) {
      initializeRealtime();
    }
  }, [realtime.isConnected, initializeRealtime]);

  // Subscribe to organization-specific data when org changes
  useEffect(() => {
    if (realtime.isConnected && currentOrg) {
      logger.debug('useRealtime', 'Setting up realtime subscriptions for org');
      
      // Subscribe to quotes and shipments for the current organization
      subscribeToQuotes();
      subscribeToShipments();
    }

    // Cleanup function to unsubscribe when org changes
    return () => {
      if (currentOrg) {
        logger.debug('useRealtime', 'Cleaning up realtime subscriptions for org change');
        unsubscribeFromAll();
      }
    };
  }, [currentOrg?.id, realtime.isConnected, subscribeToQuotes, subscribeToShipments, unsubscribeFromAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      logger.debug('useRealtime', 'Cleaning up all realtime subscriptions on unmount');
      unsubscribeFromAll();
    };
  }, [unsubscribeFromAll]);

  // Subscribe to specific quote bids
  const subscribeToQuote = useCallback((quoteId: string) => {
    if (realtime.isConnected && quoteId) {
      subscribeToQuoteBids(quoteId);
    }
  }, [realtime.isConnected, subscribeToQuoteBids]);

  // Get subscription status
  const getSubscriptionStatus = useCallback(() => {
    return {
      isConnected: realtime.isConnected,
      activeSubscriptions: realtime.subscriptions.size,
      lastActivity: realtime.lastActivity,
    };
  }, [realtime]);

  return {
    // Status
    isConnected: realtime.isConnected,
    subscriptionCount: realtime.subscriptions.size,
    lastActivity: realtime.lastActivity,
    
    // Actions
    subscribeToQuote,
    getSubscriptionStatus,
    
    // Direct access to store functions if needed
    initializeRealtime,
    unsubscribeFromAll,
  };
}; 