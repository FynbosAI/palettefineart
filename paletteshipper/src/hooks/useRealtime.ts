import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import useShipperStore from '../store/useShipperStore';
import { useAuth } from './useStoreSelectors';

export const useRealtime = () => {
  const { logisticsPartner, organization } = useAuth();
  const { 
    realtime, 
    fetchAvailableQuotes, 
    fetchMyBids,
    fetchAssignedShipments 
  } = useShipperStore();

  const subscribeToQuotes = useCallback(() => {
    if (!logisticsPartner?.id) return;

    const channel = supabase
      .channel('quotes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quotes',
          filter: `status=eq.active`,
        },
        async (payload) => {
          console.log('Quote change:', payload);
          
          // Refresh quotes list
          await fetchAvailableQuotes();
        }
      )
      .subscribe();

    useShipperStore.setState((state) => ({
      realtime: {
        ...state.realtime,
        subscriptions: new Map(state.realtime.subscriptions).set('quotes', channel),
      },
    }));
  }, [logisticsPartner, fetchAvailableQuotes]);

  const subscribeToBids = useCallback(() => {
    if (!logisticsPartner?.id) return;

    const channel = supabase
      .channel(`partner-bids-${logisticsPartner.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bids',
          filter: `logistics_partner_id=eq.${logisticsPartner.id}`,
        },
        async (payload) => {
          console.log('Bid change:', payload);
          
          // Refresh bids list
          await fetchMyBids();
        }
      )
      .subscribe();

    useShipperStore.setState((state) => ({
      realtime: {
        ...state.realtime,
        subscriptions: new Map(state.realtime.subscriptions).set('bids', channel),
      },
    }));
  }, [logisticsPartner, fetchMyBids]);

  const subscribeToShipments = useCallback(() => {
    // Subscribe based on user type: logistics partner or organization owner
    if (logisticsPartner?.id) {
      // Logistics partner: subscribe to shipments assigned to them
      console.log('🔄 Subscribing to shipments for logistics partner:', logisticsPartner.id);
      
      const channel = supabase
        .channel(`partner-shipments-${logisticsPartner.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shipments',
            filter: `logistics_partner_id=eq.${logisticsPartner.id}`,
          },
          async (payload) => {
            console.log('Logistics partner shipment change:', payload);
            await fetchAssignedShipments();
          }
        )
        .subscribe();

      useShipperStore.setState((state) => ({
        realtime: {
          ...state.realtime,
          subscriptions: new Map(state.realtime.subscriptions).set('shipments', channel),
        },
      }));
    } else if (organization?.id) {
      // Organization owner: subscribe to shipments owned by their organization
      console.log('🔄 Subscribing to shipments for organization:', organization.id);
      
      const channel = supabase
        .channel(`org-shipments-${organization.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shipments',
            filter: `owner_org_id=eq.${organization.id}`,
          },
          async (payload) => {
            console.log('Organization shipment change:', payload);
            await fetchAssignedShipments();
          }
        )
        .subscribe();

      useShipperStore.setState((state) => ({
        realtime: {
          ...state.realtime,
          subscriptions: new Map(state.realtime.subscriptions).set('shipments', channel),
        },
      }));
    }
  }, [logisticsPartner, organization, fetchAssignedShipments]);

  const subscribeToTrackingEvents = useCallback(() => {
    // Subscribe to tracking events for both logistics partners and organization owners
    if (logisticsPartner?.id || organization?.id) {
      const identifier = logisticsPartner?.id || organization?.id;
      const userType = logisticsPartner?.id ? 'partner' : 'org';
      
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
            await fetchAssignedShipments();
          }
        )
        .subscribe();

      useShipperStore.setState((state) => ({
        realtime: {
          ...state.realtime,
          subscriptions: new Map(state.realtime.subscriptions).set('tracking', channel),
        },
      }));
    }
  }, [logisticsPartner, organization, fetchAssignedShipments]);

  // Set up subscriptions
  useEffect(() => {
    // Must have either logistics partner or organization to set up subscriptions
    if ((!logisticsPartner?.id && !organization?.id) || realtime.isConnected) return;

    console.log('🔄 Setting up real-time subscriptions for:', {
      logisticsPartner: logisticsPartner?.name,
      organization: organization?.name
    });

    subscribeToQuotes();
    subscribeToBids();
    subscribeToShipments();
    subscribeToTrackingEvents();

    useShipperStore.setState((state) => ({
      realtime: { ...state.realtime, isConnected: true },
    }));

    return () => {
      // Cleanup handled by store's unsubscribeFromAll
    };
  }, [logisticsPartner, organization, realtime.isConnected, subscribeToQuotes, subscribeToBids, subscribeToShipments, subscribeToTrackingEvents]);

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