import { useCallback } from 'react';
import useSupabaseStore from '../store/useSupabaseStore';

/**
 * Custom hook for performing optimistic updates
 * Provides high-level functions for common optimistic operations
 */
export const useOptimisticUpdates = () => {
  const {
    optimistic,
    createQuoteOptimistic,
    updateQuoteOptimistic,
    addOptimisticOperation,
    confirmOptimisticOperation,
    rollbackOptimisticOperation,
    clearFailedOperations,
  } = useSupabaseStore();

  // Create a quote with optimistic updates
  const createQuoteWithOptimism = useCallback(async (quoteData: any) => {
    try {
      const result = await createQuoteOptimistic(quoteData);
      return result;
    } catch (error) {
      console.error('Optimistic quote creation failed:', error);
      return { data: null, error: (error as Error).message };
    }
  }, [createQuoteOptimistic]);

  // Update a quote with optimistic updates
  const updateQuoteWithOptimism = useCallback(async (quoteId: string, updates: any) => {
    try {
      const result = await updateQuoteOptimistic(quoteId, updates);
      return result;
    } catch (error) {
      console.error('Optimistic quote update failed:', error);
      return { data: null, error: (error as Error).message };
    }
  }, [updateQuoteOptimistic]);

  // Get status of all optimistic operations
  const getOptimisticStatus = useCallback(() => {
    const operations = Array.from(optimistic.operations.values());
    return {
      pending: operations.filter(op => op.status === 'pending').length,
      confirmed: operations.filter(op => op.status === 'confirmed').length,
      failed: operations.filter(op => op.status === 'failed').length,
      total: operations.length,
      hasFailures: operations.some(op => op.status === 'failed'),
      hasPending: operations.some(op => op.status === 'pending'),
    };
  }, [optimistic.operations]);

  // Check if a specific entity has pending optimistic operations
  const hasPendingOperations = useCallback((entityType?: 'quote' | 'shipment' | 'bid', entityId?: string) => {
    const operations = Array.from(optimistic.operations.values());
    
    if (!entityType) {
      return operations.some(op => op.status === 'pending');
    }
    
    if (!entityId) {
      return operations.some(op => op.entity === entityType && op.status === 'pending');
    }
    
    return operations.some(op => 
      op.entity === entityType && 
      op.status === 'pending' && 
      (op.data.id === entityId || op.data.quote_id === entityId)
    );
  }, [optimistic.operations]);

  // Retry failed operations
  const retryFailedOperations = useCallback(async () => {
    const failedOperations = Array.from(optimistic.operations.values()).filter(op => op.status === 'failed');
    
    for (const operation of failedOperations) {
      if (operation.entity === 'quote' && operation.type === 'create') {
        await createQuoteOptimistic(operation.data);
      } else if (operation.entity === 'quote' && operation.type === 'update') {
        await updateQuoteOptimistic(operation.data.id, operation.data);
      }
    }
  }, [optimistic.operations, createQuoteOptimistic, updateQuoteOptimistic]);

  return {
    // Status information
    optimisticStatus: getOptimisticStatus(),
    hasPendingOperations,
    
    // Operations
    createQuoteWithOptimism,
    updateQuoteWithOptimism,
    retryFailedOperations,
    clearFailedOperations,
    
    // Direct access to store functions if needed
    addOptimisticOperation,
    confirmOptimisticOperation,
    rollbackOptimisticOperation,
    
    // Raw optimistic state for advanced use cases
    optimisticOperations: optimistic.operations,
    optimisticQuotes: optimistic.optimisticQuotes,
  };
}; 