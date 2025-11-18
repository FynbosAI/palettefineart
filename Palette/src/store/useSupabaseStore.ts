import { create } from 'zustand';
import type { StoreApi } from 'zustand';
import type { RealtimePostgresChangesPayload, User } from '@supabase/supabase-js';
import { 
  supabase, 
  AuthService, 
  OrganizationService, 
  ShipmentService,
  QuoteService,
  LogisticsPartnerService,
  QuoteInviteService,
  type ShipmentWithDetails,
  type QuoteWithDetails,
  type BidWithPartner,
  type Database,
  type LogisticsPartnerBranchRecord,
  type QuoteInviteTarget
} from '../lib/supabase';
import { 
  EnhancedQuoteService,
  QuoteArtworkService,
  EnhancedBidService,
  AuditService,
  RealtimeService
} from '../lib/supabase/enhanced-services';
import { ChangeRequestService } from '../lib/supabase';
import { getDefaultArrivalDate, getTodayIsoDate } from '../lib/dateDefaults';
import type {
  QuoteArtwork,
  EnhancedQuote,
  EnhancedBid,
  AcceptBidParams,
  ConsolidateQuotesParams,
  QuoteWithCounts
} from '../types/database-enhanced';
import { DeliverySpecificsService } from '../lib/supabase/delivery-specifics';
import { loadState, saveState } from './middleware/persistence';
import logger from '../lib/utils/logger';
import type { SelectedShipperContext } from '../types';
import type { GalleryBidEvent } from '../types/realtime';
import { GalleryBidRefreshQueue } from './realtime/bidRefreshQueue';
import { fetchLatestCurrencyRates } from '../lib/api/currency';
import {
  clampSupportedCurrency,
  DEFAULT_CURRENCY_RATES,
  type CurrencyRates,
  type SupportedCurrency
} from '../lib/currency';
import {
  createProfileImageSignedUrl,
  uploadProfileImageForUser,
  shouldRefreshProfileImage,
} from '../../../shared/profile/profileImage';

// Helper function to add timeout to any promise
async function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, r) => setTimeout(() => r(new Error('Request timeout')), ms))
  ]);
}

const logRealtimeChannelStatus = (channelLabel: string, status: string) => {
  const message = `[${channelLabel}] channel status → ${status}`;
  switch (status) {
    case 'SUBSCRIBED':
      logger.success('Realtime', message);
      break;
    case 'CHANNEL_ERROR':
      logger.error('Realtime', message);
      break;
    case 'TIMED_OUT':
      logger.warn('Realtime', message);
      break;
    case 'CLOSED':
      logger.info('Realtime', message);
      break;
    default:
      logger.debug('Realtime', message);
  }
};

const monitorChannelSubscription = (channelLabel: string, channel: any, touchActivity: () => void) => {
  channel.subscribe((status: string) => {
    logRealtimeChannelStatus(channelLabel, status);
    if (status === 'SUBSCRIBED') {
      touchActivity();
    }
  });
};

const GALLERY_BIDS_CHANNEL_PREFIX = 'gallery_bids';
const GALLERY_BIDS_RETRY_BASE_MS = 1000;
const GALLERY_BIDS_RETRY_MAX_MS = 15000;
const GALLERY_BID_QUEUE_DELAY_MS = 600;

let galleryBidsRetryTimer: ReturnType<typeof setTimeout> | null = null;
let galleryBidsRetryAttempt = 0;
let galleryBidsManualTeardown = false;
let galleryBidRefreshQueue: GalleryBidRefreshQueue | null = null;

// Re-export types from database for convenience
type UserProfile = Database['public']['Tables']['profiles']['Row'];
type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type MembershipRow = Database['public']['Tables']['memberships']['Row'];
type BranchOrganization = OrganizationRow & {
  company_id?: string | null;
  company?: OrganizationRow | null;
};
type MembershipWithOrg = MembershipRow & {
  organization?: BranchOrganization | null;
  company?: OrganizationRow | null;
};

type RealtimeToast = {
  type: 'reconnecting' | 'reconnected';
  message: string;
};

// Enhanced Quote Form Data for new schema
interface QuoteFormData {
  title: string;
  type: 'requested' | 'auction';
  route: string | null;
  origin_id: string | null;
  destination_id: string | null;
  target_date: string | null;
  target_date_start: string | null;
  target_date_end: string | null;
  value: number | null;
  description: string | null;
  requirements: any | null;
  bidding_deadline: string | null;
  auto_close_bidding: boolean;
  delivery_specifics: any | null;
  notes: string | null;
  client_reference: string | null;
  origin_contact_name: string | null;
  origin_contact_phone: string | null;
  origin_contact_email: string | null;
  destination_contact_name: string | null;
  destination_contact_phone: string | null;
  destination_contact_email: string | null;
  artworks: Partial<QuoteArtwork>[];
}

// Form state types for managing multi-step workflows - matches types/index.ts exactly
interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: number;
  description: string;
  imageUrl: string;
  value: number;
  dimensions: string;
  medium: string;
  countryOfOrigin: string;
  currentCustomsStatus: string;
  isFragile?: boolean; // Added for Christie's requirements
  // Additional Christie's specific properties
  weight?: string;
  category?: string;
  itemType?: string;
  period?: string;
  weightValue?: number;
  weightUnit?: string;
  volumetricWeightValue?: number;
  volumetricWeightUnit?: string;
  hasExistingCrate?: boolean;
}

type LaeTransportMode = 'Air' | 'Sea' | 'Courier' | 'Road';
type LaeTransportSubtype = 'Dedicated' | 'Consolidated' | 'Shuttle';

interface ShipmentFormData {
  origin: string;
  destination: string;
  originContactName: string;
  originContactPhone: string;
  originContactEmail: string;
  destinationContactName: string;
  destinationContactPhone: string;
  destinationContactEmail: string;
  arrivalDate: string;
  targetDateStart?: string;
  targetDateEnd?: string;
  artworks: Artwork[];
  selectedShippers: Set<string>;
  selectedShipperContexts: Map<string, SelectedShipperContext>;
  insuranceRequired: boolean;
  specialRequirements?: string;
  packingRequirements?: string;
  deliveryRequirements: Set<string>;
  accessAtDelivery: Set<string>;
  safetySecurityRequirements: Set<string>;
  conditionCheckRequirements: Set<string>;
  notes?: string;
  title: string;           // NEW
  clientReference: string; // NEW
  biddingDeadline: string | null;
  autoCloseBidding: boolean;
  dimensionUnit: 'in' | 'cm';
  transportMode: LaeTransportMode | null;
  transportType: LaeTransportSubtype | null;
}

interface GeminiArtwork {
  id: string;
  artworkName: string;
  artistName: string;
  year: string;
  medium: string;
  dimensions: string;
  description: string;
  locationCreated: string;
  declaredValue: string;
  currentCustomsStatus: string;
  croppedImageUrl: string | null;
  crating: string;
  specialRequirements: {
    lightSensitive: boolean;
    temperatureSensitive: boolean;
    humiditySensitive: boolean;
  };
  imageBlob?: Blob | null;
  imageStorageUrl?: string | null;
  imageStoragePath?: string | null;
  imagePreviewUrl?: string | null;
  imagePreviewExpiresAt?: number | null;
}

interface UploadState {
  uploadedFiles: File[];
  isProcessing: boolean;
  processingComplete: boolean;
  extractedData: any[];
  overallProgress: number;
  shipmentData: {
    origin: string;
    destination: string;
    arrivalDate: string;
    title: string;           // NEW
    clientReference: string; // NEW
    originContactName: string;
    originContactPhone: string;
    originContactEmail: string;
    destinationContactName: string;
    destinationContactPhone: string;
    destinationContactEmail: string;
  };
}

// Optimistic updates management
interface OptimisticOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'quote' | 'shipment' | 'bid';
  data: any;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
}

interface OptimisticState {
  operations: Map<string, OptimisticOperation>;
  optimisticQuotes: Map<string, QuoteWithDetails>;
  optimisticShipments: Map<string, ShipmentWithDetails>;
}

interface SupabaseStore {
  // Auth state
  user: User | null;
  profile: UserProfile | null;
  profileImageUrl: string | null;
  profileImageUrlExpiresAt: number | null;
  profileImageRefreshing: boolean;
  profileImageUploading: boolean;
  currentOrg: BranchOrganization | null;
  memberships: MembershipWithOrg[];
  membershipsLoaded: boolean;
  currencyPreference: SupportedCurrency;
  currencyRates: CurrencyRates;
  currencyRatesLoading: boolean;
  currencyRatesError: string | null;
  
  // Data state
  shipments: ShipmentWithDetails[];
  selectedShipmentId: string | null;
  quotes: QuoteWithDetails[];
  selectedQuoteId: string | null;
  selectedQuoteDetails: QuoteWithDetails | null; // Cached details for selected quote
  // Unified selection for logistics page
  selectedItemId: string | null;
  selectedItemType: 'shipment' | 'estimate' | null;
  logisticsPartners: LogisticsPartnerBranchRecord[];
  loading: boolean;
  initialLoading: boolean;
  hasDashboardPreloaded: boolean;
  error: string | null;
  branchNetworkAuthError: string | null;
  // Change requests state
  currentChangeRequests: any[];
  
  // User role state
  userType: 'client' | 'partner' | null;

  // UI preferences
  uiPreferences: {
    paperTextureEnabled: boolean;
    paperTextureOpacity: number;
  };
  
