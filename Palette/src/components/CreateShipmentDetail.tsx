import React, { useState, useMemo, useEffect } from 'react';
import {
  Alert,
  Button,
  TextField,
  IconButton,
  useTheme,
  useMediaQuery,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormGroup,
  FormControlLabel,
  Checkbox,
  FormLabel,
  Chip,
  Container,
  Box
} from '@mui/material';
import { 
  ArrowBack as BackIcon,
  LocalShipping as GroundIcon,
  FlightTakeoff as AirIcon,
  Waves as SeaIcon,
  Shield as InsuranceIcon,
  GppBad as NoInsuranceIcon,
  Inventory2 as CrateIcon,
  People as WhiteGloveIcon,
  CameraAlt as ReportIcon,
  Star as StarIcon,
  LocationOn as LocationIcon,
  AccessTime as TimeIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import RouteMap from './Map';
import OriginDestination from './OriginDestination';
import ArtworkList from './ArtworkList';
import ShipmentSpecifics from './ShipmentSpecifics';
import DeliverySpecifics from './DeliverySpecifics';
import NotesField from './NotesField';
import ShipmentSummary from './ShipmentSummary';
import { Artwork, ShipmentDetails, TransportMode, TransportType, Shipper, SelectedShipperContext } from '../types';
import { API_BASE_URL } from '../config';
import { GeminiArtwork, DeliverySpecificsDetails } from '../types/legacy';
import useSupabaseStore from '../store/useSupabaseStore';
import { LocationService, QuoteService, LogisticsPartnerService, supabase } from '../lib/supabase';
import type { LogisticsPartnerFilterMeta, LogisticsPartnerBranchRecord } from '../lib/supabase';
import { useShipmentForm } from '../hooks/useShipmentForm';
import { useOptimisticUpdates } from '../hooks/useOptimisticUpdates';
import { DeliverySpecificsService } from '../lib/supabase/delivery-specifics';
import { 
  createArtworkImageUpload,
  confirmArtworkImageUpload,
  getArtworkImageViewUrl
} from '../../../shared/api/artworkImagesClient';

// Remove the hardcoded AVAILABLE_SHIPPERS array
// const AVAILABLE_SHIPPERS: Shipper[] = [
//   { id: 'atelier4', name: 'Atelier 4', logoUrl: '/path/to/atelier4-logo.png' },
//   { id: 'crown', name: 'Crown Fine Art', logoUrl: '/path/to/crown-logo.png' },
//   { id: 'gander', name: 'Gander & White', logoUrl: '/path/to/gander-logo.png' },
//   { id: 'crozier', name: 'Crozier', logoUrl: '/path/to/crozier-logo.png' }
// ];

// Transform GeminiArtwork to Artwork format
const transformGeminiArtworkToArtwork = (geminiArtwork: GeminiArtwork): Artwork => {
  // Parse numeric values from strings
  const parseNumericValue = (value: string): number => {
    const cleaned = value.replace(/[$,\s]/g, '');
    return parseFloat(cleaned) || 0;
  };

  // Use storage URL if available, otherwise fall back to cropped image URL
  let imageUrl = '/page_001_art_1.png'; // default
  if (geminiArtwork.imagePreviewUrl) {
    imageUrl = geminiArtwork.imagePreviewUrl;
  } else if (geminiArtwork.imageStorageUrl && geminiArtwork.imageStorageUrl.startsWith('http')) {
    imageUrl = geminiArtwork.imageStorageUrl;
  } else if (geminiArtwork.croppedImageUrl) {
    // Use the cropped image URL directly (it's already a data URL or full URL)
    imageUrl = geminiArtwork.croppedImageUrl;
  }

  return {
    id: geminiArtwork.id,
    title: geminiArtwork.artworkName || 'Untitled',
    artist: geminiArtwork.artistName || 'Unknown Artist',
    year: parseInt(geminiArtwork.year) || new Date().getFullYear(),
    description: geminiArtwork.description || '',
    imageUrl: imageUrl,
    value: parseNumericValue(geminiArtwork.declaredValue),
    dimensions: geminiArtwork.dimensions || '',
    medium: geminiArtwork.medium || '',
    countryOfOrigin: geminiArtwork.locationCreated || '',
    currentCustomsStatus: geminiArtwork.currentCustomsStatus || '',
    isFragile: geminiArtwork.specialRequirements?.lightSensitive || 
               geminiArtwork.specialRequirements?.temperatureSensitive || 
               geminiArtwork.specialRequirements?.humiditySensitive || false
  };
};

const DEFAULT_BRANCH_FILTER_META: LogisticsPartnerFilterMeta = {
  branchFilterApplied: false,
  branchNetworkCount: 0,
  filteredOutBranches: [],
  branchNetworkAuthError: false,
  branchNetworkErrorMessage: null,
};

const buildShipperDisplayName = (record: LogisticsPartnerBranchRecord): string => {
  const companyName = record.branchNetwork?.companyName ?? record.company?.name ?? record.partner.name ?? 'Unknown shipper';

  const candidateNames = [
    record.branchNetwork?.displayName,
    record.branchNetwork?.branchName,
    record.branch?.branch_name,
    record.branch?.name,
  ].filter((value): value is string => Boolean(value));

  const normalizedCompany = companyName.toLowerCase();
  const locationName = candidateNames.find(name => name && name.toLowerCase() !== normalizedCompany);

  if (locationName) {
    return `${companyName} — ${locationName}`;
  }

  return companyName;
};

const CreateShipmentDetail: React.FC = () => {
  const navigate = useNavigate();
  const supabaseStore = useSupabaseStore();
  const [saving, setSaving] = useState<boolean>(false);
  const { id: paramQuoteId } = useParams<{ id?: string }>();
  const [quoteId, setQuoteId] = useState<string | null>(paramQuoteId || null);
  
  // Use centralized form state from Zustand
  const {
    shipmentForm,
    geminiArtworkData,
    uploadState,
    updateOriginDestination,
    updateDates,
    updateArtworks,
    addArtwork,
    removeArtwork,
    updateArtwork,
    toggleShipper,
    updateShipmentForm,
    updateNotes,
    updateTitle,           // NEW
    updateClientReference, // NEW
    updateBiddingDeadline,
    setAutoCloseBidding,
    setGeminiArtworkData,
    updateGeminiArtworkImageUrl,
    clearGeminiArtworkBlobs,
    setDimensionUnit,
  } = useShipmentForm();
  
  // Use optimistic updates for better UX
  const { createQuoteWithOptimism, optimisticStatus, hasPendingOperations } = useOptimisticUpdates();
  
  // Get current organization
  const currentOrg = supabaseStore.currentOrg;
  
  // Transform gemini artwork data to component format
  const transformedArtworks = useMemo(() => {
    if (!geminiArtworkData) return [];
    return geminiArtworkData.map(transformGeminiArtworkToArtwork);
  }, [geminiArtworkData]);
  
  // Initialize artworks from gemini data if available
  useEffect(() => {
    if (transformedArtworks.length > 0 && shipmentForm.artworks.length === 0) {
      updateArtworks(transformedArtworks);
    }
  }, [transformedArtworks, shipmentForm.artworks.length, updateArtworks]);
  
  // Calculate total artwork value
  const totalArtworkValue = useMemo(() => {
    return shipmentForm.artworks.reduce((sum, artwork) => sum + artwork.value, 0);
  }, [shipmentForm.artworks]);
  
  // Check if any artwork is fragile
  const hasFragileArtwork = useMemo(() => {
    return shipmentForm.artworks.some(artwork => artwork.isFragile);
  }, [shipmentForm.artworks]);
  
  // Initialize origin and destination from upload state if available
  useEffect(() => {
    if (uploadState.shipmentData.origin && !shipmentForm.origin) {
      updateOriginDestination(uploadState.shipmentData.origin, shipmentForm.destination || uploadState.shipmentData.destination || 'New York, USA');
    }
    if (uploadState.shipmentData.destination && !shipmentForm.destination) {
      updateOriginDestination(shipmentForm.origin || uploadState.shipmentData.origin || 'London, UK', uploadState.shipmentData.destination);
    }
  }, [uploadState.shipmentData, shipmentForm.origin, shipmentForm.destination, updateOriginDestination]);
  
  // State for date validation (kept local as it's UI-specific)
  const [isDateValid, setIsDateValid] = useState<boolean>(false);
  const [dateRange, setDateRange] = useState<{startDate: string, endDate: string} | undefined>(undefined);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[SHIPMENT_DEBUG] CreateShipmentDetail arrival snapshot', {
        arrivalDate: shipmentForm.arrivalDate,
        targetDateStart: shipmentForm.targetDateStart,
        targetDateEnd: shipmentForm.targetDateEnd,
        dateRange,
        biddingDeadline: shipmentForm.biddingDeadline,
      });
    }
  }, [shipmentForm.arrivalDate, shipmentForm.targetDateStart, shipmentForm.targetDateEnd, shipmentForm.biddingDeadline, dateRange]);
  
  // Shipment details state (legacy compatibility)
  const [shipmentDetails, setShipmentDetails] = useState<ShipmentDetails>({
    transportMode: 'ground' as TransportMode,
    transportType: 'standard' as TransportType,
    arrivalDate: shipmentForm.arrivalDate || '',
    selectedShippers: shipmentForm.selectedShippers,
    selectedShipperContexts: shipmentForm.selectedShipperContexts ?? new Map(),
  });
  
  // Sync shipment details with form state
  useEffect(() => {
    setShipmentDetails({
      transportMode: 'ground' as TransportMode,
      transportType: 'standard' as TransportType,
      arrivalDate: shipmentForm.arrivalDate,
      selectedShippers: shipmentForm.selectedShippers,
      selectedShipperContexts: shipmentForm.selectedShipperContexts ?? new Map(),
    });
  }, [shipmentForm.arrivalDate, shipmentForm.selectedShippers, shipmentForm.selectedShipperContexts]);
  
  const [availableShippers, setAvailableShippers] = useState<Shipper[]>([]);
  const [loadingShippers, setLoadingShippers] = useState(true);
  const [isDeadlineValid, setIsDeadlineValid] = useState(true);
  const [branchFilterMeta, setBranchFilterMeta] = useState<LogisticsPartnerFilterMeta>(DEFAULT_BRANCH_FILTER_META);
  const [filteredSelectionLabels, setFilteredSelectionLabels] = useState<string[]>([]);

  const describeBranchRecord = (record: LogisticsPartnerBranchRecord): string => {
    return buildShipperDisplayName(record);
  };

  // Initialize delivery details in store if not already set
  React.useEffect(() => {
    if (shipmentForm.deliveryRequirements.size === 0) {
      updateShipmentForm({
        deliveryRequirements: new Set<string>(),
        packingRequirements: '',
        accessAtDelivery: new Set<string>()
      });
    }
  }, [shipmentForm.deliveryRequirements.size, updateShipmentForm]);

  // Load quote data if editing existing quote
  React.useEffect(() => {
    const loadQuote = async (id: string) => {
      if (!currentOrg?.id) {
        console.warn('[CREATE_SHIPMENT_DETAIL] Cannot load quote without current organization');
        return;
      }
      try {
        const { data, error } = await QuoteService.getQuote(id, currentOrg.id);
        if (error) {
          console.error('Failed to fetch quote', error);
          return;
        }
        if (data) {
          setQuoteId(data.id);
          console.log('[CREATE_SHIPMENT_DETAIL] Loading existing quote:', {
            id: data.id,
            title: data.title,
            clientReference: (data as any).client_reference,
            origin: data.origin?.name,
            destination: data.destination?.name
          });
          
          // Update form with loaded data
          if (typeof window !== 'undefined') {
            console.log('[SHIPMENT_DEBUG] loadQuote before applying data', {
              arrivalDate: shipmentForm.arrivalDate,
              targetDateStart: shipmentForm.targetDateStart,
              incomingStart: data.target_date_start,
              incomingEnd: data.target_date_end,
            });
          }
          updateShipmentForm({
            title: data.title || '',
            clientReference: (data as any).client_reference || ''
          });
          updateBiddingDeadline(data.bidding_deadline || null);
          setAutoCloseBidding(data.auto_close_bidding ?? true);

          // Set origin / destination – fall back to route parsing if names not available
          if (data.origin?.name && data.destination?.name) {
            updateOriginDestination(data.origin.name, data.destination.name);
          } else if (data.route && data.route.includes('→')) {
            const parts = data.route.split('→').map(p => p.trim());
            if (parts[0] && parts[1]) {
              updateOriginDestination(parts[0], parts[1]);
            }
          }
          if (data.target_date_start) {
            handleShipmentDetailChange('arrivalDate', data.target_date_start);
            // Set up date range if we have both start and end dates
            if (data.target_date_start && data.target_date_end) {
              setDateRange({
                startDate: data.target_date_start,
                endDate: data.target_date_end
              });
            }
          }
          if (typeof window !== 'undefined') {
            console.log('[SHIPMENT_DEBUG] loadQuote after handling target dates', {
              arrivalDate: shipmentForm.arrivalDate,
              targetDateStart: data.target_date_start,
              targetDateEnd: data.target_date_end,
            });
          }
          updateShipmentForm({
            originContactName: (data as any).origin_contact_name || '',
            originContactPhone: (data as any).origin_contact_phone || '',
            originContactEmail: (data as any).origin_contact_email || '',
            destinationContactName: (data as any).destination_contact_name || '',
            destinationContactPhone: (data as any).destination_contact_phone || '',
            destinationContactEmail: (data as any).destination_contact_email || '',
          });
          // TODO: populate artworks & shipment specifics when backend supports it
        }
      } catch (err) {
        console.error('Error loading quote', err);
      }
    };

    if (paramQuoteId) {
      loadQuote(paramQuoteId);
    }
  }, [paramQuoteId]);

  // Load logistics partners from Supabase
  useEffect(() => {
    const loadShippers = async () => {
      try {
        setLoadingShippers(true);

        const partnersResult = await LogisticsPartnerService.getLogisticsPartners();
        const partners = partnersResult.data || [];
        const filterMeta = partnersResult.meta ?? DEFAULT_BRANCH_FILTER_META;

        setBranchFilterMeta(filterMeta);

        if (partnersResult.error) {
          console.error('LogisticsPartnerService.getLogisticsPartners error:', partnersResult.error);
        }

        const shippers: Shipper[] = partners.map(record => {
          const { partner, branch, company, branchNetwork } = record;
          const companyName = branchNetwork?.companyName ?? company?.name ?? partner.name;
          const displayName = buildShipperDisplayName(record);
          const derivedBranchLabel = branchNetwork?.branchName ?? branch.branch_name ?? branch.name ?? null;
          const branchLabel = derivedBranchLabel || (displayName.includes(' — ') ? displayName.split(' — ').slice(1).join(' — ') : 'Primary');
          const abbreviation = partner.abbreviation ?? null;
          const logoUrl = abbreviation ? `/shippers/${abbreviation.toLowerCase()}.png` : null;
          const companyOrgId = branchNetwork?.companyOrgId ?? partner.org_id ?? company?.id ?? null;

          return {
            logisticsPartnerId: partner.id,
            branchOrgId: branch.id,
            companyOrgId,
            companyName,
            branchName: branchLabel,
            displayName,
            abbreviation,
            logoUrl,
            brandColor: partner.brand_color ?? null,
          } as Shipper;
        });

        const branchIdSet = new Set(shippers.map(shipper => shipper.branchOrgId));
        let effectiveSelected = new Set<string>(Array.from(shipmentForm.selectedShippers));
        let effectiveContexts = new Map<string, SelectedShipperContext>(shipmentDetails.selectedShipperContexts);
        let selectionMutated = false;
        let contextMutated = false;

        if (shippers.length > 0) {
          shippers.forEach(shipper => {
            const branchId = shipper.branchOrgId;
            const partnerId = shipper.logisticsPartnerId;

            if (effectiveSelected.has(partnerId) && !effectiveSelected.has(branchId)) {
              effectiveSelected.delete(partnerId);
              effectiveSelected.add(branchId);
              selectionMutated = true;
            }

            if (effectiveContexts.has(partnerId)) {
              const legacyContext = effectiveContexts.get(partnerId)!;
              effectiveContexts.delete(partnerId);
              effectiveContexts.set(branchId, legacyContext);
              contextMutated = true;
            }

            if (effectiveSelected.has(branchId) && !effectiveContexts.has(branchId)) {
              effectiveContexts.set(branchId, {
                logisticsPartnerId: partnerId,
                branchOrgId: branchId,
                companyOrgId: shipper.companyOrgId,
              });
              contextMutated = true;
            }
          });
        }

        const hiddenSelections = Array.from(effectiveSelected).filter(id => !branchIdSet.has(id));
        if (hiddenSelections.length > 0) {
          const filteredOutRecords = filterMeta.filteredOutBranches || [];
          const labels = hiddenSelections
            .map(id => {
              const record = filteredOutRecords.find(entry => entry.branch.id === id);
              if (record) {
                return describeBranchRecord(record);
              }
              const context = effectiveContexts.get(id) || shipmentForm.selectedShipperContexts?.get(id);
              if (context) {
                return context.branchOrgId;
              }
              return id;
            })
            .filter((label): label is string => Boolean(label));
          setFilteredSelectionLabels(Array.from(new Set(labels)));
          console.warn('[CREATE_SHIPMENT_DETAIL] Selected branches missing active members; retaining selection', {
            hiddenBranchIds: hiddenSelections,
            labels,
          });
        } else {
          setFilteredSelectionLabels([]);
        }

        setAvailableShippers(shippers);

        if (selectionMutated || contextMutated) {
          const nextSelected = effectiveSelected;
          const nextContexts = effectiveContexts;
          setShipmentDetails(prev => ({
            ...prev,
            selectedShippers: nextSelected,
            selectedShipperContexts: nextContexts,
          }));
          updateShipmentForm({
            selectedShippers: nextSelected,
            selectedShipperContexts: nextContexts,
          });
        }
      } catch (error) {
        console.error('Error loading shippers:', error);
      } finally {
        setLoadingShippers(false);
      }
    };
    
    loadShippers();
  }, []);

  // Helper function to upload artwork images to Supabase Storage
  const uploadArtworkImages = async (quoteId: string, artworkIds: string[]) => {
    console.log('[UPLOAD_DEBUG] Starting image upload process:', {
      geminiArtworkData: geminiArtworkData?.length || 0,
      artworkIds: artworkIds.length,
      quoteId
    });

    if (!geminiArtworkData || geminiArtworkData.length === 0) {
      console.log('[UPLOAD_DEBUG] No geminiArtworkData available for upload');
      return; // No images to upload
    }

    const sessionResponse = await supabase.auth.getSession();
    const accessToken = sessionResponse.data.session?.access_token;

    if (!accessToken) {
      console.warn('[UPLOAD_DEBUG] Unable to upload artwork images: missing Supabase access token');
      return;
    }

    const uploadPromises = geminiArtworkData.map(async (artwork, index) => {
      const artworkImageBlob = (artwork as any).imageBlob as Blob | undefined;
      const artworkStoragePath = (artwork as any).imageStoragePath as string | undefined;
      const artworkStorageUrl = (artwork as any).imageStorageUrl as string | undefined;
      const artworkPreviewUrl = (artwork as any).imagePreviewUrl as string | undefined;

      console.log('[UPLOAD_DEBUG] Processing artwork:', {
        id: artwork.id,
        index,
        hasBlob: !!artworkImageBlob,
        blobSize: artworkImageBlob?.size || 0,
        hasStoragePath: !!artworkStoragePath,
        storagePath: artworkStoragePath,
        storageUrl: artworkStorageUrl,
        previewUrl: artworkPreviewUrl
      });

      if (!artworkImageBlob) {
        console.log(`[UPLOAD_DEBUG] Skipping artwork ${artwork.id}: no blob available`);
        return null;
      }

      if (artworkStoragePath) {
        console.log(`[UPLOAD_DEBUG] Skipping artwork ${artwork.id}: already has storage path`);
        return null;
      }

      try {
        const artworkId = artworkIds[index];
        console.log(`[UPLOAD_DEBUG] Mapping gemini artwork at index ${index} (id: ${artwork.id}) to database artwork ID: ${artworkId}`);

        if (!artworkId) {
          console.warn(`No artwork ID found for index ${index}`);
          return null;
        }

        const contentType = artworkImageBlob.type || 'image/png';
        const fileExtension = (() => {
          if (contentType.includes('png')) return 'png';
          if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
          if (contentType.includes('webp')) return 'webp';
          if (contentType.includes('gif')) return 'gif';
          return 'bin';
        })();
        const originalFilename = `${artworkId}_${Date.now()}.${fileExtension}`;

        const createResult = await createArtworkImageUpload({
          quoteId,
          artworkId,
          originalFilename,
          contentType,
          accessToken,
          baseUrl: API_BASE_URL,
        });

        console.log(`[UPLOAD_DEBUG] Received signed upload token for artwork ${artworkId}:`, createResult);

        const { error: uploadError } = await supabase.storage
          .from(createResult.bucket)
          .uploadToSignedUrl(createResult.path, createResult.token, artworkImageBlob, {
            contentType,
            upsert: false,
            cacheControl: '3600',
          } as any);

        if (uploadError) {
          console.error(`[UPLOAD_DEBUG] Failed to upload image for artwork ${artworkId}:`, uploadError);
          throw uploadError;
        }

        console.log(`[UPLOAD_DEBUG] Signed upload successful for artwork ${artworkId}`);

        const confirmResult = await confirmArtworkImageUpload({
          quoteId,
          artworkId,
          path: createResult.path,
          originalFilename,
          accessToken,
          baseUrl: API_BASE_URL,
        });

        console.log(`[UPLOAD_DEBUG] Confirmed upload for artwork ${artworkId}:`, confirmResult);

        let previewUrl: string | null = null;
        let previewExpiresAt: number | null = null;

        try {
          const viewResult = await getArtworkImageViewUrl({
            artworkId,
            accessToken,
            baseUrl: API_BASE_URL,
          });
          previewUrl = viewResult.url;
          previewExpiresAt = Date.now() + 55_000; // expire slightly before backend TTL (60s)
          console.log(`[UPLOAD_DEBUG] Generated preview URL for artwork ${artworkId}:`, {
            legacy: viewResult.legacy,
          });
        } catch (viewErr) {
          console.warn(`[UPLOAD_DEBUG] Unable to fetch signed preview URL for artwork ${artworkId}:`, viewErr);
        }

        updateGeminiArtworkImageUrl(artwork.id, {
          storagePath: confirmResult.path,
          storageUrl: confirmResult.path,
          previewUrl: previewUrl ?? artworkPreviewUrl ?? artwork.croppedImageUrl ?? null,
          previewExpiresAt,
        });

        return { artworkId, path: confirmResult.path };
      } catch (error) {
        console.error(`Error uploading image for artwork ${artwork.id}:`, error);
        // Continue with other uploads even if one fails
        return null;
      }
    });

    try {
      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter(r => r !== null && r !== undefined);
      console.log(`Successfully uploaded ${successfulUploads.length} out of ${geminiArtworkData.length} images`);

      // Clear blobs from memory after successful upload
      if (successfulUploads.length > 0) {
        clearGeminiArtworkBlobs();
      }

      return successfulUploads;
    } catch (error) {
      console.error('Error during batch image upload:', error);
      // Don't throw - partial success is acceptable
    }
  };

  // Initialize date validation based on existing data
  React.useEffect(() => {
    const hasValidSingleDate = !!(shipmentForm.arrivalDate && 
      shipmentForm.arrivalDate.trim() !== '' && 
      !isNaN(new Date(shipmentForm.arrivalDate).getTime()));
    
    const hasValidDateRange = !!(dateRange && 
      dateRange.startDate && 
      dateRange.endDate && 
      !isNaN(new Date(dateRange.startDate).getTime()) && 
      !isNaN(new Date(dateRange.endDate).getTime()));
    
    setIsDateValid(hasValidSingleDate || hasValidDateRange);
  }, [shipmentForm.arrivalDate, dateRange]);

  // Validation logic
  const areArtworksValid = useMemo(() => {
    return shipmentForm.artworks.every(artwork => 
      // Required fields
      artwork.title && 
      artwork.title.trim() !== '' &&
      artwork.artist &&
      artwork.artist.trim() !== '' &&
      artwork.value > 0 &&
      artwork.medium &&
      artwork.medium.trim() !== '' &&
      artwork.description &&
      artwork.description.trim() !== '' &&
      artwork.imageUrl &&
      artwork.imageUrl.trim() !== '' &&
      artwork.countryOfOrigin &&
      artwork.countryOfOrigin.trim() !== '' &&
      artwork.currentCustomsStatus &&
      artwork.currentCustomsStatus.trim() !== '' &&
      artwork.year > 0
    );
  }, [shipmentForm.artworks]);

  const areShipmentSpecificsValid = useMemo(() => {
    return shipmentForm.selectedShippers.size > 0 && isDateValid;
  }, [shipmentForm.selectedShippers, isDateValid]);

  const isSubmitDisabled = !areArtworksValid
    || !areShipmentSpecificsValid
    || (shipmentForm.autoCloseBidding && !isDeadlineValid);

  // Handlers
  const handleBack = () => {
    navigate('/estimates/new');
  };

  const handleArtworkChange = (updatedArtwork: Artwork) => {
    updateArtwork(updatedArtwork.id, updatedArtwork);
  };

  const handleShipmentDetailChange = <K extends keyof ShipmentDetails>(
    key: K, 
    value: ShipmentDetails[K]
  ) => {
    // Update both local state and global store
    if (typeof window !== 'undefined') {
      console.log('[SHIPMENT_DEBUG] handleShipmentDetailChange', { key, value });
      if (key === 'arrivalDate') {
        console.trace('[SHIPMENT_DEBUG] handleShipmentDetailChange stack trace (arrivalDate)');
      }
    }
    setShipmentDetails(prev => ({ ...prev, [key]: value }));
    
    // Update global store based on the key
    if (key === 'arrivalDate') {
      updateDates(value as string, shipmentForm.targetDateStart, shipmentForm.targetDateEnd);
    } else if (key === 'selectedShippers') {
      updateShipmentForm({ selectedShippers: value as Set<string> });
    } else if (key === 'selectedShipperContexts') {
      updateShipmentForm({ selectedShipperContexts: value as Map<string, SelectedShipperContext> });
    } else if (key === 'transportMode' || key === 'transportType' || key === 'christiesAutoSelection') {
      // Handle other ShipmentDetails properties if needed
      console.log(`Updated ${key}:`, value);
    }
  };

  // Enhanced handler that can handle both ShipmentDetails and form properties
  const handleShipmentDetailOrFormChange = (key: string, value: any) => {
    // Handle ShipmentDetails properties
    if (key === 'arrivalDate') {
      updateDates(value as string, shipmentForm.targetDateStart, shipmentForm.targetDateEnd);
      setShipmentDetails(prev => ({ ...prev, [key]: value }));
    } else if (key === 'selectedShippers') {
      updateShipmentForm({ selectedShippers: value as Set<string> });
      setShipmentDetails(prev => ({ ...prev, [key]: value }));
    } else if (key === 'selectedShipperContexts') {
      updateShipmentForm({ selectedShipperContexts: value as Map<string, SelectedShipperContext> });
      setShipmentDetails(prev => ({ ...prev, [key]: value }));
    } else if (key === 'transportMode' || key === 'transportType' || key === 'christiesAutoSelection') {
      setShipmentDetails(prev => ({ ...prev, [key]: value }));
    }
    // Handle form properties not in ShipmentDetails
    else if (key === 'insuranceRequired') {
      updateShipmentForm({ insuranceRequired: value as boolean });
    } else if (key === 'packingRequirements') {
      updateShipmentForm({ packingRequirements: value as string });
    }
  };

  const handleOriginChange = (newOrigin: string) => {
    updateOriginDestination(newOrigin, shipmentForm.destination);
  };

  const handleDestinationChange = (newDestination: string) => {
    updateOriginDestination(shipmentForm.origin, newDestination);
  };

  const handleDateChange = (newDate: string) => {
    if (typeof window !== 'undefined') {
      console.log('[SHIPMENT_DEBUG] handleDateChange', { newDate, previousArrivalDate: shipmentForm.arrivalDate });
      console.trace('[SHIPMENT_DEBUG] handleDateChange stack trace');
    }
    updateDates(newDate, shipmentForm.targetDateStart, shipmentForm.targetDateEnd);
    handleShipmentDetailChange('arrivalDate', newDate);
  };

  const handleDateRangeChange = (newDateRange?: {startDate: string, endDate: string}) => {
    if (typeof window !== 'undefined') {
      console.log('[SHIPMENT_DEBUG] handleDateRangeChange', { newDateRange, currentRange: dateRange });
      console.trace('[SHIPMENT_DEBUG] handleDateRangeChange stack trace');
    }
    setDateRange(newDateRange);
    if (newDateRange) {
      updateDates(shipmentForm.arrivalDate || newDateRange.startDate, newDateRange.startDate, newDateRange.endDate);
    }
  };

  const handleDateValidationChange = (isValid: boolean) => {
    setIsDateValid(isValid);
  };

  const handleOriginContactNameChange = (value: string) => {
    updateShipmentForm({ originContactName: value });
  };

  const handleOriginContactPhoneChange = (value: string) => {
    updateShipmentForm({ originContactPhone: value });
  };

  const handleOriginContactEmailChange = (value: string) => {
    updateShipmentForm({ originContactEmail: value });
  };

  const handleDestinationContactNameChange = (value: string) => {
    updateShipmentForm({ destinationContactName: value });
  };

  const handleDestinationContactPhoneChange = (value: string) => {
    updateShipmentForm({ destinationContactPhone: value });
  };

  const handleDestinationContactEmailChange = (value: string) => {
    updateShipmentForm({ destinationContactEmail: value });
  };

  const handleAutoCloseChange = (nextValue: boolean) => {
    setAutoCloseBidding(nextValue);
    if (!nextValue) {
      setIsDeadlineValid(true);
    }
  };

  // Helper to upsert quote with a given status
  const upsertQuote = async (status: 'draft' | 'active') => {
    if (!supabaseStore.currentOrg) {
      alert('No organization selected – cannot save.');
      return;
    }

    // Basic validation before submitting
    if (!shipmentForm.origin.trim() || !shipmentForm.destination.trim()) {
      alert('Origin and destination are required.');
      return;
    }

    if (shipmentForm.autoCloseBidding && status === 'active' && !isDeadlineValid) {
      alert('Set a valid estimate deadline before submitting the request.');
      return;
    }

    try {
      setSaving(true);

      // 1. Ensure locations exist
      const originLoc = await LocationService.findOrCreateLocation(
        shipmentForm.origin,
        shipmentForm.origin,
        supabaseStore.currentOrg.id
      );
      const destinationLoc = await LocationService.findOrCreateLocation(
        shipmentForm.destination,
        shipmentForm.destination,
        supabaseStore.currentOrg.id
      );

      // 2. Build quote payload
      // Ensure we have valid dates or null values (not empty strings)
      const getValidDate = (dateStr: string | undefined | null): string | null => {
        if (!dateStr || dateStr.trim() === '') return null;
        try {
          // Validate the date string can be parsed
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return null;
          return dateStr;
        } catch {
          return null;
        }
      };

      const targetDate = getValidDate(shipmentForm.arrivalDate);
      const targetDateStart = getValidDate(shipmentForm.targetDateStart || dateRange?.startDate) || targetDate;
      const targetDateEnd = getValidDate(shipmentForm.targetDateEnd || dateRange?.endDate) || targetDate;

      // Debug logging to see what values we're working with
      console.log('Date values:', {
        arrivalDate: shipmentForm.arrivalDate,
        dateRange,
        targetDate,
        targetDateStart,
        targetDateEnd
      });

      // Build requirements object including invited shippers (exclude delivery specifics)
      const selectedInviteTargets = Array.from(shipmentDetails.selectedShipperContexts.entries())
        .filter(([selectionId]) => shipmentForm.selectedShippers.has(selectionId))
        .map(([, context]) => context);

      const invitedShipperNames = selectedInviteTargets
        .map(target => {
          const match = availableShippers.find(shipper => shipper.logisticsPartnerId === target.logisticsPartnerId);
          return match?.displayName ?? match?.companyName ?? target.logisticsPartnerId;
        });

      const requirements = {
        transport_method: shipmentDetails.transportMode,
        transport_type: shipmentDetails.transportType,
        invited_shippers: invitedShipperNames,
      };

      // Build delivery_specifics object for quotes table column
      const deliverySpecifics = {
        delivery_requirements: Array.from(shipmentForm.deliveryRequirements || new Set<string>()),
        packing_requirements: shipmentForm.packingRequirements || '',
        access_requirements: Array.from(shipmentForm.accessAtDelivery || new Set<string>()),
        safety_security_requirements: Array.from(shipmentForm.safetySecurityRequirements || new Set<string>()),
        condition_check_requirements: Array.from(shipmentForm.conditionCheckRequirements || new Set<string>())
      };

      const payload = {
        title: shipmentForm.title || (shipmentForm.artworks.length > 0 ? shipmentForm.artworks[0].title || 'Untitled Shipment' : 'New Shipment'),
        type: 'requested',
        status,
        route: `${shipmentForm.origin} → ${shipmentForm.destination}`,
        origin_id: originLoc.id,
        destination_id: destinationLoc.id,
        target_date: targetDate,
        target_date_start: targetDateStart,
        target_date_end: targetDateEnd,
        value: shipmentForm.artworks.reduce((sum, art) => sum + art.value, 0) || null,
        notes: shipmentForm.notes || null,
        requirements: requirements,
        delivery_specifics: deliverySpecifics,
        owner_org_id: supabaseStore.currentOrg.id,
        client_reference: shipmentForm.clientReference || null, // NEW
        origin_contact_name: shipmentForm.originContactName || null,
        origin_contact_phone: shipmentForm.originContactPhone || null,
        origin_contact_email: shipmentForm.originContactEmail || null,
        destination_contact_name: shipmentForm.destinationContactName || null,
        destination_contact_phone: shipmentForm.destinationContactPhone || null,
        destination_contact_email: shipmentForm.destinationContactEmail || null,
        bidding_deadline: shipmentForm.autoCloseBidding ? shipmentForm.biddingDeadline : null,
        auto_close_bidding: shipmentForm.autoCloseBidding,
      } as const;

      console.log('[CREATE_SHIPMENT_DETAIL] Saving quote with title and reference:', {
        title: payload.title,
        clientReference: payload.client_reference,
        biddingDeadline: payload.bidding_deadline,
        autoCloseBidding: payload.auto_close_bidding
      });

      let savedQuoteId = quoteId;

      if (quoteId) {
        // Update existing quote (TODO: also update artworks)
        const { error } = await supabaseStore.updateQuote(quoteId, payload as any);
        if (error) throw error;
        
        // TODO: Update artworks for existing quote
        // For now, we'll need to implement updateQuoteArtworks
      } else {
        // Convert shipment artworks to quote artwork format
        const quoteArtworks = shipmentForm.artworks.map(artwork => {
          const normalizeNumber = (value?: number) => {
            if (typeof value !== 'number') return null;
            return Number.isFinite(value) ? value : null;
          };
          const weightValue = normalizeNumber(artwork.weightValue);
          const volumetricWeightValue = normalizeNumber(artwork.volumetricWeightValue);
          const derivedWeightText = artwork.weight?.toString()?.trim().length
            ? artwork.weight.toString()
            : weightValue !== null
              ? `${weightValue}${artwork.weightUnit ? ` ${artwork.weightUnit}` : ''}`.trim()
              : null;

          return {
            name: artwork.title || artwork.description || 'Untitled',
            artist_name: artwork.artist,
            year_completed: artwork.year,
            medium: artwork.medium,
            dimensions: artwork.dimensions,
            weight: derivedWeightText,
            weight_value: weightValue,
            weight_unit: artwork.weightUnit || null,
            volumetric_weight_value: volumetricWeightValue,
            volumetric_weight_unit: artwork.volumetricWeightUnit || null,
            declared_value: artwork.value,
            crating: null,
            has_existing_crate: typeof artwork.hasExistingCrate === 'boolean' ? artwork.hasExistingCrate : null,
            category: artwork.category || null,
            item_type: artwork.itemType || null,
            period: artwork.period || null,
            description: artwork.description,
            image_url: null, // Don't store base64 data URL - will be updated after upload
            tariff_code: null,
            country_of_origin: artwork.countryOfOrigin,
            export_license_required: false,
            special_requirements: artwork.isFragile ? { fragile: true } : null,
          };
        });
        
        // Create quote with artworks
        const { data, error } = await supabaseStore.createQuoteWithArtworks(
          payload as any,
          quoteArtworks
        );
        if (error) throw error;
        savedQuoteId = data?.id ?? null;
        setQuoteId(savedQuoteId);
        
        // Upload images after quote creation (for both 'active' and 'draft' status)
        if (data?.quote_artworks && geminiArtworkData && savedQuoteId) {
          console.log('[UPLOAD_DEBUG] Conditions met for image upload:', {
            hasQuoteArtworks: !!data?.quote_artworks,
            quoteArtworksCount: data?.quote_artworks?.length || 0,
            hasGeminiData: !!geminiArtworkData,
            geminiDataCount: geminiArtworkData?.length || 0,
            savedQuoteId,
            geminiDataSample: geminiArtworkData?.slice(0, 2).map(a => ({
              id: a.id,
              hasBlob: !!(a as any).imageBlob,
              blobSize: ((a as any).imageBlob as Blob)?.size || 0
            }))
          });
          console.log('Uploading artwork images to Supabase Storage...');
          const artworkIds = data.quote_artworks.map((a: any) => a.id);
          await uploadArtworkImages(savedQuoteId, artworkIds);
        } else {
          console.log('[UPLOAD_DEBUG] Upload conditions not met:', {
            hasQuoteArtworks: !!data?.quote_artworks,
            hasGeminiData: !!geminiArtworkData,
            hasSavedQuoteId: !!savedQuoteId
          });
        }
      }

      // 3.5. Create/update quote invites for selected shippers
      if (savedQuoteId) {
        console.log('Creating quote invites for shippers:', selectedInviteTargets);
        
        let inviteResult;
        if (quoteId) {
          // Update existing quote invites
          inviteResult = await supabaseStore.updateQuoteInvites(savedQuoteId, selectedInviteTargets);
        } else {
          // Create new quote invites
          inviteResult = await supabaseStore.createQuoteInvites(savedQuoteId, selectedInviteTargets);
        }

        if (inviteResult.error) {
          console.error('Error managing quote invites:', inviteResult.error);
          // Don't fail the entire operation for invite errors, but log them
        } else {
          console.log('✅ Quote invites successfully managed');
        }
      }

      // 4. Refresh quotes in global store so QuotesPage shows the change
      await supabaseStore.fetchQuotes();

      if (status === 'draft') {
        alert('Draft saved successfully');
      } else {
        alert('Shipment request submitted');
        // Navigate to logistics tab after successful submission
        navigate('/logistics');
      }

    } catch (err) {
      console.error('Error saving quote:', err);
      alert(`Failed to save: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = () => upsertQuote('draft');

  const handleSubmit = () => upsertQuote('active');

  // Calculate summary data
  const summaryData = {
    artworkCount: shipmentForm.artworks.length,
    totalValue: shipmentForm.artworks.reduce((sum, artwork) => sum + artwork.value, 0),
    selectedShipperNames: availableShippers
      .filter(shipper => shipmentForm.selectedShippers.has(shipper.branchOrgId))
      .map(shipper => shipper.displayName)
  };

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Button
                startIcon={<BackIcon />}
                onClick={handleBack}
                sx={{
                  color: '#58517E',
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': {
                    background: 'rgba(132, 18, 255, 0.04)',
                  },
                }}
              >
                Back
              </Button>
              <h1 className="header-title">Estimate Details</h1>
            </div>
          </div>
        </header>

        <div className="main-content" style={{ flexDirection: 'row', gap: '24px', alignItems: 'flex-start' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '24px',
            flex: '1'
          }}>
            <OriginDestination 
              wrapWithCard
              showBiddingDeadline
              arrivalDate={shipmentForm.arrivalDate}
              dateRange={dateRange}
              origin={shipmentForm.origin}
              destination={shipmentForm.destination}
              title={shipmentForm.title}
              clientReference={shipmentForm.clientReference}
              originContactName={shipmentForm.originContactName || ''}
              originContactPhone={shipmentForm.originContactPhone || ''}
              originContactEmail={shipmentForm.originContactEmail || ''}
              destinationContactName={shipmentForm.destinationContactName || ''}
              destinationContactPhone={shipmentForm.destinationContactPhone || ''}
              destinationContactEmail={shipmentForm.destinationContactEmail || ''}
              biddingDeadline={shipmentForm.biddingDeadline}
              autoCloseBidding={shipmentForm.autoCloseBidding}
              onDateChange={handleDateChange}
              onDateRangeChange={handleDateRangeChange}
              onOriginChange={handleOriginChange}
              onDestinationChange={handleDestinationChange}
              onTitleChange={updateTitle}
              onClientReferenceChange={updateClientReference}
              onOriginContactNameChange={handleOriginContactNameChange}
              onOriginContactPhoneChange={handleOriginContactPhoneChange}
              onOriginContactEmailChange={handleOriginContactEmailChange}
              onDestinationContactNameChange={handleDestinationContactNameChange}
              onDestinationContactPhoneChange={handleDestinationContactPhoneChange}
              onDestinationContactEmailChange={handleDestinationContactEmailChange}
              onDateValidationChange={handleDateValidationChange}
              onBiddingDeadlineChange={updateBiddingDeadline}
              onAutoCloseBiddingChange={handleAutoCloseChange}
              onBiddingDeadlineValidationChange={setIsDeadlineValid}
            />

            <div className="detail-card">
              <ArtworkList 
                artworks={shipmentForm.artworks} 
                onArtworkChange={handleArtworkChange}
                showValidationErrors={!areArtworksValid}
                dimensionUnit={shipmentForm.dimensionUnit}
                onDimensionUnitChange={setDimensionUnit}
              />
            </div>
            
            <div className="detail-card">
              <DeliverySpecifics 
                transportMode={shipmentDetails.transportMode}
                transportType={shipmentDetails.transportType || undefined}
                totalArtworkValue={totalArtworkValue}
                isFragile={hasFragileArtwork}
                organizationName={currentOrg?.name}
                organizationId={currentOrg?.id}
              />
            </div>
            
            <div className="detail-card">
              {/* {branchFilterMeta.branchFilterApplied && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Showing {availableShippers.length} branch{availableShippers.length === 1 ? '' : 'es'} with active Palette sign-ins.
                  {branchFilterMeta.filteredOutBranches.length > 0 && (
                    <> {branchFilterMeta.filteredOutBranches.length} branch{branchFilterMeta.filteredOutBranches.length === 1 ? '' : 'es'} hidden until someone signs in.</>
                  )}
                </Alert>
              )} */}
              {!loadingShippers && branchFilterMeta.branchFilterApplied && availableShippers.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  No eligible shipper branches currently have active members. Ask your shippers to sign in so you can notify them.
                </Alert>
              )}
              {filteredSelectionLabels.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  We kept these previously selected branches, but they no longer have active members: {filteredSelectionLabels.join(', ')}.
                </Alert>
              )}
              <ShipmentSpecifics 
                details={shipmentDetails} 
                shippers={availableShippers} // Use dynamic shippers
                onDetailChange={handleShipmentDetailChange}
              />
              {loadingShippers && (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <span>Loading shippers...</span>
                </div>
              )}
            </div>
            
            <div className="detail-card">
              <NotesField
                value={shipmentForm.notes || ''}
                onChange={updateNotes}
                placeholder="Add any special instructions, requirements, or notes for this estimate..."
                label="Additional Notes"
              />
            </div>
          </div>
          
          <div className="right-container" style={{ 
            width: '300px', 
            flexShrink: 0,
            position: 'sticky',
            top: '20px',
            alignSelf: 'flex-start',
            maxHeight: '100vh',
            overflowY: 'auto'
          }}>
            <ShipmentSummary
              summary={summaryData}
              details={shipmentDetails}
              deliveryDetails={{
                deliveryRequirements: shipmentForm.deliveryRequirements || new Set<string>(),
                packingRequirements: shipmentForm.packingRequirements || '',
                accessAtDelivery: shipmentForm.accessAtDelivery || new Set<string>(),
                safetySecurityRequirements: shipmentForm.safetySecurityRequirements || new Set<string>(),
                conditionCheckRequirements: shipmentForm.conditionCheckRequirements || new Set<string>()
              }}
              clientReference={shipmentForm.clientReference}
              disabled={isSubmitDisabled}
              isSubmitting={saving}
              onSubmit={handleSubmit}
              onSaveDraft={handleSaveDraft}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateShipmentDetail;
