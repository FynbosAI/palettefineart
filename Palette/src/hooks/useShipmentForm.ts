import { useCallback } from 'react';
import useSupabaseStore from '../store/useSupabaseStore';
import type { Shipper, SelectedShipperContext } from '../types';

/**
 * Custom hook for managing shipment form state
 * Provides easy access to form data and actions while encapsulating store logic
 */
export const useShipmentForm = () => {
  const { 
    forms,
    updateShipmentForm,
    setGeminiArtworkData,
    updateGeminiArtworkImageUrl,
    clearGeminiArtworkBlobs,
    updateUploadState,
    resetShipmentForm,
    resetUploadState
  } = useSupabaseStore();

  // Memoized form update functions for better performance
  const updateOriginDestination = useCallback((origin: string, destination: string) => {
    updateShipmentForm({ origin, destination });
  }, [updateShipmentForm]);

  const updateDates = useCallback((arrivalDate: string, targetDateStart?: string, targetDateEnd?: string) => {
    if (typeof window !== 'undefined') {
      console.log('[SHIPMENT_DEBUG] updateDates invoked', {
        arrivalDate,
        targetDateStart,
        targetDateEnd,
      });
      console.trace('[SHIPMENT_DEBUG] updateDates stack trace');
    }
    updateShipmentForm({ arrivalDate, targetDateStart, targetDateEnd });
  }, [updateShipmentForm]);

  const updateArtworks = useCallback((artworks: any[]) => {
    updateShipmentForm({ artworks });
  }, [updateShipmentForm]);

  const addArtwork = useCallback((artwork: any) => {
    const currentArtworks = forms.shipment.artworks || [];
    updateShipmentForm({ artworks: [...currentArtworks, artwork] });
  }, [forms.shipment.artworks, updateShipmentForm]);

  const removeArtwork = useCallback((artworkId: string) => {
    const currentArtworks = forms.shipment.artworks || [];
    updateShipmentForm({ artworks: currentArtworks.filter(a => a.id !== artworkId) });
  }, [forms.shipment.artworks, updateShipmentForm]);

  const updateArtwork = useCallback((artworkId: string, updates: any) => {
    const currentArtworks = forms.shipment.artworks || [];
    updateShipmentForm({ 
      artworks: currentArtworks.map(a => a.id === artworkId ? { ...a, ...updates } : a) 
    });
  }, [forms.shipment.artworks, updateShipmentForm]);

  const toggleShipper = useCallback((shipper: Shipper) => {
    const selectedShippers = new Set(forms.shipment.selectedShippers);
    const selectedContexts = new Map(forms.shipment.selectedShipperContexts);
    const selectionId = shipper.branchOrgId;

    if (selectedShippers.has(selectionId)) {
      selectedShippers.delete(selectionId);
      selectedContexts.delete(selectionId);
    } else {
      selectedShippers.add(selectionId);
      selectedContexts.set(selectionId, {
        logisticsPartnerId: shipper.logisticsPartnerId,
        branchOrgId: shipper.branchOrgId,
        companyOrgId: shipper.companyOrgId,
      } as SelectedShipperContext);
    }

    updateShipmentForm({
      selectedShippers,
      selectedShipperContexts: selectedContexts,
    });
  }, [forms.shipment.selectedShippers, forms.shipment.selectedShipperContexts, updateShipmentForm]);

  const updateDeliveryRequirements = useCallback((requirements: Set<string>) => {
    updateShipmentForm({ deliveryRequirements: requirements });
  }, [updateShipmentForm]);

  const updateAccessAtDelivery = useCallback((access: Set<string>) => {
    updateShipmentForm({ accessAtDelivery: access });
  }, [updateShipmentForm]);

  const updateNotes = useCallback((notes: string) => {
    updateShipmentForm({ notes });
  }, [updateShipmentForm]);

  const updateTitle = useCallback((title: string) => {
    updateShipmentForm({ title });
  }, [updateShipmentForm]);

  const updateClientReference = useCallback((clientReference: string) => {
    updateShipmentForm({ clientReference });
  }, [updateShipmentForm]);

  const updateBiddingDeadline = useCallback((deadline: string | null) => {
    updateShipmentForm({ biddingDeadline: deadline });
  }, [updateShipmentForm]);

  const setAutoCloseBidding = useCallback((autoClose: boolean) => {
    updateShipmentForm({ autoCloseBidding: autoClose });
  }, [updateShipmentForm]);

  const setDimensionUnit = useCallback((unit: 'in' | 'cm') => {
    updateShipmentForm({ dimensionUnit: unit });
  }, [updateShipmentForm]);

  // Upload state helpers
  const setUploadProgress = useCallback((progress: number) => {
    updateUploadState({ overallProgress: progress });
  }, [updateUploadState]);

  const setProcessingStatus = useCallback((isProcessing: boolean, processingComplete: boolean = false) => {
    updateUploadState({ isProcessing, processingComplete });
  }, [updateUploadState]);

  const setProcessingComplete = useCallback((complete: boolean) => {
    updateUploadState({ processingComplete: complete });
  }, [updateUploadState]);

  const addUploadedFile = useCallback((file: File) => {
    const currentFiles = forms.uploadState.uploadedFiles || [];
    updateUploadState({ uploadedFiles: [...currentFiles, file] });
  }, [forms.uploadState.uploadedFiles, updateUploadState]);

  const removeUploadedFile = useCallback((fileName: string) => {
    const currentFiles = forms.uploadState.uploadedFiles || [];
    updateUploadState({ uploadedFiles: currentFiles.filter(f => f.name !== fileName) });
  }, [forms.uploadState.uploadedFiles, updateUploadState]);

  const addExtractedData = useCallback((data: any) => {
    const currentData = forms.uploadState.extractedData || [];
    updateUploadState({ extractedData: [...currentData, data] });
  }, [forms.uploadState.extractedData, updateUploadState]);

  const addUploadedFiles = useCallback((files: File[]) => {
    const currentFiles = forms.uploadState.uploadedFiles || [];
    updateUploadState({ uploadedFiles: [...currentFiles, ...files] });
  }, [forms.uploadState.uploadedFiles, updateUploadState]);

  const setExtractedData = useCallback((data: any[]) => {
    updateUploadState({ extractedData: data });
  }, [updateUploadState]);

  const setShipmentData = useCallback((data: any) => {
    updateUploadState({ 
      shipmentData: { 
        ...forms.uploadState.shipmentData, 
        ...data 
      } 
    });
  }, [forms.uploadState.shipmentData, updateUploadState]);

  return {
    // Form data
    shipmentForm: forms.shipment,
    geminiArtworkData: forms.geminiArtworkData,
    uploadState: forms.uploadState,
    
    // Form actions
    updateShipmentForm,
    updateOriginDestination,
    updateDates,
    updateArtworks,
    addArtwork,
    removeArtwork,
    updateArtwork,
    toggleShipper,
    updateDeliveryRequirements,
    updateAccessAtDelivery,
    updateNotes,
    updateTitle,
    updateClientReference,
    updateBiddingDeadline,
    setAutoCloseBidding,
    setDimensionUnit,
    
    // Gemini data actions
    setGeminiArtworkData,
    updateGeminiArtworkImageUrl,
    clearGeminiArtworkBlobs,
    
    // Upload actions
    updateUploadState,
    setUploadProgress,
    setProcessingStatus,
    setProcessingComplete,
    addUploadedFile,
    removeUploadedFile,
    addExtractedData,
    addUploadedFiles,
    setExtractedData,
    setShipmentData,
    
    // Reset actions
    resetShipmentForm,
    resetUploadState,
  };
}; 
