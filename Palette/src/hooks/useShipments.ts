import { useState, useEffect, useCallback } from 'react';
import { ShipmentService, ShipmentWithDetails } from '../lib/supabase/shipments';
import useSupabaseStore from '../store/useSupabaseStore';

export interface UseShipmentsResult {
  shipments: ShipmentWithDetails[];
  loading: boolean;
  error: string | null;
  selectedShipmentId: string | null;
  selectedShipment: ShipmentWithDetails | null;
  selectShipment: (id: string | null) => void;
  refreshShipments: () => Promise<void>;
}

export const useShipments = (): UseShipmentsResult => {
  const [shipments, setShipments] = useState<ShipmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const currentOrgId = useSupabaseStore(state => state.currentOrg?.id || null);
  
  const loadShipments = useCallback(async () => {
    if (!currentOrgId) {
      setShipments([]);
      setLoading(false);
      setError('No organization selected');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await ShipmentService.getShipments(currentOrgId);
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      setShipments(data);
    } catch (err) {
      console.error('Error loading shipments:', err);
      setError('Failed to load shipments');
    } finally {
      setLoading(false);
    }
  }, [currentOrgId]);
  
  useEffect(() => {
    loadShipments();
  }, [loadShipments]);
  
  const selectShipment = (id: string | null) => {
    setSelectedShipmentId(id);
  };
  
  const selectedShipment = selectedShipmentId 
    ? shipments.find(s => s.id === selectedShipmentId) || null
    : null;
  
  return {
    shipments,
    loading,
    error,
    selectedShipmentId,
    selectedShipment,
    selectShipment,
    refreshShipments: loadShipments
  };
}; 
