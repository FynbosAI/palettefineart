import { useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import useShipperStore from '../store/useShipperStore';
import { useAuth } from './useStoreSelectors';

type QuoteRow = { status?: string | null } | null;
type ShipmentRow = { logistics_partner_id?: string | null; owner_org_id?: string | null } | null;
type QuoteInviteRow = {
  id?: string | null;
  quote_id?: string | null;
  branch_org_id?: string | null;
  logistics_partner_id?: string | null;
} | null;

const STATUS_ACTIVE = 'active';

const quoteTouchesActiveList = (eventType: string, nextRow: QuoteRow, prevRow: QuoteRow) => {
  if (eventType === 'INSERT') {
    return nextRow?.status === STATUS_ACTIVE;
  }
  if (eventType === 'UPDATE') {
    return nextRow?.status === STATUS_ACTIVE || prevRow?.status === STATUS_ACTIVE;
  }
  if (eventType === 'DELETE') {
    return prevRow?.status === STATUS_ACTIVE;
  }
  return false;
};

const shipmentMatchesTenant = (
  row: ShipmentRow,
  logisticsPartnerId?: string,
  organizationId?: string
) => {
  if (!row) return false;
  if (logisticsPartnerId && row.logistics_partner_id === logisticsPartnerId) return true;
  if (organizationId && row.owner_org_id === organizationId) return true;
  return false;
};

export const useRealtime = () => {
  const { logisticsPartner, organization } = useAuth();
  const logisticsPartnerId = logisticsPartner?.id;
  const organizationId = organization?.id;
  const logisticsPartnerName = logisticsPartner?.name;
  const organizationName = organization?.name;
  const {
    realtime,
    fetchAvailableQuotes,
    fetchMyBids,
    fetchAssignedShipments,
  } = useShipperStore();

  const quoteRefreshPending = useRef(false);
  const bidRefreshPending = useRef(false);
  const shipmentRefreshPending = useRef(false);

  const registerSubscription = useCallback((key: string, channel: RealtimeChannel) => {
    console.log('✅ Realtime channel ready:', key, {
      logisticsPartnerId,
      organizationId,
    });
    useShipperStore.setState((state) => ({
      realtime: {
        ...state.realtime,
        subscriptions: new Map(state.realtime.subscriptions).set(key, channel),
      },
    }));
  }, [logisticsPartnerId, organizationId]);

  const refreshQuotes = useCallback(async () => {
    if (quoteRefreshPending.current) return;
    quoteRefreshPending.current = true;
    try {
      await fetchAvailableQuotes();
    } catch (error) {
      console.error('Failed to refresh quotes after realtime event:', error);
    } finally {
      quoteRefreshPending.current = false;
    }
  }, [fetchAvailableQuotes]);

  const refreshBids = useCallback(async () => {
    if (bidRefreshPending.current) return;
    bidRefreshPending.current = true;
    try {
      await fetchMyBids();
    } catch (error) {
      console.error('Failed to refresh bids after realtime event:', error);
    } finally {
      bidRefreshPending.current = false;
    }
  }, [fetchMyBids]);

  const refreshShipments = useCallback(async () => {
    if (shipmentRefreshPending.current) return;
    shipmentRefreshPending.current = true;
    try {
      await fetchAssignedShipments();
    } catch (error) {
      console.error('Failed to refresh shipments after realtime event:', error);
    } finally {
      shipmentRefreshPending.current = false;
    }
  }, [fetchAssignedShipments]);

  const subscribeToQuotes = useCallback(() => {
    if (!logisticsPartnerId) return;

    const channel = supabase
      .channel(`quotes-changes-${logisticsPartnerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quotes',
        },
        async (payload) => {
          const shouldRefresh = quoteTouchesActiveList(payload.eventType, payload.new, payload.old);
          if (!shouldRefresh) return;
          await refreshQuotes();
        }
      )
      .subscribe();

    registerSubscription('quotes', channel);
  }, [logisticsPartnerId, refreshQuotes, registerSubscription]);

  const subscribeToBids = useCallback(() => {
    if (!logisticsPartnerId) return;

    const channel = supabase
      .channel(`partner-bids-${logisticsPartnerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bids',
          filter: `logistics_partner_id=eq.${logisticsPartnerId}`,
        },
        async () => {
          await refreshBids();
        }
      )
      .subscribe();

    registerSubscription('bids', channel);
  }, [logisticsPartnerId, refreshBids, registerSubscription]);

  const subscribeToShipments = useCallback(() => {
    if (!logisticsPartnerId && !organizationId) return;

    const identifier = logisticsPartnerId ?? organizationId;
    const channel = supabase
      .channel(`shipments-${identifier}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shipments',
        },
        async (payload) => {
          const isRelevant =
            shipmentMatchesTenant(payload.new, logisticsPartnerId, organizationId) ||
            shipmentMatchesTenant(payload.old, logisticsPartnerId, organizationId);

          if (!isRelevant) return;
          await refreshShipments();
        }
      )
      .subscribe();

    registerSubscription('shipments', channel);
  }, [logisticsPartnerId, organizationId, refreshShipments, registerSubscription]);

  const subscribeToQuoteInvites = useCallback(() => {
    if (!logisticsPartnerId && !organizationId) return;

    const filterTargets: Array<{ column: 'branch_org_id' | 'logistics_partner_id'; value: string }> = [];
    if (organizationId) {
      filterTargets.push({ column: 'branch_org_id', value: organizationId });
    }
    if (logisticsPartnerId) {
      filterTargets.push({ column: 'logistics_partner_id', value: logisticsPartnerId });
    }

    const filter = (() => {
      if (filterTargets.length === 0) return undefined;
      if (filterTargets.length === 1) {
        const target = filterTargets[0];
        return `${target.column}=eq.${target.value}`;
      }
      const orExpression = filterTargets
        .map(({ column, value }) => `${column}.eq.${value}`)
        .join(',');
      return `or=(${orExpression})`;
    })();

    console.log('🔄 Subscribing to quote invites', {
      logisticsPartnerId,
      organizationId,
      filter,
    });

    const channel = supabase
      .channel(`quote-invites-${logisticsPartnerId ?? organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quote_invites',
          ...(filter ? { filter } : {}),
        },
        async (payload) => {
          const newInvite = payload.new as QuoteInviteRow;
          const oldInvite = payload.old as QuoteInviteRow;
          const inviteId = newInvite?.id ?? oldInvite?.id;
          const quoteId = newInvite?.quote_id ?? oldInvite?.quote_id;
          console.log('📨 Quote invite change received:', {
            event: payload.eventType,
            inviteId,
            quoteId,
          });

          const matchesBranch = Boolean(
            organizationId &&
            (newInvite?.branch_org_id === organizationId || oldInvite?.branch_org_id === organizationId)
          );
          const matchesPartner = Boolean(
            logisticsPartnerId &&
            (newInvite?.logistics_partner_id === logisticsPartnerId || oldInvite?.logistics_partner_id === logisticsPartnerId)
          );

          if (!matchesBranch && !matchesPartner) {
            console.log('↩️ Ignoring invite change for another tenant');
            return;
          }

          await refreshQuotes();
        }
      )
      .subscribe();

    registerSubscription('quote-invites', channel);
  }, [logisticsPartnerId, organizationId, refreshQuotes, registerSubscription]);

  const subscribeToTrackingEvents = useCallback(() => {
    // Subscribe to tracking events for both logistics partners and organization owners
    if (logisticsPartnerId || organizationId) {
      const identifier = logisticsPartnerId || organizationId;
      const userType = logisticsPartnerId ? 'partner' : 'org';
      
      console.log('🔄 Subscribing to tracking events for:', userType, identifier);

      const channel = supabase
        .channel(`tracking-events-${userType}-${identifier}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tracking_events',
          },
          async (payload) => {
            console.log('New tracking event:', payload);
            
            // Refresh shipments to get updated tracking events
            await refreshShipments();
          }
        )
        .subscribe();

      registerSubscription('tracking', channel);
    }
  }, [logisticsPartnerId, organizationId, refreshShipments, registerSubscription]);

  // Set up subscriptions
  useEffect(() => {
    // Must have either logistics partner or organization to set up subscriptions
    if ((!logisticsPartnerId && !organizationId) || realtime.isConnected) return;

    console.log('🔄 Setting up real-time subscriptions for:', {
      logisticsPartner: logisticsPartnerName,
      organization: organizationName,
    });

    subscribeToQuotes();
    subscribeToBids();
    subscribeToShipments();
    subscribeToQuoteInvites();
    subscribeToTrackingEvents();

    useShipperStore.setState((state) => ({
      realtime: { ...state.realtime, isConnected: true },
    }));

    return () => {
      // Cleanup handled by store's unsubscribeFromAll
    };
  }, [
    logisticsPartnerId,
    organizationId,
    realtime.isConnected,
    subscribeToQuotes,
    subscribeToBids,
    subscribeToShipments,
    subscribeToQuoteInvites,
    subscribeToTrackingEvents,
    logisticsPartnerName,
    organizationName,
  ]);

  return {
    isConnected: realtime.isConnected,
    subscriptionCount: realtime.subscriptions.size,
  };
};

// Hook for optimistic updates
export const useOptimisticUpdate = () => {
  const updateBidOptimistic = useCallback(async (
    bidId: string, 
    updates: any
  ) => {
    const { myBids } = useShipperStore.getState();
    
    // Apply optimistic update
    const optimisticBids = myBids.map(bid => 
      bid.id === bidId ? { ...bid, ...updates } : bid
    );
    
    useShipperStore.setState({ myBids: optimisticBids });
    
    try {
      // Make actual API call
      const { BidService } = await import('../services/BidService');
      const { data, error } = await BidService.updateBidStatus(bidId, updates.status, updates.reason);
      
      if (error) throw error;
      
      // Update with real data
      const realBids = myBids.map(bid => 
        bid.id === bidId ? data : bid
      );
      
      useShipperStore.setState({ myBids: realBids as any });
      
      return { success: true, data };
    } catch (error) {
      // Rollback on error
      useShipperStore.setState({ myBids });
      
      return { success: false, error };
    }
  }, []);

  const updateShipmentOptimistic = useCallback(async (
    shipmentId: string, 
    updates: any
  ) => {
    const { assignedShipments } = useShipperStore.getState();
    
    // Apply optimistic update
    const optimisticShipments = assignedShipments.map(shipment => 
      shipment.id === shipmentId ? { ...shipment, ...updates } : shipment
    );
    
    useShipperStore.setState({ assignedShipments: optimisticShipments });
    
    try {
      // Make actual API call
      const { ShipmentService } = await import('../services/ShipmentService');
      const { data, error } = await ShipmentService.updateShipmentStatus(
        shipmentId, 
        updates.status, 
        updates.notes,
        updates.location
      );
      
      if (error) throw error;
      
      // Refresh shipments to get all related data
      await useShipperStore.getState().fetchAssignedShipments();
      
      return { success: true, data };
    } catch (error) {
      // Rollback on error
      useShipperStore.setState({ assignedShipments });
      
      return { success: false, error };
    }
  }, []);

  return {
    updateBidOptimistic,
    updateShipmentOptimistic,
  };
};