  // Form state management
  forms: {
    shipment: ShipmentFormData;
    quote: QuoteFormData;
    geminiArtworkData: GeminiArtwork[] | null;
    uploadState: UploadState;
  };
  
  // Optimistic updates state
  optimistic: OptimisticState;
  
  // Real-time state
  realtime: {
    isConnected: boolean;
    subscriptions: Map<string, any>;
    lastActivity: Date | null;
    reconnecting: boolean;
    toast: RealtimeToast | null;
    nextRetryDelayMs: number | null;
  };
  
  // Auth actions
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  refreshProfileImageUrl: (options?: { force?: boolean }) => Promise<string | null>;
  uploadProfileImage: (file: File) => Promise<{ path: string; signedUrl: string | null }>;
  setCurrentOrg: (org: BranchOrganization | null) => void;
  updateCurrencyPreference: (currency: SupportedCurrency) => Promise<void>;
  fetchCurrencyRates: (force?: boolean) => Promise<void>;
  
  // Data actions
  fetchShipments: () => Promise<void>;
  fetchShipmentDetails: (id: string) => Promise<ShipmentWithDetails | null>;
  selectShipment: (id: string | null) => void;
  // Change requests actions
  fetchShipmentChangeRequests: (shipmentId: string) => Promise<void>;
  createChangeRequest: (
    shipmentId: string,
    type: 'scope' | 'withdrawal',
    params?: { proposedAmount?: number; proposedShipDate?: string; proposedDeliveryDate?: string; reason?: string }
  ) => Promise<void>;
  respondToChangeRequest: (requestId: string, action: 'approve' | 'decline') => Promise<void>;
  reopenQuote: (quoteId: string) => Promise<void>;
  fetchQuotes: () => Promise<void>;
  fetchQuoteDetails: (id: string, options?: { background?: boolean }) => Promise<QuoteWithDetails | null>;
  selectQuote: (id: string | null) => void;
  updateSelectedQuoteDetails: (quote: QuoteWithDetails | null) => void;
  clearSelectedQuote: () => void;
  // Unified selection action for logistics page
  selectUnifiedItem: (id: string | null, type: 'shipment' | 'estimate' | null) => void;
  fetchLogisticsPartners: () => Promise<void>;
  prefetchInitialData: () => Promise<void>;
  preloadDashboardData: (options?: { silent?: boolean }) => Promise<void>;
  
  // User role actions
  determineUserType: () => void;
  
  // Organization actions
  fetchUserMemberships: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
  
  // Form actions
  updateShipmentForm: (data: Partial<ShipmentFormData>) => void;
  setGeminiArtworkData: (data: GeminiArtwork[] | null) => void;
  updateGeminiArtworkImageUrl: (
    artworkId: string,
    payload:
      | string
      | {
          storageUrl?: string | null;
          storagePath?: string | null;
          previewUrl?: string | null;
          previewExpiresAt?: number | null;
        }
  ) => void;
  clearGeminiArtworkBlobs: () => void;
  updateUploadState: (data: Partial<UploadState>) => void;
  resetShipmentForm: () => void;
  resetUploadState: () => void;
  
  // Delivery specifics actions
  updateDeliveryRequirements: (requirements: Set<string>) => void;
  updatePackingRequirements: (requirement: string) => void;
  updateAccessRequirements: (requirements: Set<string>) => void;
  updateSafetySecurityRequirements: (requirements: Set<string>) => void;
  updateConditionCheckRequirements: (requirements: Set<string>) => void;
  saveDeliverySpecificsToQuote: (quoteId: string) => Promise<{ success: boolean; error?: any }>;
  
  // Quote CRUD operations with optimistic updates
  createQuote: (data: any) => Promise<{ data: any; error: any }>;
  createQuoteOptimistic: (data: any) => Promise<{ data: any; error: any }>;
  updateQuote: (id: string, data: any) => Promise<{ data: any; error: any }>;
  updateQuoteOptimistic: (id: string, data: any) => Promise<{ data: any; error: any }>;
  
  // Enhanced quote operations
  createQuoteWithArtworks: (quoteData: Partial<EnhancedQuote>, artworks: Partial<QuoteArtwork>[]) => Promise<{ data: any; error: any }>;
  addArtworksToQuote: (quoteId: string, artworks: Partial<QuoteArtwork>[]) => Promise<{ data: QuoteArtwork[]; error: any }>;
  updateQuoteArtwork: (artworkId: string, updates: Partial<QuoteArtwork>) => Promise<{ data: QuoteArtwork; error: any }>;
  deleteQuoteArtwork: (artworkId: string) => Promise<{ error: any }>;
  lockQuoteArtworks: (quoteId: string) => Promise<{ data: QuoteArtwork[]; error: any }>;
  fetchQuoteArtworks: (quoteId: string) => Promise<QuoteArtwork[]>;
  submitQuote: (quoteId: string) => Promise<{ error: any }>;
  acceptBid: (params: AcceptBidParams) => Promise<{ data: string; error: any }>;
  consolidateQuotes: (params: ConsolidateQuotesParams) => Promise<{ data: string; error: any }>;
  
  // Quote form actions
  updateQuoteForm: (data: Partial<QuoteFormData>) => void;
  resetQuoteForm: () => void;
  
  // Quote invite operations
  createQuoteInvites: (quoteId: string, targets: QuoteInviteTarget[]) => Promise<{ error: any }>;
  updateQuoteInvites: (quoteId: string, targets: QuoteInviteTarget[]) => Promise<{ error: any }>;
  
  // Bid operations
  upsertBid: (bidData: Partial<EnhancedBid>) => Promise<{ data: EnhancedBid; error: any }>;
  submitBid: (bidId: string) => Promise<{ data: EnhancedBid; error: any }>;
  getBidForQuote: (quoteId: string, logisticsPartnerId: string) => Promise<{ data: EnhancedBid | null; error: any }>;
  
  // Audit operations
  fetchQuoteAuditEvents: (quoteId: string, limit?: number) => Promise<{ data: any[]; error: any }>;
  fetchOrganizationAuditEvents: (organizationId: string, limit?: number) => Promise<{ data: any[]; error: any }>;
  
  // Optimistic update actions
  addOptimisticOperation: (operation: OptimisticOperation) => void;
  confirmOptimisticOperation: (operationId: string) => void;
  rollbackOptimisticOperation: (operationId: string) => void;
  clearFailedOperations: () => void;
  
  // Real-time actions
  initializeRealtime: () => void;
  subscribeToQuotes: () => void;
  subscribeToShipments: () => void;
  subscribeToGalleryBids: () => void;
  unsubscribeFromAll: () => void;

  // Utility actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setBranchNetworkAuthError: (message: string | null) => void;
  clearStore: () => void;
  clearRealtimeToast: () => void;
  clearForms: () => void;
  setPaperTextureEnabled: (enabled: boolean) => void;
  setPaperTextureOpacity: (opacity: number) => void;
}

const clearGalleryBidsRetryTimer = () => {
  if (galleryBidsRetryTimer) {
    clearTimeout(galleryBidsRetryTimer);
    galleryBidsRetryTimer = null;
  }
};

const scheduleGalleryBidsRetry = (
  set: StoreApi<SupabaseStore>['setState'],
  get: StoreApi<SupabaseStore>['getState'],
  reason: string
) => {
  if (galleryBidsManualTeardown) {
    logger.info('Realtime', `Gallery bid channel teardown (${reason}); skipping auto-retry`);
    return;
  }

  const orgId = get().currentOrg?.id;
  if (!orgId) {
    logger.debug('Realtime', 'No organization resolved for gallery bid retry; skipping');
    return;
  }

  const delay = Math.min(
    GALLERY_BIDS_RETRY_MAX_MS,
    GALLERY_BIDS_RETRY_BASE_MS * Math.pow(2, galleryBidsRetryAttempt)
  );
  galleryBidsRetryAttempt += 1;

  clearGalleryBidsRetryTimer();
  galleryBidsRetryTimer = setTimeout(() => {
    galleryBidsRetryTimer = null;
    get().subscribeToGalleryBids();
  }, delay);

  set((state) => ({
    realtime: {
      ...state.realtime,
      reconnecting: true,
      toast: {
        type: 'reconnecting',
        message: 'Realtime bid feed disconnected. Reconnecting…',
      },
      nextRetryDelayMs: delay,
    },
  }));
};

const queueQuoteRefresh = (quoteId: string | null | undefined) => {
  if (!quoteId || !galleryBidRefreshQueue) {
    return;
  }
  galleryBidRefreshQueue.enqueue(quoteId);
};

const handleGalleryBidPayload = (
  payload: RealtimePostgresChangesPayload<GalleryBidEvent>,
  currentOrgId: string | null
) => {
  if (!currentOrgId) {
    return;
  }

  const record = (payload.new ?? payload.old) as Partial<GalleryBidEvent> | null;
  if (!record) {
    return;
  }

  if (!record.gallery_org_id || record.gallery_org_id !== currentOrgId) {
    return;
  }

  queueQuoteRefresh(record.quote_id);
};

const useSupabaseStore = create<SupabaseStore>((set, get) => {
  // Load persisted state for selections on initialization
  const persistedState = loadState();
  
  return {
    // Initial state with persisted selections restored
    user: null,
    profile: null,
    profileImageUrl: null,
    profileImageUrlExpiresAt: null,
    profileImageRefreshing: false,
    profileImageUploading: false,
    currentOrg: null,
    memberships: [],
    membershipsLoaded: false,
    currencyPreference: 'USD',
    currencyRates: DEFAULT_CURRENCY_RATES,
    currencyRatesLoading: false,
    currencyRatesError: null,
    shipments: [],
    selectedShipmentId: persistedState.selectedShipmentId || null,
    quotes: [],
    selectedQuoteId: persistedState.selectedQuoteId || null,
    selectedQuoteDetails: null,
    // Unified selection for logistics page
    selectedItemId: persistedState.selectedItemId || null,
    selectedItemType: persistedState.selectedItemType || null,
    logisticsPartners: [],
    loading: false,
    initialLoading: true,
    hasDashboardPreloaded: false,
    error: null,
    branchNetworkAuthError: null,
    userType: null,
    uiPreferences: {
      paperTextureEnabled: persistedState.uiPreferences?.paperTextureEnabled ?? false,
      paperTextureOpacity:
        typeof persistedState.uiPreferences?.paperTextureOpacity === 'number'
          ? persistedState.uiPreferences.paperTextureOpacity
          : 0.24,
    },
    currentChangeRequests: [],

    // Form state management with persisted values
    forms: {
      shipment: (() => {
        const defaultShipment: ShipmentFormData = {
          origin: '',
          destination: '',
          originContactName: '',
          originContactPhone: '',
          originContactEmail: '',
          destinationContactName: '',
          destinationContactPhone: '',
          destinationContactEmail: '',
          arrivalDate: getDefaultArrivalDate(),
          transportMode: null,
          transportType: null,
          artworks: [],
          selectedShippers: new Set(),
          selectedShipperContexts: new Map(),
          insuranceRequired: false,
          deliveryRequirements: new Set(),
          accessAtDelivery: new Set(),
          safetySecurityRequirements: new Set(),
          conditionCheckRequirements: new Set(),
          notes: '',
          title: '',
          clientReference: '',
          biddingDeadline: null,
          autoCloseBidding: true,
          dimensionUnit: 'in',
        };

        const persistedShipment = persistedState.forms?.shipment as Partial<ShipmentFormData> | undefined;
        if (!persistedShipment) {
          return defaultShipment;
        }

        return {
          ...defaultShipment,
          ...persistedShipment,
          arrivalDate: (() => {
            if (typeof persistedShipment.arrivalDate !== 'string') {
              return defaultShipment.arrivalDate;
            }
            const cleaned = persistedShipment.arrivalDate.trim();
            if (cleaned === '') {
              return defaultShipment.arrivalDate;
            }
            if (cleaned <= getTodayIsoDate()) {
              return defaultShipment.arrivalDate;
            }
            return persistedShipment.arrivalDate;
          })(),
          selectedShippers: persistedShipment.selectedShippers instanceof Set
            ? persistedShipment.selectedShippers
            : defaultShipment.selectedShippers,
          selectedShipperContexts: persistedShipment.selectedShipperContexts instanceof Map
            ? persistedShipment.selectedShipperContexts
            : defaultShipment.selectedShipperContexts,
          deliveryRequirements: persistedShipment.deliveryRequirements instanceof Set
            ? persistedShipment.deliveryRequirements
            : defaultShipment.deliveryRequirements,
          accessAtDelivery: persistedShipment.accessAtDelivery instanceof Set
            ? persistedShipment.accessAtDelivery
            : defaultShipment.accessAtDelivery,
          safetySecurityRequirements: persistedShipment.safetySecurityRequirements instanceof Set
            ? persistedShipment.safetySecurityRequirements
            : defaultShipment.safetySecurityRequirements,
          conditionCheckRequirements: persistedShipment.conditionCheckRequirements instanceof Set
            ? persistedShipment.conditionCheckRequirements
            : defaultShipment.conditionCheckRequirements,
          autoCloseBidding: typeof persistedShipment.autoCloseBidding === 'boolean'
            ? persistedShipment.autoCloseBidding
            : defaultShipment.autoCloseBidding,
          biddingDeadline: persistedShipment.biddingDeadline ?? defaultShipment.biddingDeadline,
          dimensionUnit: persistedShipment.dimensionUnit === 'cm' ? 'cm' : defaultShipment.dimensionUnit,
          originContactName: persistedShipment.originContactName ?? defaultShipment.originContactName,
          originContactPhone: persistedShipment.originContactPhone ?? defaultShipment.originContactPhone,
          originContactEmail: persistedShipment.originContactEmail ?? defaultShipment.originContactEmail,
          destinationContactName: persistedShipment.destinationContactName ?? defaultShipment.destinationContactName,
          destinationContactPhone: persistedShipment.destinationContactPhone ?? defaultShipment.destinationContactPhone,
          destinationContactEmail: persistedShipment.destinationContactEmail ?? defaultShipment.destinationContactEmail,
          transportType: (() => {
            const value = persistedShipment.transportType;
            if (value === 'Dedicated' || value === 'Consolidated' || value === 'Shuttle') {
              return value;
            }
            return defaultShipment.transportType;
          })(),
        };
      })(),
      quote: (() => {
        const defaultQuote: QuoteFormData = {
          title: '',
          type: 'requested',
          route: null,
          origin_id: null,
          destination_id: null,
          target_date: null,
          target_date_start: null,
          target_date_end: null,
          value: null,
          description: null,
          requirements: null,
          bidding_deadline: null,
          auto_close_bidding: true,
          delivery_specifics: null,
          notes: null,
          client_reference: null,
          origin_contact_name: null,
          origin_contact_phone: null,
          origin_contact_email: null,
          destination_contact_name: null,
          destination_contact_phone: null,
          destination_contact_email: null,
          artworks: [],
        };

        const persistedQuote = persistedState.forms?.quote as Partial<QuoteFormData> | undefined;
        if (!persistedQuote) {
          return defaultQuote;
        }

        return {
          ...defaultQuote,
          ...persistedQuote,
          auto_close_bidding: typeof persistedQuote.auto_close_bidding === 'boolean'
            ? persistedQuote.auto_close_bidding
            : defaultQuote.auto_close_bidding,
          bidding_deadline: persistedQuote.bidding_deadline ?? defaultQuote.bidding_deadline,
        };
      })(),
      geminiArtworkData: persistedState.forms?.geminiArtworkData || null,
      uploadState: (() => {
        const defaultUploadState: UploadState = {
          uploadedFiles: [],
          isProcessing: false,
          processingComplete: false,
          extractedData: [],
          overallProgress: 0,
          shipmentData: {
            origin: '',
            destination: '',
            arrivalDate: getDefaultArrivalDate(),
            title: '',           // NEW
            clientReference: '', // NEW
            originContactName: '',
            originContactPhone: '',
            originContactEmail: '',
            destinationContactName: '',
            destinationContactPhone: '',
            destinationContactEmail: '',
          },
        };

        const persistedUploadState = persistedState.forms?.uploadState as Partial<UploadState> | undefined;
        if (!persistedUploadState) {
          return defaultUploadState;
        }

        const sanitizeArrival = () => {
          const rawValue = persistedUploadState.shipmentData?.arrivalDate;
          if (typeof rawValue !== 'string') return defaultUploadState.shipmentData.arrivalDate;
          const cleaned = rawValue.trim();
          if (cleaned === '') return defaultUploadState.shipmentData.arrivalDate;
          if (cleaned <= getTodayIsoDate()) return defaultUploadState.shipmentData.arrivalDate;
          return rawValue;
        };

        return {
          ...defaultUploadState,
          ...persistedUploadState,
          uploadedFiles: persistedUploadState.uploadedFiles ?? defaultUploadState.uploadedFiles,
          shipmentData: {
            ...defaultUploadState.shipmentData,
            ...(persistedUploadState.shipmentData ?? {}),
            arrivalDate: sanitizeArrival(),
          },
        };
      })(),
    },

    // Optimistic updates state
    optimistic: {
      operations: new Map(),
      optimisticQuotes: new Map(),
      optimisticShipments: new Map(),
    },

    // Real-time state
    realtime: {
      isConnected: false,
      subscriptions: new Map(),
      lastActivity: null,
      reconnecting: false,
      toast: null,
      nextRetryDelayMs: null,
    },

    // Auth actions
    setUser: (user) => set({ user }),
    setProfile: (profile) => {
      set((state) => ({
        profile,
        currencyPreference: profile?.preferred_currency
          ? clampSupportedCurrency(profile.preferred_currency)
          : state.currencyPreference,
        ...(profile?.profile_image_path
          ? {}
          : { profileImageUrl: null, profileImageUrlExpiresAt: null }),
      }));

      if (profile?.profile_image_path) {
        void get().refreshProfileImageUrl({ force: true });
      }
    },
    setCurrentOrg: (org) => {
      set({ currentOrg: org });
      // Determine user type when org changes
      get().determineUserType();
    },
    updateCurrencyPreference: async (currency) => {
      const target = clampSupportedCurrency(currency);
      const previous = get().currencyPreference;
      const user = get().user;
      const currentProfile = get().profile;

      set({ currencyPreference: target, error: null });

      if (!user) {
        return;
      }

      try {
        const { data, error } = await AuthService.updateProfile(user.id, {
          preferred_currency: target
        });

        if (error) {
          throw error;
        }

        set({
          profile: data as UserProfile,
          currencyPreference: target
        });
      } catch (err) {
        console.error('[useSupabaseStore] Failed to update currency preference', err);
        set({
          currencyPreference: currentProfile?.preferred_currency
            ? clampSupportedCurrency(currentProfile.preferred_currency)
            : previous,
          error: (err as Error).message || 'Failed to update currency preference'
        });
        throw err;
      }
    },
    fetchCurrencyRates: async (force = false) => {
      if (get().currencyRatesLoading) {
        return;
      }

      if (!force && get().currencyRates.fetchedAt) {
        const fetchedAt = new Date(get().currencyRates.fetchedAt ?? 0).getTime();
        const ttlMs = 10 * 60 * 1000;
        if (Date.now() - fetchedAt < ttlMs) {
          return;
        }
      }

      set({ currencyRatesLoading: true, currencyRatesError: null });

      try {
        const rates = await fetchLatestCurrencyRates();
        set({
          currencyRates: rates,
          currencyRatesLoading: false
        });
      } catch (err) {
        console.error('[useSupabaseStore] Failed to fetch currency rates', err);
        set({
          currencyRatesLoading: false,
          currencyRatesError: (err as Error).message || 'Unable to fetch currency rates'
        });
        throw err;
      }
    },
    refreshProfileImageUrl: async ({ force = false }: { force?: boolean } = {}) => {
      const profile = get().profile;
      if (!profile?.profile_image_path) {
        set({ profileImageUrl: null, profileImageUrlExpiresAt: null });
        return null;
      }

      const cachedUrl = get().profileImageUrl;
      const cachedExpiry = get().profileImageUrlExpiresAt;
      if (!force && cachedUrl && cachedExpiry && !shouldRefreshProfileImage(cachedExpiry)) {
        return cachedUrl;
      }

      set({ profileImageRefreshing: true });
      try {
        const { signedUrl, expiresAt } = await createProfileImageSignedUrl(
          supabase,
          profile.profile_image_path
        );
        set({
          profileImageUrl: signedUrl,
          profileImageUrlExpiresAt: expiresAt,
          profileImageRefreshing: false,
        });
        return signedUrl;
      } catch (error) {
        console.error('[useSupabaseStore] Failed to refresh profile image URL', error);
        set({ profileImageRefreshing: false });
        throw error;
      }
    },
    uploadProfileImage: async (file) => {
      const user = get().user;
      if (!user) {
        throw new Error('You must be signed in to update your profile photo.');
      }

      set({ profileImageUploading: true });
      try {
        const { path } = await uploadProfileImageForUser({
          client: supabase,
          userId: user.id,
          file,
        });

        const { data, error } = await AuthService.updateProfile(user.id, {
          profile_image_path: path,
        });

        if (error) {
          throw error;
        }

        if (data) {
          get().setProfile(data as UserProfile);
        }

        const { signedUrl, expiresAt } = await createProfileImageSignedUrl(supabase, path);
        set({
          profileImageUrl: signedUrl,
          profileImageUrlExpiresAt: expiresAt,
        });

        return { path, signedUrl };
      } catch (error) {
        console.error('[useSupabaseStore] Failed to upload profile image', error);
        throw error;
      } finally {
        set({ profileImageUploading: false });
      }
    },

  // Data actions
  fetchShipments: async () => {
    set({ loading: true, error: null });
    const { currentOrg } = get();

    if (!currentOrg?.id) {
      set({ loading: false, error: 'No organization selected' });
      return;
    }

    try {
      const { data: shipments, error } = await ShipmentService.getShipments(currentOrg.id);

      if (error) {
        throw error;
      }

      set({ shipments: shipments || [], loading: false });
    } catch (error) {
      console.error('Error fetching shipments:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  // Change Requests: fetch list for a shipment
  fetchShipmentChangeRequests: async (shipmentId: string) => {
    set({ loading: true, error: null });
    try {
      const service = new ChangeRequestService(supabase);
      const { data, error } = await service.getChangeRequests(shipmentId);
      if (error) throw error;
      set({ currentChangeRequests: data || [], loading: false });
    } catch (error) {
      console.error('Error fetching change requests:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  // Change Requests: create a new request (gallery-initiated)
  createChangeRequest: async (shipmentId, type, params = {}) => {
    set({ loading: true, error: null });
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const payload: any = {
        shipment_id: shipmentId,
        initiated_by: userId,
        change_type: type,
        status: 'pending',
      };
      if (type === 'scope') {
        payload.proposal = params.reason ? { reason: params.reason } : {};
        if (params.proposedAmount !== undefined) payload.proposed_amount = params.proposedAmount;
        if (params.proposedShipDate) payload.proposed_ship_date = params.proposedShipDate;
        if (params.proposedDeliveryDate) payload.proposed_delivery_date = params.proposedDeliveryDate;
      } else if (type === 'withdrawal') {
        payload.proposal = params.reason ? { reason: params.reason } : null;
      }
      const { error } = await supabase.from('shipment_change_requests').insert(payload);
      if (error) throw error;
      await get().fetchShipmentChangeRequests(shipmentId);
      set({ loading: false });
    } catch (error) {
      console.error('Error creating change request:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  // Change Requests: respond to an existing request
  respondToChangeRequest: async (requestId, action) => {
    set({ loading: true, error: null });
    try {
      if (action === 'approve') {
        const service = new ChangeRequestService(supabase);
        const { error } = await service.approveChangeRequest(requestId);
        if (error) throw error;
      } else if (action === 'decline') {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        const { error } = await supabase
          .from('shipment_change_requests')
          .update({
            status: 'declined',
            responded_by: userId,
            responded_at: new Date().toISOString(),
            response_notes: 'Declined by gallery'
          })
          .eq('id', requestId);
        if (error) throw error;
      }
      const currentShipmentId = get().selectedShipmentId;
      if (currentShipmentId) {
        await get().fetchShipmentChangeRequests(currentShipmentId);
        await get().fetchShipments();
      }
      set({ loading: false });
    } catch (error) {
      console.error('Error responding to change request:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  // Reopen a quote for bidding
  reopenQuote: async (quoteId: string) => {
    set({ loading: true, error: null });
    try {
      const updates: any = { 
        status: 'active', 
        updated_at: new Date().toISOString(),
        auto_close_bidding: true,
      };
      updates.bidding_deadline = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      const { error } = await supabase.from('quotes').update(updates).eq('id', quoteId);
      if (error) throw error;
      // Optional audit log
      await supabase.from('quote_audit_events').insert({
        quote_id: quoteId,
        event_type: 'reopened',
        event_data: {}
      });
      await get().fetchQuotes();
      set({ loading: false });
    } catch (error) {
      console.error('Error reopening quote:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  fetchShipmentDetails: async (id: string) => {
    set({ loading: true, error: null });
    const { currentOrg } = get();

    if (!currentOrg?.id) {
      set({ loading: false, error: 'No organization selected' });
      return null;
    }

    try {
      const { data: shipment, error } = await ShipmentService.getShipment(id, currentOrg.id);

      if (error) {
        throw error;
      }

      set({ loading: false });
      return shipment;
    } catch (error) {
      console.error('Error fetching shipment details:', error);
      set({ error: (error as Error).message, loading: false });
      return null;
    }
  },

  selectShipment: (id) => {
    set({ selectedShipmentId: id });
    // Auto-save selection to localStorage
    saveState({ selectedShipmentId: id });
  },

  // Quote actions
  fetchQuotes: async () => {
    set({ loading: true, error: null });
    const { currentOrg } = get();

    if (!currentOrg?.id) {
      set({ loading: false, error: 'No organization selected' });
      return;
    }

    try {
      const { data: quotes, error } = await QuoteService.getQuotes(currentOrg.id);

      if (error) {
        throw error;
      }

      set({ quotes: quotes || [], loading: false });
    } catch (error) {
      console.error('Error fetching quotes:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  fetchQuoteDetails: async (id: string, options?: { background?: boolean }) => {
    const isBackground = options?.background ?? false;
    if (!isBackground) {
      set({ loading: true, error: null });
    }
    const { currentOrg } = get();

    if (!currentOrg?.id) {
      if (!isBackground) {
        set({ loading: false, error: 'No organization selected' });
      }
      return null;
    }

    try {
      const { data: quote, error } = await QuoteService.getQuote(id, currentOrg.id);

      if (error) {
        throw error;
      }

      // Update the quotes array in the store with the refreshed quote data
      if (quote) {
        const { quotes, selectedQuoteId } = get();
        const updatedQuotes = quotes.map(q => q.id === id ? quote : q);
        set({ quotes: updatedQuotes });
        
        // If this is the selected quote, update the details
        if (selectedQuoteId === id) {
          set({ selectedQuoteDetails: quote });
        }
        
        console.log('🔄 Store: Updated quote in quotes array after fetchQuoteDetails');
      }

      if (!isBackground) {
        set({ loading: false });
      }
      return quote;
    } catch (error) {
      console.error('Error fetching quote details:', error);
      if (!isBackground) {
        set({ error: (error as Error).message, loading: false });
      } else {
        logger.error('Realtime', 'Background quote refresh failed', error);
      }
      return null;
    }
  },

  selectQuote: (id) => {
    set({ selectedQuoteId: id });
    // Auto-save selection to localStorage
    saveState({ selectedQuoteId: id });
    
    // Clear details if selecting null
    if (!id) {
      set({ selectedQuoteDetails: null });
    }
  },
  
  updateSelectedQuoteDetails: (quote) => {
    set({ selectedQuoteDetails: quote });
  },
  
  clearSelectedQuote: () => {
    set({ 
      selectedQuoteId: null,
      selectedQuoteDetails: null 
    });
    saveState({ selectedQuoteId: null });
  },

  // Unified selection for logistics page
  selectUnifiedItem: (id, type) => {
    set({ selectedItemId: id, selectedItemType: type });
    // Auto-save unified selection to localStorage
    saveState({ selectedItemId: id, selectedItemType: type });
  },

  fetchLogisticsPartners: async () => {
    set({ loading: true, error: null });
    
    try {
      const { data: partners, error, meta } = await LogisticsPartnerService.getLogisticsPartners();

      if (meta?.branchNetworkAuthError) {
        set({
          branchNetworkAuthError:
            meta.branchNetworkErrorMessage ||
            'Session expired. Please sign in again to refresh branch network filters.',
        });
      } else if (get().branchNetworkAuthError) {
        set({ branchNetworkAuthError: null });
      }

      if (error) {
        throw error;
      }

      set({ logisticsPartners: partners || [], loading: false });
    } catch (error) {
      console.error('Error fetching logistics partners:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  // Bulk prefetch all initial data needed for the app
  prefetchInitialData: async () => {
    const { currentOrg } = get();
    
    // Only prefetch if we have a current organization
    if (!currentOrg) {
      console.log('🔍 Store: Skipping prefetch - no current organization');
      set({ initialLoading: false });
      return;
    }

    const t0 = performance.now();
    console.log('⏱️  prefetch start');
    console.log('🔍 Store: Starting initial data prefetch...');
    set({ initialLoading: true, error: null });
    
    // Timeout detection
    setTimeout(() => {
      if (get().initialLoading)
        console.error('❗ prefetch still stuck after 10 s – investigate individual calls');
    }, 10_000);
    
    try {
      // Fetch all data in parallel for faster loading
      const results = await Promise.allSettled([
        ShipmentService.getShipments(currentOrg.id),
        QuoteService.getQuotes(currentOrg.id),
        LogisticsPartnerService.getLogisticsPartners()
      ]);

      // Process shipments result
      const shipmentsResult = results[0];
      if (shipmentsResult.status === 'fulfilled' && !shipmentsResult.value.error) {
        console.log('🔍 Store: Shipments prefetched successfully');
        set({ shipments: shipmentsResult.value.data || [] });
      } else {
        console.error('🔍 Store: Shipments prefetch failed:', 
          shipmentsResult.status === 'fulfilled' ? shipmentsResult.value.error : shipmentsResult.reason);
      }

      // Process quotes result
      const quotesResult = results[1];
      if (quotesResult.status === 'fulfilled' && !quotesResult.value.error) {
        console.log('🔍 Store: Quotes prefetched successfully');
        set({ quotes: quotesResult.value.data || [] });
      } else {
        console.error('🔍 Store: Quotes prefetch failed:', 
          quotesResult.status === 'fulfilled' ? quotesResult.value.error : quotesResult.reason);
      }

      // Process logistics partners result
      const partnersResult = results[2];
      if (partnersResult.status === 'fulfilled') {
        const { data, error, meta } = partnersResult.value;

        if (meta?.branchNetworkAuthError) {
          set({
            branchNetworkAuthError:
              meta.branchNetworkErrorMessage ||
              'Session expired. Please sign in again to refresh branch network filters.',
          });
        } else if (get().branchNetworkAuthError) {
          set({ branchNetworkAuthError: null });
        }

        if (!error) {
          console.log('🔍 Store: Logistics partners prefetched successfully');
          set({ logisticsPartners: data || [] });
        } else {
          console.error('🔍 Store: Logistics partners prefetch failed:', error);
        }
      } else {
        console.error('🔍 Store: Logistics partners prefetch failed:', partnersResult.reason);
      }

      console.log('🔍 Store: Initial data prefetch completed');
      console.log('⏱️  prefetch done in', (performance.now()-t0).toFixed(0),'ms');
    } catch (error) {
      console.error('🔍 Store: Unexpected error during prefetch:', error);
      set({ error: (error as Error).message });
    } finally {
      set({ initialLoading: false });
    }
  },

  // Preload all Dashboard data (shipments, quotes, logistics partners)
  preloadDashboardData: async (options: { silent?: boolean } = {}) => {
    const { currentOrg, hasDashboardPreloaded } = get();
    
    // Only preload if we have a current organization
    if (!currentOrg) {
      console.log('🔍 Store: Skipping Dashboard preload - no current organization');
      set({ initialLoading: false });
      return;
    }

    if (hasDashboardPreloaded) {
      console.log('🔍 Store: Dashboard data already preloaded, skipping');
      return;
    }

    const t0 = performance.now();
    console.log('🔍 Store: Starting Dashboard data preload...');
    if (!options.silent) {
      set({ initialLoading: true, error: null });
    } else {
      set({ error: null });
    }
    
    try {
      // Fetch all Dashboard data in parallel
      const results = await Promise.allSettled([
        ShipmentService.getShipments(currentOrg.id),
        QuoteService.getQuotes(currentOrg.id),
        LogisticsPartnerService.getLogisticsPartners()
      ]);

      // Process shipments result
      const shipmentsResult = results[0];
      if (shipmentsResult.status === 'fulfilled' && !shipmentsResult.value.error) {
        console.log('🔍 Store: Dashboard shipments loaded successfully');
        set({ shipments: shipmentsResult.value.data || [] });
      } else {
        console.error('🔍 Store: Dashboard shipments load failed:', 
          shipmentsResult.status === 'fulfilled' ? shipmentsResult.value.error : shipmentsResult.reason);
      }

      // Process quotes result
      const quotesResult = results[1];
      if (quotesResult.status === 'fulfilled' && !quotesResult.value.error) {
        console.log('🔍 Store: Dashboard quotes loaded successfully');
        set({ quotes: quotesResult.value.data || [] });
      } else {
        console.error('🔍 Store: Dashboard quotes load failed:', 
          quotesResult.status === 'fulfilled' ? quotesResult.value.error : quotesResult.reason);
      }

      // Process logistics partners result
      const partnersResult = results[2];
      if (partnersResult.status === 'fulfilled') {
        const { data, error, meta } = partnersResult.value;

        if (meta?.branchNetworkAuthError) {
          set({
            branchNetworkAuthError:
              meta.branchNetworkErrorMessage ||
              'Session expired. Please sign in again to refresh branch network filters.',
          });
        } else if (get().branchNetworkAuthError) {
          set({ branchNetworkAuthError: null });
        }

        if (!error) {
          console.log('🔍 Store: Dashboard logistics partners loaded successfully');
          set({ logisticsPartners: data || [] });
        } else {
          console.error('🔍 Store: Dashboard logistics partners load failed:', error);
        }
      } else {
        console.error('🔍 Store: Dashboard logistics partners load failed:', partnersResult.reason);
      }

      logger.success('Store', 'Dashboard data preload completed');
      logger.perf('Store', 'Dashboard preload', Number((performance.now()-t0).toFixed(0)));
    } catch (error) {
      console.error('🔍 Store: Unexpected error during Dashboard preload:', error);
      set({ error: (error as Error).message });
    } finally {
      set((prev) => ({
        initialLoading: options.silent ? prev.initialLoading : false,
        hasDashboardPreloaded: true,
      }));
    }
  },

  // Organization actions
  fetchUserMemberships: async () => {
    const { user } = get();
    console.log('🔍 Store: fetchUserMemberships called with user:', user ? 'User exists' : 'No user');
    set({ membershipsLoaded: false });

    if (!user) {
      console.log('🔍 Store: No user found, returning early');
      set({ memberships: [], membershipsLoaded: true });
      return;
    }

    try {
      logger.debug('Store', 'Fetching memberships for user');
      const { data: memberships, error, status } = await withTimeout(
        OrganizationService.getUserMemberships(user.id),
        10000
      ) as any;

      if (status === 401 || status === 403) {
        console.error('🔒 RLS blocked memberships – forcing sign-out');
        await supabase.auth.signOut({ scope: 'global' as any });
        set({ membershipsLoaded: true });
        return;
      }

      if (error) {
        console.error('🔍 Store: Membership fetch error:', error);
        throw error;
      }

      logger.debug('Store', `Memberships fetched: ${memberships?.length || 0} memberships`);

      const normalizedMemberships: MembershipWithOrg[] = (memberships || []).map((membership: any) => {
        const branch = membership.organization as OrganizationRow | null;
        const company = membership.company as OrganizationRow | null;
        const sanitizedCompany = company
          ? {
              ...company,
              company: null,
              company_id: null,
            }
          : null;
        const branchWithCompany = branch
          ? {
              ...branch,
              company_id: membership.company_id ?? branch.parent_org_id,
              company: sanitizedCompany,
            }
          : null;

        return {
          ...membership,
          organization: branchWithCompany,
          company: sanitizedCompany,
        } as MembershipWithOrg;
      });

      set({ memberships: normalizedMemberships, membershipsLoaded: true });

      const assignCurrentOrg = (membership: MembershipWithOrg | undefined) => {
        if (membership?.organization) {
          set({ currentOrg: membership.organization });
          get().determineUserType();
        }
      };

      // Set current org if user has a default
      const { profile } = get();
      logger.debug('Store', 'Current profile loaded');

      if (profile?.default_org) {
        logger.debug('Store', 'Looking for default org in memberships');
        const defaultMembership = normalizedMemberships.find(m => m.org_id === profile.default_org);
        logger.debug('Store', defaultMembership ? 'Default org found' : 'Default org not found');
        assignCurrentOrg(defaultMembership);
      } else {
        console.log('🔍 Store: No default org in profile');
      }

      if (!get().currentOrg && normalizedMemberships.length > 0) {
        console.log('🔍 Store: No current org set – using first available membership as default');
        assignCurrentOrg(normalizedMemberships[0]);
      }
    } catch (error) {
      console.error('🔍 Store: Error fetching memberships:', error);
      set({ error: (error as Error).message, membershipsLoaded: true });
    }
  },

  switchOrganization: async (orgId: string) => {
    const { user } = get();
    if (!user) return;

    try {
      const { error } = await OrganizationService.switchDefaultOrganization(orgId);

      if (error) {
        throw error;
      }

      // Update local state
      const { memberships } = get();
      const org = memberships.find(m => m.org_id === orgId);
      if (org?.organization) {
        set({ 
          currentOrg: org.organization,
          profile: { ...get().profile!, default_org: orgId }
        });
        
        // Refresh shipments for new org
        get().fetchShipments();
      }
    } catch (error) {
      console.error('Error switching organization:', error);
      set({ error: (error as Error).message });
    }
  },

  // Form actions
  updateShipmentForm: (data: Partial<ShipmentFormData>) => set(state => {
    if (typeof window !== 'undefined') {
      const interestingKeys: Array<keyof ShipmentFormData> = [
        'arrivalDate',
        'targetDateStart',
        'targetDateEnd',
        'biddingDeadline',
      ];
      const payload: Record<string, { previous: string | null; next: unknown }> = {};
      interestingKeys.forEach(key => {
        if (key in data) {
          const previousValue = (state.forms.shipment as any)[key] ?? null;
          payload[key] = {
            previous: typeof previousValue === 'string' ? previousValue : previousValue ?? null,
            next: (data as any)[key],
          };
        }
      });
      if (Object.keys(payload).length > 0) {
        console.log('[SHIPMENT_DEBUG] updateShipmentForm called with date-related fields', payload);
        console.trace('[SHIPMENT_DEBUG] updateShipmentForm stack trace');
      }
    }

    return {
      forms: {
        ...state.forms,
        shipment: {
          ...state.forms.shipment,
          ...data,
        },
      },
    };
  }),
  setGeminiArtworkData: (data: GeminiArtwork[] | null) => set(state => ({
    forms: {
      ...state.forms,
      geminiArtworkData: data,
    },
  })),
  updateGeminiArtworkImageUrl: (artworkId, payload) => set(state => {
    const normalized = typeof payload === 'string'
      ? { storageUrl: payload }
      : payload || {};

    return {
      forms: {
        ...state.forms,
        geminiArtworkData:
          state.forms.geminiArtworkData?.map(artwork => {
            if (artwork.id !== artworkId) {
              return artwork;
            }

            return {
              ...artwork,
              imageStorageUrl:
                normalized.storageUrl !== undefined
                  ? normalized.storageUrl
                  : artwork.imageStorageUrl ?? null,
              imageStoragePath:
                normalized.storagePath !== undefined
                  ? normalized.storagePath
                  : artwork.imageStoragePath ?? null,
              imagePreviewUrl:
                normalized.previewUrl !== undefined
                  ? normalized.previewUrl
                  : artwork.imagePreviewUrl ?? artwork.croppedImageUrl ?? null,
              imagePreviewExpiresAt:
                normalized.previewExpiresAt !== undefined
                  ? normalized.previewExpiresAt
                  : artwork.imagePreviewExpiresAt ?? null,
              imageBlob: undefined,
            };
          }) || null,
      },
    };
  }),
  clearGeminiArtworkBlobs: () => set(state => ({
    forms: {
      ...state.forms,
      geminiArtworkData: state.forms.geminiArtworkData?.map(artwork => ({
        ...artwork,
        imageBlob: undefined
      })) || null,
    },
  })),
  updateUploadState: (data: Partial<UploadState>) => set(state => ({
    forms: {
      ...state.forms,
      uploadState: {
        ...state.forms.uploadState,
        ...data,
      },
    },
  })),
  resetShipmentForm: () => set(state => ({
    forms: {
      ...state.forms,
      shipment: {
        origin: '',
        destination: '',
        originContactName: '',
        originContactPhone: '',
        originContactEmail: '',
        destinationContactName: '',
        destinationContactPhone: '',
        destinationContactEmail: '',
        arrivalDate: getDefaultArrivalDate(),
        transportMode: null,
        transportType: null,
        artworks: [],
        selectedShippers: new Set(),
        selectedShipperContexts: new Map(),
        insuranceRequired: false,
        deliveryRequirements: new Set(),
        accessAtDelivery: new Set(),
        safetySecurityRequirements: new Set(),
        conditionCheckRequirements: new Set(),
        notes: '',              // ADDED missing notes field
        title: '',              // NEW
        clientReference: '',    // NEW
        biddingDeadline: null,
        autoCloseBidding: true,
        dimensionUnit: 'in',
      },
    },
  })),
  resetUploadState: () => set(state => ({
    forms: {
      ...state.forms,
      uploadState: {
        uploadedFiles: [],
        isProcessing: false,
        processingComplete: false,
        extractedData: [],
        overallProgress: 0,
        shipmentData: {
          origin: '',
          destination: '',
          arrivalDate: getDefaultArrivalDate(),
          title: '',           // NEW
          clientReference: '', // NEW
          originContactName: '',
          originContactPhone: '',
          originContactEmail: '',
          destinationContactName: '',
          destinationContactPhone: '',
          destinationContactEmail: '',
        },
      },
    },
  })),

  // Delivery specifics actions
  updateDeliveryRequirements: (requirements: Set<string>) => set(state => ({
    forms: {
      ...state.forms,
      shipment: {
        ...state.forms.shipment,
        deliveryRequirements: requirements,
      },
    },
  })),
  updatePackingRequirements: (requirement: string) => set(state => ({
    forms: {
      ...state.forms,
      shipment: {
        ...state.forms.shipment,
        packingRequirements: requirement,
      },
    },
  })),
  updateAccessRequirements: (requirements: Set<string>) => set(state => ({
    forms: {
      ...state.forms,
      shipment: {
        ...state.forms.shipment,
        accessAtDelivery: requirements,
      },
    },
  })),
  updateSafetySecurityRequirements: (requirements: Set<string>) => set(state => ({
    forms: {
      ...state.forms,
      shipment: {
        ...state.forms.shipment,
        safetySecurityRequirements: requirements,
      },
    },
  })),
  updateConditionCheckRequirements: (requirements: Set<string>) => set(state => ({
    forms: {
      ...state.forms,
      shipment: {
        ...state.forms.shipment,
        conditionCheckRequirements: requirements,
      },
    },
  })),
  saveDeliverySpecificsToQuote: async (quoteId: string) => {
    const { forms } = get();
    const { deliveryRequirements, packingRequirements, accessAtDelivery, safetySecurityRequirements, conditionCheckRequirements } = forms.shipment;

    try {
      const deliverySpecifics = DeliverySpecificsService.convertSetsToArrays({
        deliveryRequirements,
        packingRequirements,
        accessAtDelivery,
        safetySecurityRequirements,
        conditionCheckRequirements
      });

      const data = await DeliverySpecificsService.saveToQuote(quoteId, deliverySpecifics);

      return { success: true, data };
    } catch (error) {
      console.error('💾 Error saving delivery specifics to quote:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  // Quote CRUD operations with optimistic updates
  createQuote: async (data: any) => {
    set({ loading: true, error: null });
    try {
      const { data: createdQuote, error } = await QuoteService.createQuote(data);
      if (error) {
        throw error;
      }
      
      // Save delivery specifics to the newly created quote
      if (createdQuote?.id) {
        console.log('💾 Auto-saving delivery specifics to newly created quote:', createdQuote.id);
        const deliveryResult = await get().saveDeliverySpecificsToQuote(createdQuote.id);
        if (!deliveryResult.success) {
          console.warn('⚠️ Failed to save delivery specifics (non-critical):', deliveryResult.error);
          // Don't fail the whole quote creation if delivery specifics fail
        } else {
          console.log('✅ Delivery specifics auto-saved to quote');
        }
      }
      
      // Refresh the quotes list to include the new quote
      await get().fetchQuotes();
      
      set({ loading: false });
      return { data: createdQuote, error: null };
    } catch (error) {
      console.error('Error creating quote:', error);
      set({ error: (error as Error).message, loading: false });
      return { data: null, error: (error as Error).message };
    }
  },
  createQuoteOptimistic: async (data: any) => {
    // Simplified optimistic implementation
    return get().createQuote(data);
  },
  updateQuote: async (id: string, data: any) => {
    set({ loading: true, error: null });
    try {
      const { data: updatedQuote, error } = await QuoteService.updateQuote(id, data);
      if (error) {
        throw error;
      }
      set({ loading: false });
      return { data: updatedQuote, error: null };
    } catch (error) {
      console.error('Error updating quote:', error);
      set({ error: (error as Error).message, loading: false });
      return { data: null, error: (error as Error).message };
    }
  },
  updateQuoteOptimistic: async (id: string, data: any) => {
    // Simplified optimistic implementation
    return get().updateQuote(id, data);
  },

  // Quote invite operations
  createQuoteInvites: async (quoteId: string, targets: QuoteInviteTarget[]) => {
    try {
      const { error } = await QuoteInviteService.createQuoteInvites(quoteId, targets);
      return { error };
    } catch (error) {
      console.error('Error creating quote invites:', error);
      return { error: (error as Error).message };
    }
  },
  updateQuoteInvites: async (quoteId: string, targets: QuoteInviteTarget[]) => {
    try {
      const { error } = await QuoteInviteService.updateQuoteInvites(quoteId, targets);
      return { error };
    } catch (error) {
      console.error('Error updating quote invites:', error);
      return { error: (error as Error).message };
    }
  },
  
  // Enhanced quote operations
  createQuoteWithArtworks: async (quoteData: Partial<EnhancedQuote>, artworks: Partial<QuoteArtwork>[]) => {
    set({ loading: true, error: null });
    try {
      const service = new EnhancedQuoteService(supabase);
      const quote = await service.createQuoteWithArtworks(quoteData, artworks);
      
      // Refresh quotes list
      await get().fetchQuotes();
      
      set({ loading: false });
      return { data: quote, error: null };
    } catch (error) {
      console.error('Error creating quote with artworks:', error);
      set({ error: (error as Error).message, loading: false });
      return { data: null, error: (error as Error).message };
    }
  },
  
  addArtworksToQuote: async (quoteId: string, artworks: Partial<QuoteArtwork>[]) => {
    try {
      const service = new QuoteArtworkService(supabase);
      const data = await service.createQuoteArtworks(quoteId, artworks);
      return { data, error: null };
    } catch (error) {
      console.error('Error adding artworks to quote:', error);
      return { data: [], error: (error as Error).message };
    }
  },
  
  updateQuoteArtwork: async (artworkId: string, updates: Partial<QuoteArtwork>) => {
    try {
      const service = new QuoteArtworkService(supabase);
      const data = await service.updateQuoteArtwork(artworkId, updates);
      return { data, error: null };
    } catch (error) {
      console.error('Error updating quote artwork:', error);
      return { data: null as any, error: (error as Error).message };
    }
  },
  
  deleteQuoteArtwork: async (artworkId: string) => {
    try {
      const service = new QuoteArtworkService(supabase);
      await service.deleteQuoteArtwork(artworkId);
      return { error: null };
    } catch (error) {
      console.error('Error deleting quote artwork:', error);
      return { error: (error as Error).message };
    }
  },
  
  lockQuoteArtworks: async (quoteId: string) => {
    try {
      const service = new QuoteArtworkService(supabase);
      const data = await service.lockQuoteArtworks(quoteId);
      return { data, error: null };
    } catch (error) {
      console.error('Error locking quote artworks:', error);
      return { data: [], error: (error as Error).message };
    }
  },
  
  fetchQuoteArtworks: async (quoteId: string) => {
    try {
      const service = new QuoteArtworkService(supabase);
      const data = await service.getQuoteArtworks(quoteId);
      return data;
    } catch (error) {
      console.error('Error fetching quote artworks:', error);
      return [];
    }
  },
  
  submitQuote: async (quoteId: string) => {
    try {
      const service = new EnhancedQuoteService(supabase);
      await service.submitQuote(quoteId);
      
      // Refresh quote details
      await get().fetchQuoteDetails(quoteId);
      
      return { error: null };
    } catch (error) {
      console.error('Error submitting quote:', error);
      return { error: (error as Error).message };
    }
  },
  
  acceptBid: async (params: AcceptBidParams) => {
    if (!params.p_branch_org_id) {
      const error = 'Branch scope missing for bid acceptance';
      console.error(error, params);
      return { data: '', error };
    }

    set({ loading: true, error: null });
    try {
      const service = new EnhancedQuoteService(supabase);
      const shipmentId = await service.acceptBid(params);
      
      // Refresh quotes and shipments
      await Promise.all([
        get().fetchQuotes(),
        get().fetchShipments()
      ]);
      
      set({ loading: false });
      return { data: shipmentId, error: null as any };
    } catch (error) {
      console.error('Error accepting bid:', error);
      set({ error: (error as Error).message, loading: false });
      return { data: '', error: (error as Error).message };
    }
  },
  
  consolidateQuotes: async (params: ConsolidateQuotesParams) => {
    set({ loading: true, error: null });
    try {
      const service = new EnhancedQuoteService(supabase);
      const shipmentId = await service.consolidateQuotes(params);
      
      // Refresh quotes and shipments
      await Promise.all([
        get().fetchQuotes(),
        get().fetchShipments()
      ]);
      
      set({ loading: false });
      return { data: shipmentId, error: null as any };
    } catch (error) {
      console.error('Error consolidating quotes:', error);
      set({ error: (error as Error).message, loading: false });
      return { data: '', error: (error as Error).message };
    }
  },
  
  // Quote form actions
  updateQuoteForm: (data: Partial<QuoteFormData>) => set(state => ({
    forms: {
      ...state.forms,
      quote: {
        ...state.forms.quote,
        ...data,
      },
    },
  })),
  
  resetQuoteForm: () => set(state => ({
    forms: {
      ...state.forms,
      quote: {
        title: '',
        type: 'requested',
        route: null,
        origin_id: null,
        destination_id: null,
        target_date: null,
        target_date_start: null,
        target_date_end: null,
        value: null,
        description: null,
        requirements: null,
        bidding_deadline: null,
        auto_close_bidding: true,
        delivery_specifics: null,
        notes: null,
        client_reference: null,
        artworks: [],
      },
    },
  })),
  
  // Bid operations
  upsertBid: async (bidData: Partial<EnhancedBid>) => {
    try {
      const service = new EnhancedBidService(supabase);
      const data = await service.upsertBid(bidData);
      return { data, error: null };
    } catch (error) {
      console.error('Error upserting bid:', error);
      return { data: null as any, error: (error as Error).message };
    }
  },
  
  submitBid: async (bidId: string) => {
    try {
      const service = new EnhancedBidService(supabase);
      const data = await service.submitBid(bidId);
      return { data, error: null };
    } catch (error) {
      console.error('Error submitting bid:', error);
      return { data: null as any, error: (error as Error).message };
    }
  },
  
  getBidForQuote: async (quoteId: string, logisticsPartnerId: string) => {
    try {
      const service = new EnhancedBidService(supabase);
      const data = await service.getBidForQuote(quoteId, logisticsPartnerId);
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching bid for quote:', error);
      return { data: null, error: (error as Error).message };
    }
  },
  
  // Audit operations
  fetchQuoteAuditEvents: async (quoteId: string, limit = 50) => {
    try {
      const service = new AuditService(supabase);
      const data = await service.getQuoteAuditEvents(quoteId, limit);
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching quote audit events:', error);
      return { data: [], error: (error as Error).message };
    }
  },
  
  fetchOrganizationAuditEvents: async (organizationId: string, limit = 100) => {
    try {
      const service = new AuditService(supabase);
      const data = await service.getOrganizationAuditEvents(organizationId, limit);
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching organization audit events:', error);
      return { data: [], error: (error as Error).message };
    }
  },
  
  // User role actions
  determineUserType: () => {
    const { currentOrg } = get();
    if (!currentOrg) {
      set({ userType: null });
      return;
    }
    
    // Check if organization has type field (from enhanced schema)
    const orgType = (currentOrg as any).type;
    if (orgType === 'partner') {
      set({ userType: 'partner' });
    } else {
      // Default to client if type is 'client' or undefined
      set({ userType: 'client' });
    }
  },
  
  // Optimistic update actions (simplified implementations)
  addOptimisticOperation: (operation: OptimisticOperation) => {
    set(state => ({
      optimistic: {
        ...state.optimistic,
        operations: new Map(state.optimistic.operations).set(operation.id, operation),
      },
    }));
  },
  confirmOptimisticOperation: (operationId: string) => {
    set(state => {
      const newOperations = new Map(state.optimistic.operations);
      const operation = newOperations.get(operationId);
      if (operation) {
        newOperations.set(operationId, { ...operation, status: 'confirmed' });
      }
      return {
        optimistic: {
          ...state.optimistic,
          operations: newOperations,
        },
      };
    });
  },
  rollbackOptimisticOperation: (operationId: string) => {
    set(state => {
      const newOperations = new Map(state.optimistic.operations);
      const operation = newOperations.get(operationId);
      if (operation) {
        newOperations.set(operationId, { ...operation, status: 'failed' });
      }
      return {
        optimistic: {
          ...state.optimistic,
          operations: newOperations,
        },
      };
    });
  },
  clearFailedOperations: () => {
    set(state => {
      const filteredOperations = new Map();
      state.optimistic.operations.forEach((op: OptimisticOperation, id: string) => {
        if (op.status !== 'failed') {
          filteredOperations.set(id, op);
        }
      });
      return {
        optimistic: {
          ...state.optimistic,
          operations: filteredOperations,
        },
      };
    });
  },

  // Real-time actions
  initializeRealtime: () => {
    const { realtime } = get();
    if (realtime.isConnected) {
      console.log('Realtime already initialized.');
      return;
    }

    console.log('Initializing Supabase realtime...');
    
    // Subscribe to auth state changes
    supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_IN') {
        set({ user: session?.user });
        set({ profile: session?.user?.user_metadata as UserProfile });
        get().fetchUserMemberships();
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null, currentOrg: null, memberships: [], membershipsLoaded: false });
        set({ initialLoading: true });
        get().clearStore();
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          set({ user: session.user });
        }
        if (get().branchNetworkAuthError) {
          set({ branchNetworkAuthError: null });
        }
      }
    });

    set(state => ({
      realtime: { 
        ...state.realtime, 
        isConnected: true,
        lastActivity: new Date()
      }
    }));
    console.log('Supabase realtime initialized.');
  },

  subscribeToQuotes: () => {
    const { realtime, currentOrg } = get();
    if (!realtime.isConnected || !currentOrg) {
      console.warn('Realtime not initialized or no current organization for quote subscription.');
      return;
    }

    const channel = supabase.channel('quotes');
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'quotes',
      filter: `owner_org_id=eq.${currentOrg.id}`,
    }, (payload: any) => {
      console.log('🔄 Supabase realtime: Quotes updated', payload);
      get().fetchQuotes();
    });
    const touchActivity = () => {
      set(state => ({
        realtime: {
          ...state.realtime,
          lastActivity: new Date(),
        }
      }));
    };
    monitorChannelSubscription('quotes', channel, touchActivity);
    
    set(state => ({
      realtime: {
        ...state.realtime,
        subscriptions: new Map(state.realtime.subscriptions).set('quotes', channel),
        lastActivity: new Date(),
      }
    }));
    console.log('Subscribed to quotes.');
  },

  subscribeToShipments: () => {
    const { realtime, currentOrg } = get();
    if (!realtime.isConnected || !currentOrg) {
      console.warn('Realtime not initialized or no current organization for shipment subscription.');
      return;
    }

    const channel = supabase.channel('shipments');
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'shipments',
      filter: `owner_org_id=eq.${currentOrg.id}`,
    }, (payload: any) => {
      console.log('🔄 Supabase realtime: Shipments updated', payload);
      get().fetchShipments();
    });
    const touchActivity = () => {
      set(state => ({
        realtime: {
          ...state.realtime,
          lastActivity: new Date(),
        }
      }));
    };
    monitorChannelSubscription('shipments', channel, touchActivity);
    
    set(state => ({
      realtime: {
        ...state.realtime,
        subscriptions: new Map(state.realtime.subscriptions).set('shipments', channel),
        lastActivity: new Date(),
      }
    }));
    console.log('Subscribed to shipments.');
  },

  subscribeToGalleryBids: () => {
    const { realtime, currentOrg } = get();
    if (!realtime.isConnected || !currentOrg) {
      console.warn('Realtime not initialized or no current organization for bid subscription.');
      return;
    }

    const channelKey = `${GALLERY_BIDS_CHANNEL_PREFIX}:${currentOrg.id}`;
    const existing = realtime.subscriptions.get(channelKey);
    if (existing) {
      try {
        existing.unsubscribe?.();
      } catch (error) {
        logger.error('Realtime', `Failed to unsubscribe existing gallery bid channel ${channelKey}`, error);
      }
    }

    clearGalleryBidsRetryTimer();
    galleryBidsRetryAttempt = 0;

    const channel = supabase.channel(channelKey);
    const touchActivity = () => {
      set(state => ({
        realtime: {
          ...state.realtime,
          lastActivity: new Date(),
        }
      }));
    };

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'bids',
      filter: `gallery_org_id=eq.${currentOrg.id}`,
    }, (payload: RealtimePostgresChangesPayload<GalleryBidEvent>) => {
      handleGalleryBidPayload(payload, currentOrg.id);
      touchActivity();
    });

    channel.subscribe((status: string) => {
      logRealtimeChannelStatus(channelKey, status);
      if (status === 'SUBSCRIBED') {
        clearGalleryBidsRetryTimer();
        galleryBidsRetryAttempt = 0;
        touchActivity();
        set(state => ({
          realtime: {
            ...state.realtime,
            reconnecting: false,
            nextRetryDelayMs: null,
            toast:
              state.realtime.toast?.type === 'reconnecting'
                ? { type: 'reconnected', message: 'Realtime bid feed reconnected' }
                : state.realtime.toast,
          },
        }));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        scheduleGalleryBidsRetry(set, get, status);
      }
    });

    set(state => ({
      realtime: {
        ...state.realtime,
        subscriptions: new Map(state.realtime.subscriptions).set(channelKey, channel),
      }
    }));
    console.log(`Subscribed to gallery bid feed for org ${currentOrg.id}.`);
  },

  unsubscribeFromAll: () => {
    const { realtime } = get();
    galleryBidsManualTeardown = true;
    clearGalleryBidsRetryTimer();
    galleryBidRefreshQueue?.clear();
    galleryBidsRetryAttempt = 0;
    realtime.subscriptions.forEach((channel, key) => {
      const label = channel?.topic || key;
      logger.debug('Realtime', `Unsubscribing from ${label}`);
      try {
        const result = channel.unsubscribe?.();
        if (result && typeof result.then === 'function') {
          result
            .then(() => logger.info('Realtime', `[${label}] channel unsubscribed`))
            .catch(error => logger.error('Realtime', `[${label}] channel unsubscribe failed`, error));
        } else {
          logger.info('Realtime', `[${label}] channel unsubscribed`);
        }
      } catch (error) {
        logger.error('Realtime', `[${label}] channel threw during unsubscribe`, error);
      }
    });
    
    set(state => ({
      realtime: {
        ...state.realtime,
        subscriptions: new Map(),
        reconnecting: false,
        toast: null,
        nextRetryDelayMs: null,
      }
    }));
    galleryBidsManualTeardown = false;
    logger.info('Realtime', 'All channels unsubscribed and registry cleared');
  },

  // Utility actions
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setBranchNetworkAuthError: (message) => set({ branchNetworkAuthError: message }),
  setPaperTextureEnabled: (enabled) =>
    set((state) => {
      const uiPreferences = {
        ...state.uiPreferences,
        paperTextureEnabled: enabled,
      };
      saveState({ uiPreferences });
      return { uiPreferences };
    }),
  setPaperTextureOpacity: (opacity) =>
    set((state) => {
      const uiPreferences = {
        ...state.uiPreferences,
        paperTextureOpacity: Math.min(1, Math.max(0, opacity)),
      };
      saveState({ uiPreferences });
      return { uiPreferences };
    }),
  clearRealtimeToast: () =>
    set((state) => ({
      realtime: {
        ...state.realtime,
        toast: null,
      },
    })),
  
  clearStore: () => {
    galleryBidsManualTeardown = true;
    clearGalleryBidsRetryTimer();
    galleryBidRefreshQueue?.clear();
    galleryBidsRetryAttempt = 0;
    galleryBidsManualTeardown = false;
    set({
    user: null,
    profile: null,
    currentOrg: null,
    memberships: [],
    membershipsLoaded: false,
    currencyPreference: 'USD',
    currencyRates: DEFAULT_CURRENCY_RATES,
    currencyRatesLoading: false,
    currencyRatesError: null,
    shipments: [],
    selectedShipmentId: null,
    quotes: [],
    selectedQuoteId: null,
    selectedQuoteDetails: null,
    selectedItemId: null,
    selectedItemType: null,
    logisticsPartners: [],
    loading: false,
    initialLoading: true,
    error: null,
    branchNetworkAuthError: null,
    userType: null,
    realtime: {
      isConnected: false,
      subscriptions: new Map(),
      lastActivity: null,
      reconnecting: false,
      toast: null,
      nextRetryDelayMs: null,
    },
    uiPreferences: {
      paperTextureEnabled: false,
      paperTextureOpacity: 0.24,
    },
    forms: {
      shipment: {
        origin: '',
        destination: '',
        arrivalDate: getDefaultArrivalDate(),
        artworks: [],
        selectedShippers: new Set(),
        insuranceRequired: false,
        deliveryRequirements: new Set(),
        accessAtDelivery: new Set(),
        safetySecurityRequirements: new Set(),
        conditionCheckRequirements: new Set(),
        notes: '',
        title: '',
        clientReference: '',
        biddingDeadline: null,
        autoCloseBidding: true,
      },
      quote: {
        title: '',
        type: 'requested',
        route: null,
        origin_id: null,
        destination_id: null,
        target_date: null,
        target_date_start: null,
        target_date_end: null,
        value: null,
        description: null,
        requirements: null,
        bidding_deadline: null,
        auto_close_bidding: true,
        delivery_specifics: null,
        notes: null,
        client_reference: null,
        artworks: [],
      },
      geminiArtworkData: null,
      uploadState: {
        uploadedFiles: [],
        isProcessing: false,
        processingComplete: false,
        extractedData: [],
        overallProgress: 0,
        shipmentData: {
          origin: '',
          destination: '',
          arrivalDate: getDefaultArrivalDate(),
          title: '',
          clientReference: '',
        },
      },
    },
    optimistic: {
      operations: new Map(),
      optimisticQuotes: new Map(),
      optimisticShipments: new Map(),
    },
    });
    galleryBidsManualTeardown = false;
  },
  
  clearForms: () => set(state => ({
    forms: {
      shipment: {
        origin: '',
        destination: '',
        arrivalDate: getDefaultArrivalDate(),
        artworks: [],
        selectedShippers: new Set(),
        insuranceRequired: false,
        deliveryRequirements: new Set(),
        accessAtDelivery: new Set(),
        safetySecurityRequirements: new Set(),
        conditionCheckRequirements: new Set(),
        notes: '',
        title: '',
        clientReference: '',
        biddingDeadline: null,
        autoCloseBidding: true,
      },
      quote: {
        title: '',
        type: 'requested' as const,
        route: null,
        origin_id: null,
        destination_id: null,
        target_date: null,
        target_date_start: null,
        target_date_end: null,
        value: null,
        description: null,
        requirements: null,
        bidding_deadline: null,
        auto_close_bidding: true,
        delivery_specifics: null,
        notes: null,
        client_reference: null,
        artworks: [],
      },
      geminiArtworkData: null,
      uploadState: {
        uploadedFiles: [],
        isProcessing: false,
        processingComplete: false,
        extractedData: [],
        overallProgress: 0,
        shipmentData: {
          origin: '',
          destination: '',
          arrivalDate: getDefaultArrivalDate(),
          title: '',
          clientReference: '',
        },
      },
    },
  }))
  };
});

galleryBidRefreshQueue = new GalleryBidRefreshQueue(
  (quoteId) => useSupabaseStore.getState().fetchQuoteDetails(quoteId, { background: true }),
  GALLERY_BID_QUEUE_DELAY_MS
);

export default useSupabaseStore; 
