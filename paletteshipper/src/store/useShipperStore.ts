import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { devtools } from 'zustand/middleware';
import { subscribeWithSelector } from 'zustand/middleware';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/AuthService';
import type { BidLineItem } from '../services/BidService';
import { BranchNetworkService, type BranchNetworkEntry, type BranchRole } from '../services/BranchNetworkService';
import { buildBidEmissionsPayload } from '../lib/emissions/bidEmissions';
import { EmissionsService } from '../services/EmissionsService';
import { useGeocodeSessionStore } from './useGeocodeSessionStore';
import { fetchLatestCurrencyRates } from '../lib/api/currency';
import {
  DEFAULT_CURRENCY_RATES,
  clampSupportedCurrency,
  type CurrencyRates,
  type SupportedCurrency
} from '../lib/currency';
import {
  createProfileImageSignedUrl,
  uploadProfileImageForUser,
  shouldRefreshProfileImage,
} from '../../../shared/profile/profileImage';
import {
  normalizeBidLineItems,
  calculateDraftTotal,
  roundCurrency,
  type CounterLineItemDraft,
} from '../lib/changeRequests/lineItemDrafts';

// Database types (these would normally be generated from Supabase)
interface Organization {
  id: string;
  name: string;
  type: 'client' | 'partner';
  created_at: string;
  img_url?: string;
  parent_org_id?: string | null;
  branch_name?: string | null;
  branch_location_id?: string | null;
  company_id?: string | null;
  company?: Organization | null;
}

interface Quote {
  id: string;
  title: string;
  type: 'requested' | 'open' | 'direct';
  status: 'draft' | 'active' | 'closed' | 'archived' | 'completed' | 'cancelled';
  route?: string;
  origin_id?: string;
  destination_id?: string;
  target_date?: string;
  target_date_start?: string;
  target_date_end?: string;
  value?: number;
  description?: string;
  requirements?: any;
  owner_org_id: string;
  shipment_id?: string;
  created_at: string;
  updated_at: string;
  bidding_deadline?: string;
  auto_close_bidding?: boolean;
  delivery_specifics?: any;
  notes?: string;
  client_reference?: string;
  origin_contact_name?: string | null;
  origin_contact_phone?: string | null;
  origin_contact_email?: string | null;
  destination_contact_name?: string | null;
  destination_contact_phone?: string | null;
  destination_contact_email?: string | null;
}

interface QuoteWithDetails extends Quote {
  origin?: Location;
  destination?: Location;
  quote_artworks?: QuoteArtwork[];
  owner_org?: Organization;
}

interface Location {
  id: string;
  name: string;
  address_full: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
}

interface QuoteArtwork {
  id: string;
  quote_id: string;
  name: string;
  artist_name?: string;
  year_completed?: number;
  medium?: string;
  dimensions?: string;
  weight?: string;
  weight_value?: number | null;
  weight_unit?: string | null;
  volumetric_weight_value?: number | null;
  volumetric_weight_unit?: string | null;
  declared_value?: number;
  crating?: string;
  has_existing_crate?: boolean | null;
  category?: string | null;
  item_type?: string | null;
  period?: string | null;
  description?: string;
  image_url?: string;
  tariff_code?: string;
  country_of_origin?: string;
  export_license_required?: boolean;
  special_requirements?: any;
}

interface Bid {
  id: string;
  quote_id: string;
  logistics_partner_id: string;
  amount: number;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn' | 'draft' | 'needs_confirmation';
  notes?: string;
  estimated_transit_time?: string;
  insurance_included?: boolean;
  special_services?: string[];
  valid_until?: string;
  created_at: string;
  updated_at: string;
  is_draft?: boolean;
  submitted_at?: string;
  last_modified_by?: string;
  rejection_reason?: string;
  rejected_at?: string;
  show_breakdown?: boolean;
  breakdown_notes?: string;
  co2_estimate?: number;
  needs_confirmation_at?: string;
  confirmed_at?: string;
  accepted_at?: string;
  withdrawn_at?: string;
}

interface BidWithDetails extends Bid {
  bid_line_items?: BidLineItem[];
  quote?: Quote;
}

interface Shipment {
  id: string;
  code: string;
  name: string;
  status: string;
  ship_date?: string;
  estimated_arrival?: string;
  transit_time?: string;
  total_value?: number;
  transport_method?: string;
  logistics_partner_id?: string;
  logistics_partner?: string;
  special_services?: string[];
  insurance_type?: string;
  insurance_provider?: string;
  security_level?: string;
  security_measures?: string;
  condition_report?: string;
  origin_id?: string;
  destination_id?: string;
  owner_org_id?: string;
  created_at: string;
  updated_at: string;
  carbon_estimate?: number;
  carbon_offset?: boolean;
  carbon_details?: any;
  delivery_requirements?: string[];
  packing_requirements?: string;
  access_requirements?: string[];
  safety_security_requirements?: string[];
  condition_check_requirements?: string[];
  client_reference?: string;
  quote_id?: string;
  owner_org?: Organization | null;
}

interface ShipmentWithDetails extends Shipment {
  origin?: Location;
  destination?: Location;
  artworks?: any[];
  tracking_events?: TrackingEvent[];
  documents?: any[];
  owner_org?: Organization | null;
}

interface ShipmentChangeRequest {
  id: string;
  shipment_id: string;
  initiated_by: string;
  change_type: 'scope' | 'withdrawal' | 'cancellation';
  proposal?: any;
  proposed_amount?: number;
  proposed_ship_date?: string;
  proposed_delivery_date?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'declined' | 'countered' | 'withdrawn';
  responded_by?: string;
  responded_at?: string;
  response_notes?: string;
  created_at: string;
  counter_bid_id?: string | null;
}

interface TrackingEvent {
  id: string;
  shipment_id: string;
  status: string;
  location?: string;
  event_time: string;
  notes?: string;
}

interface LogisticsPartner {
  id: string;
  name: string;
  abbreviation: string;
  brand_color?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_name?: string;
  website?: string;
  specialties?: string[];
  regions?: string[];
  active?: boolean;
  org_id?: string;
  rating?: number;
  created_at?: string;
}

interface Profile {
  id: string;
  full_name?: string;
  default_org?: string;
  created_at?: string;
  preferred_currency?: string;
  profile_image_path?: string | null;
}

interface Membership {
  user_id: string;
  org_id: string;
  role: 'admin' | 'member' | 'viewer';
  company_id?: string | null;
  organization?: Organization;
  company?: Organization | null;
}

// Form state types
interface BidLineItemFormData {
  category: string;
  description: string[];  // Array to match database ARRAY type
  quantity: number;
  unit_price: number;
  total_amount: number;
  is_optional: boolean;
  sort_order?: number;
}

interface BidFormData {
  quote_id: string;
  amount: number;
  line_items: BidLineItemFormData[];
  notes: string;
  is_draft: boolean;
  insurance_included: boolean;
  special_services: string[];
  estimated_transit_time?: string;
  valid_until?: string;
  co2_estimate?: number | null;
}

// Store interface
interface ShipperStore {
  // Auth state
  user: User | null;
  profile: Profile | null;
  profileImageUrl: string | null;
  profileImageUrlExpiresAt: number | null;
  profileImageRefreshing: boolean;
  profileImageUploading: boolean;
  organization: Organization | null;
  branchOrganization: Organization | null;
  logisticsPartner: LogisticsPartner | null;
  memberships: Membership[];
  currencyPreference: SupportedCurrency;
  currencyRates: CurrencyRates;
  currencyRatesLoading: boolean;
  currencyRatesError: string | null;
  
  // Data state
  availableQuotes: QuoteWithDetails[];
  myBids: BidWithDetails[];
  assignedShipments: ShipmentWithDetails[];
  currentChangeRequests: ShipmentChangeRequest[];
  pendingChangeByShipmentId: Record<string, boolean>;
  changeRequestActionLoading: Record<string, boolean>;
  counterDraftLineItems: Record<string, CounterLineItemDraft[]>;
  counterRemoveIds: Record<string, string[]>;
  partners: LogisticsPartner[];
  contactableShippers: Array<{
    id: string; // composite id (branch:user)
    name: string; // e.g. Company — Branch
    img_url?: string | null;
    contact_name?: string;
    regions?: string[];
    branch_org_id?: string;
    company_org_id?: string;
    member_role?: BranchRole;
  }>;
  branchNetwork: BranchNetworkEntry[];
  branchNetworkLoading: boolean;
  branchNetworkError: string | null;
  selectedQuoteId: string | null;
  selectedBidId: string | null;
  selectedShipmentId: string | null;
  
  // UI state
  loading: boolean;
  authLoading: boolean;
  error: string | null;
  authHydrationPending: boolean;
  authHydrated: boolean;
  dashboardPrefetched: boolean;
  authHydrationPromise: Promise<void> | null;
  uiPreferences: {
    paperTextureEnabled: boolean;
    paperTextureOpacity: number;
  };
  hydratedUserId: string | null;
  dashboardSearchTerm: string;
  
  // Form state
  forms: {
    bid: BidFormData;
  };
  
  // Real-time state
  realtime: {
    isConnected: boolean;
    subscriptions: Map<string, any>;
  };
  
  // Actions
  // Auth
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setOrganization: (org: Organization | null) => void;
  setBranchOrganization: (branch: Organization | null) => void;
  setLogisticsPartner: (partner: LogisticsPartner | null) => void;
  setMemberships: (memberships: Membership[]) => void;
  hydrateFromSession: () => Promise<void>;
  waitForAuthHydration: () => Promise<void>;
  updateCurrencyPreference: (currency: SupportedCurrency) => Promise<void>;
  fetchCurrencyRates: (force?: boolean) => Promise<void>;
  refreshProfileImageUrl: (options?: { force?: boolean }) => Promise<string | null>;
  uploadProfileImage: (file: File) => Promise<{ path: string; signedUrl: string | null }>;
  
  // Data fetching
  fetchAvailableQuotes: () => Promise<void>;
  fetchMyBids: () => Promise<void>;
  fetchAssignedShipments: () => Promise<void>;
  fetchQuoteDetails: (id: string) => Promise<QuoteWithDetails | null>;
  fetchPartners: () => Promise<void>;
  fetchContactableShippers: () => Promise<void>;
  fetchBranchNetwork: () => Promise<void>;
  
  // Selections
  selectQuote: (id: string | null) => void;
  selectBid: (id: string | null) => void;
  selectShipment: (id: string | null) => void;
  
  // Bid operations
  updateBidForm: (data: Partial<BidFormData>) => void;
  saveBidDraft: () => Promise<{ data: Bid | null; error: any }>;
  submitBid: () => Promise<{ data: Bid | null; error: any; emissionsWarnings?: string[] }>;
  withdrawBid: (bidId: string) => Promise<{ error: any }>;
  confirmBid: (bidId: string) => Promise<{ data: Bid | null; error: any }>;
  // Change requests
  fetchShipmentChangeRequests: (shipmentId: string) => Promise<void>;
  createChangeRequest: (
    shipmentId: string,
    type: 'scope' | 'withdrawal',
    params?: { proposedAmount?: number; proposedShipDate?: string; proposedDeliveryDate?: string; reason?: string }
  ) => Promise<{ error: any | null }>;
  respondToChangeRequest: (
    requestId: string,
    action: 'approve' | 'counter' | 'reject',
    params?: { proposedAmount?: number; notes?: string; bidId?: string }
  ) => Promise<{ error: any | null }>;
  initializeCounterDraft: (bidId: string, lineItems: BidLineItem[]) => void;
  updateCounterDraftLineItem: (
    bidId: string,
    itemId: string,
    updater: (item: CounterLineItemDraft) => CounterLineItemDraft
  ) => void;
  addCounterDraftLineItem: (bidId: string, item: BidLineItem) => void;
  removeCounterDraftLineItem: (bidId: string, itemId: string) => void;
  restoreCounterDraftLineItem: (bidId: string, itemId: string) => void;
  clearCounterDraft: (bidId: string) => void;
  refreshPendingChangeMapForShipments: (shipmentIds: string[]) => Promise<void>;
  withdrawChangeRequestAndShipment: (
    shipmentId: string,
    requestId?: string
  ) => Promise<{ error: any | null }>;
  
  // Real-time
  initializeRealtime: () => void;
  subscribeToQuoteUpdates: () => void;
  subscribeToBidUpdates: () => void;
  subscribeToShipmentUpdates: () => void;
  unsubscribeFromAll: () => void;
  
  // Utilities
  setLoading: (loading: boolean) => void;
  setAuthLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearStore: () => void;
  setPaperTextureEnabled: (enabled: boolean) => void;
  setPaperTextureOpacity: (opacity: number) => void;
  setDashboardSearchTerm: (value: string) => void;
  
  // Auth methods
  signUp: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  fetchUserMemberships: () => Promise<void>;
  preloadPartnerDashboardData: () => Promise<void>;
}

// Helper for async operations with timeout
async function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), ms)
    )
  ]);
}

// Create the store with persistence
const useShipperStore = create<ShipperStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // Initial state
          user: null,
          profile: null,
          profileImageUrl: null,
          profileImageUrlExpiresAt: null,
          profileImageRefreshing: false,
          profileImageUploading: false,
          organization: null,
          branchOrganization: null,
          logisticsPartner: null,
          memberships: [],
          currencyPreference: 'USD',
          currencyRates: DEFAULT_CURRENCY_RATES,
          currencyRatesLoading: false,
          currencyRatesError: null,
          availableQuotes: [],
          myBids: [],
          assignedShipments: [],
          currentChangeRequests: [],
          pendingChangeByShipmentId: {},
          changeRequestActionLoading: {},
          counterDraftLineItems: {},
          counterRemoveIds: {},
          partners: [],
          contactableShippers: [],
          branchNetwork: [],
          branchNetworkLoading: false,
          branchNetworkError: null,
          selectedQuoteId: null,
          selectedBidId: null,
          selectedShipmentId: null,
          loading: false,
          authLoading: false,
          error: null,
          authHydrationPending: false,
          authHydrated: false,
          dashboardPrefetched: false,
          authHydrationPromise: null,
          hydratedUserId: null,
          dashboardSearchTerm: '',
          uiPreferences: {
            paperTextureEnabled: false,
            paperTextureOpacity: 0.24,
          },
          
          forms: {
            bid: {
              quote_id: '',
              amount: 0,
              line_items: [],
              notes: '',
              is_draft: true,
              insurance_included: false,
              special_services: [],
              co2_estimate: null,
            },
          },
          
          realtime: {
            isConnected: false,
            subscriptions: new Map(),
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
          setOrganization: (organization) => set({ organization }),
          setBranchOrganization: (branchOrganization) => set({ branchOrganization }),
          setLogisticsPartner: (logisticsPartner) => set({ logisticsPartner }),
          setMemberships: (memberships) => set({ memberships }),
          hydrateFromSession: () => {
            const existingPromise = get().authHydrationPromise;
            if (existingPromise) {
              return existingPromise;
            }

            const sessionUser = get().user;
            if (!sessionUser) {
              return Promise.resolve();
            }

            const alreadyHydratedForUser =
              get().authHydrated &&
              get().dashboardPrefetched &&
              get().hydratedUserId === sessionUser.id;

            if (alreadyHydratedForUser) {
              return Promise.resolve();
            }

            const hydration = (async () => {
              set({
                authHydrationPending: true,
                authHydrated: false,
                dashboardPrefetched: false,
                hydratedUserId: sessionUser.id,
              });

              try {
                await get().fetchUserMemberships();
                await get().preloadPartnerDashboardData();

                set({
                  authHydrationPending: false,
                  authHydrated: true,
                  dashboardPrefetched: true,
                  hydratedUserId: sessionUser.id,
                });
              } catch (error) {
                set({
                  authHydrationPending: false,
                  authHydrated: false,
                  hydratedUserId: null,
                });
                throw error;
              } finally {
                set({ authHydrationPromise: null });
              }
            })();

            set({ authHydrationPromise: hydration });
            return hydration;
          },
          waitForAuthHydration: async () => {
            if (get().authHydrated) {
              return;
            }

            const existingPromise = get().authHydrationPromise;
            if (existingPromise) {
              await existingPromise;
              return;
            }

            await get().hydrateFromSession();
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
                profile: data as Profile,
                currencyPreference: target
              });
            } catch (err) {
              console.error('[useShipperStore] Failed to update currency preference', err);
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
              console.error('[useShipperStore] Failed to fetch currency rates', err);
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

            const currentUrl = get().profileImageUrl;
            const expiresAt = get().profileImageUrlExpiresAt;
            if (!force && currentUrl && expiresAt && !shouldRefreshProfileImage(expiresAt)) {
              return currentUrl;
            }

            set({ profileImageRefreshing: true });
            try {
              const { signedUrl, expiresAt: nextExpiry } = await createProfileImageSignedUrl(
                supabase,
                profile.profile_image_path
              );
              set({
                profileImageUrl: signedUrl,
                profileImageUrlExpiresAt: nextExpiry,
                profileImageRefreshing: false,
              });
              return signedUrl;
            } catch (error) {
              console.error('[useShipperStore] Failed to refresh profile image URL', error);
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
                get().setProfile(data as Profile);
              }

              const { signedUrl, expiresAt } = await createProfileImageSignedUrl(supabase, path);
              set({
                profileImageUrl: signedUrl,
                profileImageUrlExpiresAt: expiresAt,
              });

              return { path, signedUrl };
            } catch (error) {
              console.error('[useShipperStore] Failed to upload profile image', error);
              throw error;
            } finally {
              set({ profileImageUploading: false });
            }
          },
          
          // Data fetching with error handling
          fetchAvailableQuotes: async () => {
            console.log('🚀 useShipperStore.fetchAvailableQuotes - Starting');
            set({ loading: true, error: null });
            try {
              const currentState = get();
              const partnerId = currentState.logisticsPartner?.id;
              
              console.log('🔍 Current state:', {
                user: currentState.user?.email,
                organization: currentState.organization,
                logisticsPartner: currentState.logisticsPartner,
                partnerId: partnerId
              });
              
              if (!partnerId) {
                console.error('❌ No logistics partner ID found in store');
                throw new Error('No logistics partner ID');
              }
              
              console.log('📦 Fetching quotes for partner:', partnerId);
              
              // Import service dynamically to avoid circular dependencies
              const { QuoteService } = await import('../services/QuoteService');
              const branchOrgId = currentState.organization?.id;
              const { data, error } = await withTimeout(
                QuoteService.getAvailableQuotes(partnerId, branchOrgId)
              );
              
              if (error) {
                console.error('❌ Error from QuoteService:', error);
                throw error;
              }
              
              console.log('✅ Quotes fetched successfully:', {
                count: data?.length || 0,
                quotes: data
              });
              
              set({ availableQuotes: data || [], loading: false });
            } catch (error) {
              console.error('❌ Error in fetchAvailableQuotes:', error);
              set({ error: (error as Error).message, loading: false });
            }
          },
          
          fetchMyBids: async () => {
            set({ loading: true, error: null });
            try {
              const { logisticsPartner, organization } = get();
              const partnerId = logisticsPartner?.id;
              if (!partnerId) throw new Error('No logistics partner ID');
              const branchOrgId = organization?.id;
              if (!branchOrgId) throw new Error('No active branch selected');
              
              const { BidService } = await import('../services/BidService');
              const { data, error } = await withTimeout(
                BidService.getPartnerBids(partnerId, branchOrgId)
              );
              
              if (error) throw error;
              set({ myBids: data || [], loading: false });
            } catch (error) {
              console.error('Error fetching bids:', error);
              set({ error: (error as Error).message, loading: false });
            }
          },
          
          fetchAssignedShipments: async () => {
            console.log('🚀 useShipperStore.fetchAssignedShipments - Starting');
            set({ loading: true, error: null });
            try {
              const currentState = get();
              const organization = currentState.organization;
              const logisticsPartner = currentState.logisticsPartner;
              const { ShipmentService } = await import('../services/ShipmentService');

              console.log('🔍 Current state:', {
                user: currentState.user?.email,
                organization,
                logisticsPartner
              });

              // Logistics partner path (branch required)
              if (logisticsPartner?.id) {
                const branchOrgId = organization?.id;
                if (!branchOrgId) {
                  console.warn('⚠️ No branch organization selected; skipping logistics partner shipments fetch');
                  set({ assignedShipments: [], selectedShipmentId: null, loading: false });
                  return;
                }

                const { data, error } = await withTimeout(
                  ShipmentService.getAssignedShipments(logisticsPartner.id, branchOrgId)
                );

                if (error) throw error;

                const shipments = (data as ShipmentWithDetails[]) || [];
                set(state => {
                  const selectionStillValid = shipments.some(shipment => shipment.id === state.selectedShipmentId);
                  return {
                    assignedShipments: shipments,
                    selectedShipmentId: selectionStillValid ? state.selectedShipmentId : null,
                    loading: false
                  };
                });

                try {
                  const shipmentIds = shipments.map((s: any) => s.id);
                  if (shipmentIds.length > 0) {
                    await get().refreshPendingChangeMapForShipments(shipmentIds);
                  }
                } catch (refreshError) {
                  console.warn('Failed to refresh pending change map after fetching shipments', refreshError);
                }

                console.log('✅ Logistics partner shipments fetched:', shipments.length);
                return;
              }

              // Gallery/org-owned path
              if (organization?.id) {
                const { data, error } = await withTimeout(
                  ShipmentService.getShipmentsByOwnerOrg(organization.id)
                );

                if (error) throw error;

                const shipments = (data as ShipmentWithDetails[]) || [];
                set(state => {
                  const selectionStillValid = shipments.some(shipment => shipment.id === state.selectedShipmentId);
                  return {
                    assignedShipments: shipments,
                    selectedShipmentId: selectionStillValid ? state.selectedShipmentId : null,
                    loading: false
                  };
                });

                try {
                  const shipmentIds = shipments.map((s: any) => s.id);
                  if (shipmentIds.length > 0) {
                    await get().refreshPendingChangeMapForShipments(shipmentIds);
                  }
                } catch (refreshError) {
                  console.warn('Failed to refresh pending change map after fetching owner shipments', refreshError);
                }

                console.log('✅ Organization-owned shipments fetched:', shipments.length);
                return;
              }

              throw new Error('No logistics partner ID or organization ID found');
            } catch (error) {
              console.error('❌ Error fetching shipments:', error);
              set({ error: (error as Error).message, loading: false });
            }
          },
          
          fetchQuoteDetails: async (id: string) => {
            set({ loading: true, error: null });
            try {
              const { QuoteService } = await import('../services/QuoteService');
              const { data, error } = await withTimeout(
                QuoteService.getQuoteDetails(id)
              );
              
              if (error) throw error;
              set({ loading: false });
              return data;
            } catch (error) {
              console.error('Error fetching quote details:', error);
              set({ error: (error as Error).message, loading: false });
              return null;
            }
          },
          
          fetchPartners: async () => {
            set({ loading: true, error: null });
            try {
              const { PartnerService } = await import('../services/PartnerService');
              const { data, error } = await withTimeout(
                PartnerService.getAllPartners()
              );
              
              if (error) throw error;
              set({ partners: data || [], loading: false });
            } catch (error) {
              console.error('Error fetching partners:', error);
              set({ error: (error as Error).message, loading: false });
            }
          },

          fetchContactableShippers: async () => {
            set({ loading: true, error: null });
            try {
              const currentUser = get().user;
              const currentOrganization = get().organization;
              const currentLogisticsPartner = get().logisticsPartner;

              const { data: branchEntries, error: branchError } = await BranchNetworkService.getBranchNetwork();
              if (branchError) {
                throw branchError;
              }

              const ownCompanyId = currentLogisticsPartner?.org_id || currentOrganization?.company_id || currentOrganization?.id || null;
              const ownBranchId = currentOrganization?.id || null;

              const filteredEntries = (branchEntries || []).filter(entry => {
                if (!entry.companyOrgId) {
                  return false;
                }
                if (ownCompanyId && entry.companyOrgId === ownCompanyId) {
                  return false;
                }
                // Guard against own branch if company wasn't available
                if (!ownCompanyId && ownBranchId && entry.branchOrgId === ownBranchId) {
                  return false;
                }
                return entry.members && entry.members.length > 0;
              });

              const branchOrgIds = Array.from(new Set(filteredEntries.map(entry => entry.branchOrgId).filter(Boolean))) as string[];
              const companyIds = Array.from(new Set(filteredEntries.map(entry => entry.companyOrgId).filter(Boolean))) as string[];

              const { data: orgRows, error: orgError } = branchOrgIds.length
                ? await supabase
                    .from('organizations')
                    .select('id, img_url')
                    .in('id', branchOrgIds)
                : { data: [], error: null };

              if (orgError) {
                throw orgError;
              }

              const { data: partnerRows, error: partnerError } = companyIds.length
                ? await supabase
                    .from('logistics_partners')
                    .select('org_id, regions')
                    .in('org_id', companyIds)
                : { data: [], error: null };

              if (partnerError) {
                throw partnerError;
              }

              const logoByBranch = new Map<string, string | null>(
                (orgRows || []).map((row: any) => [row.id as string, (row.img_url as string | null) ?? null])
              );

              const regionsByCompany = new Map<string, string[]>(
                (partnerRows || []).map((row: any) => [row.org_id as string, ((row.regions as string[] | null) || []).map(String)])
              );

              const cards = filteredEntries.flatMap(entry => {
                const companyName = entry.companyName || 'Logistics Partner';
                const branchLabel = entry.branchName || entry.displayName || 'Branch';
                const displayName = `${companyName} — ${branchLabel}`;
                const branchRegions = regionsByCompany.get(entry.companyOrgId) || [];

                return entry.members
                  .filter(member => Boolean(member.userId) && member.userId !== currentUser?.id)
                  .map(member => ({
                    id: `${entry.branchOrgId}:${member.userId}`,
                    name: displayName,
                    img_url: logoByBranch.get(entry.branchOrgId) ?? null,
                    contact_name: member.fullName || 'Team member',
                    regions: branchRegions.length ? branchRegions : undefined,
                    branch_org_id: entry.branchOrgId,
                    company_org_id: entry.companyOrgId,
                    member_role: member.role,
                  }));
              });

              const uniqueCards = cards.filter((card, index, self) => self.findIndex(other => other.id === card.id) === index);
              uniqueCards.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

              set({ contactableShippers: uniqueCards, loading: false });
            } catch (error) {
              console.error('Error fetching contactable shippers:', error);
              set({ error: (error as Error).message, contactableShippers: [], loading: false });
            }
          },

          fetchBranchNetwork: async () => {
            set({ branchNetworkLoading: true, branchNetworkError: null });
            try {
              const { data, error } = await BranchNetworkService.getBranchNetwork();

              if (error) {
                throw error;
              }

              set({ branchNetwork: data, branchNetworkLoading: false, branchNetworkError: null });
            } catch (error) {
              console.error('Error fetching branch network:', error);
              set({
                branchNetwork: [],
                branchNetworkLoading: false,
                branchNetworkError: (error as Error).message,
              });
            }
          },
          
          // Selection actions with persistence
          selectQuote: (id) => set({ selectedQuoteId: id }),
          selectBid: (id) => set({ selectedBidId: id }),
          selectShipment: (id) => set({ selectedShipmentId: id }),
          
          // Bid form management
          updateBidForm: (data) => set((state) => ({
            forms: {
              ...state.forms,
              bid: { ...state.forms.bid, ...data }
            }
          })),
          
          saveBidDraft: async () => {
            const { forms, logisticsPartner, user, organization } = get();
            if (!logisticsPartner) {
              return { data: null, error: new Error('No logistics partner') };
            }
            const branchOrgId = organization?.id;
            if (!branchOrgId) {
              return { data: null, error: new Error('No active branch selected') };
            }
            
            try {
              const { BidService } = await import('../services/BidService');
              
              // Prepare bid data with proper types and defaults
              const bidData = {
                quote_id: forms.bid.quote_id,
                logistics_partner_id: logisticsPartner.id,
                branch_org_id: branchOrgId,
                amount: forms.bid.amount,
                status: 'draft' as const,
                notes: forms.bid.notes || undefined,
                estimated_transit_time: forms.bid.estimated_transit_time || undefined,
                insurance_included: forms.bid.insurance_included || false,
                special_services: forms.bid.special_services || [],
                valid_until: forms.bid.valid_until || undefined,
                is_draft: true,
                last_modified_by: user?.id || undefined,
                show_breakdown: true, // Since we have detailed line items
                co2_estimate: forms.bid.co2_estimate ?? null,
              };
              
              const result = await BidService.upsertBid(bidData);
              
              if (result.data) {
                // Save line items if they exist - convert to BidLineItem type for database
                if (forms.bid.line_items && forms.bid.line_items.length > 0) {
                  const lineItemsForDb: BidLineItem[] = forms.bid.line_items.map(item => ({
                    ...item,
                    bid_id: result.data!.id,
                  }));
                  const upsertResult = await BidService.upsertBidLineItems(result.data.id, lineItemsForDb);
                  if (upsertResult.error) {
                    console.error('❌ upsertBidLineItems failed (store.saveBidDraft):', upsertResult.error, { bidId: result.data.id, lineItems: lineItemsForDb });
                    alert('Failed to save line items for draft: ' + (upsertResult.error.message || String(upsertResult.error)));
                  } else {
                    console.log('✅ Line items saved (store.saveBidDraft):', upsertResult.data);
                  }
                }
                
                // Create bid history entry (best-effort; ignore auth/RLS failures)
                try {
                  await supabase
                    .from('bid_history')
                    .insert({
                      bid_id: result.data.id,
                      action: 'created',
                      new_status: 'draft',
                      new_amount: forms.bid.amount,
                      user_id: user?.id || null,
                      notes: 'Draft bid created',
                    });
                } catch (logError) {
                  console.warn('bid_history insert failed (draft)', logError);
                }
                
                // Update local state
                await get().fetchMyBids();
              }
              
              return result;
            } catch (error) {
              return { data: null, error };
            }
          },
          
          submitBid: async () => {
            const { forms, logisticsPartner, user, organization } = get();
            if (!logisticsPartner) {
              return { data: null, error: new Error('No logistics partner') };
            }
            const branchOrgId = organization?.id;
            if (!branchOrgId) {
              return { data: null, error: new Error('No active branch selected') };
            }

            let emissionsWarnings: string[] = [];
            set({ loading: true, error: null });
            try {
              // Detect if there's an existing submitted bid before we modify anything
              const quoteId = forms.bid.quote_id;
              let wasPreviouslySubmitted = false;
              if (quoteId && logisticsPartner.id) {
                let existingQuery = supabase
                  .from('bids')
                  .select('id, submitted_at, revision')
                  .eq('quote_id', quoteId)
                  .eq('logistics_partner_id', logisticsPartner.id)
                  .eq('branch_org_id', branchOrgId);

                const { data: existing, error: existingErr } = await existingQuery
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (!existingErr && existing) {
                  wasPreviouslySubmitted = !!existing.submitted_at;
                }
              }

              // First save as draft to ensure all data is persisted
              const draftResult = await get().saveBidDraft();
              if (draftResult.error) throw draftResult.error;

              if (draftResult.data?.id && forms.bid.quote_id) {
                try {
                  const lineItemsForEmissions = (forms.bid.line_items || []).map((item) => ({
                    category: item.category,
                    description: Array.isArray(item.description) ? item.description : [],
                  }));

                  let quote: QuoteWithDetails | null = get().availableQuotes.find((q) => q.id === forms.bid.quote_id) || null;
                  if (!quote) {
                    const { QuoteService } = await import('../services/QuoteService');
                    const { data: hydratedQuote } = await QuoteService.getQuoteDetails(forms.bid.quote_id);
                    quote = hydratedQuote;
                  }

                  const emissionBuild = buildBidEmissionsPayload({
                    bidId: draftResult.data.id,
                    quoteId: forms.bid.quote_id,
                    lineItems: lineItemsForEmissions,
                    quote,
                    userId: user?.id,
                  });

                  emissionsWarnings = [...emissionBuild.warnings];

                  if (emissionBuild.payload) {
                    try {
                      const emissionResponse = await EmissionsService.calculateBidEmissions(emissionBuild.payload);
                      if (typeof emissionResponse.co2Estimate === 'number') {
                        set((state) => ({
                          forms: {
                            ...state.forms,
                            bid: {
                              ...state.forms.bid,
                              co2_estimate: emissionResponse.co2Estimate ?? null,
                            },
                          },
                        }));
                      }
                      if (Array.isArray(emissionResponse.warnings) && emissionResponse.warnings.length > 0) {
                        emissionsWarnings.push(...emissionResponse.warnings);
                      }
                    } catch (emissionError) {
                      console.error('Emissions calculation failed:', emissionError);
                      emissionsWarnings.push(`Emissions calculation failed: ${(emissionError as Error).message}`);
                    }
                  }
                } catch (prepError) {
                  console.error('Failed preparing emissions payload:', prepError);
                  emissionsWarnings.push(`Could not prepare emissions payload: ${(prepError as Error).message}`);
                }
              }

              const { BidService } = await import('../services/BidService');

              // If resubmitting an already-submitted bid, bump the revision first (prior to submit)
              if (wasPreviouslySubmitted && draftResult.data?.id) {
                const bump = await BidService.incrementRevision(draftResult.data.id);
                if (bump?.error) {
                  console.warn('⚠️ Failed to increment bid revision before submission:', bump.error);
                }
              }
              const { data, error } = await BidService.submitBid(draftResult.data!.id, user?.id);

              if (error) throw error;

              // Create bid history entry for submission (best-effort)
              try {
                await supabase
                  .from('bid_history')
                  .insert({
                    bid_id: draftResult.data!.id,
                    action: 'submitted',
                    old_status: 'draft',
                    new_status: 'pending',
                    new_amount: forms.bid.amount,
                    user_id: user?.id || null,
                    notes: 'Bid submitted for review',
                  });
              } catch (logError) {
                console.warn('bid_history insert failed (submit)', logError);
              }

              // Update local state
              await get().fetchMyBids();
              set({ loading: false });

              // Clear the form after successful submission
              set((state) => ({
                forms: {
                  ...state.forms,
                  bid: {
                    quote_id: '',
                    amount: 0,
                    line_items: [],
                    notes: '',
                    is_draft: true,
                    insurance_included: false,
                    special_services: [],
                    co2_estimate: null,
                  },
                },
              }));

              const uniqueWarnings = Array.from(new Set(emissionsWarnings.filter(Boolean)));
              return { data, error: null, emissionsWarnings: uniqueWarnings };
            } catch (error) {
              set({ error: (error as Error).message, loading: false });
              const uniqueWarnings = Array.from(new Set(emissionsWarnings.filter(Boolean)));
              return { data: null, error, emissionsWarnings: uniqueWarnings };
            }
          },
          
          withdrawBid: async (bidId: string) => {
            set({ loading: true, error: null });
            try {
              const branchOrgId = get().organization?.id;
              if (!branchOrgId) {
                throw new Error('No active branch selected');
              }
              const { BidService } = await import('../services/BidService');
              const { error } = await BidService.withdrawBid(bidId, branchOrgId);
              
              if (error) throw error;
              
              // Update local state
              await get().fetchMyBids();
              set({ loading: false });
              
              return { error: null };
            } catch (error) {
              set({ error: (error as Error).message, loading: false });
              return { error };
            }
          },

          confirmBid: async (bidId: string) => {
            set({ loading: true, error: null });
            try {
              const { BidService } = await import('../services/BidService');
              const { data, error } = await BidService.confirmBid(bidId);
              if (error) throw error;
              // Refresh bids to reflect new status
              await get().fetchMyBids();
              set({ loading: false });
              return { data, error: null };
            } catch (error) {
              console.error('Error confirming bid:', error);
              set({ error: (error as Error).message, loading: false });
              return { data: null, error };
            }
          },
          
          // Change Requests
          initializeCounterDraft: (bidId: string, lineItems: BidLineItem[]) => {
            if (!bidId) return;
            set((state) => {
              if (state.counterDraftLineItems[bidId]) {
                return {};
              }
              return {
                counterDraftLineItems: {
                  ...state.counterDraftLineItems,
                  [bidId]: normalizeBidLineItems(lineItems),
                },
                counterRemoveIds: { ...state.counterRemoveIds, [bidId]: [] },
              };
            });
          },
          updateCounterDraftLineItem: (
            bidId: string,
            itemId: string,
            updater: (item: CounterLineItemDraft) => CounterLineItemDraft
          ) => {
            if (!bidId || !itemId) return;
            set((state) => {
              const current = state.counterDraftLineItems[bidId];
              if (!current) return {};
              const updated = current.map((item) => {
                if (item.id !== itemId) return item;
                const next = updater(item);
                const quantity = Number(next.quantity ?? 0);
                const unitPrice = Number(next.unit_price ?? 0);
                const derivedTotal = quantity * unitPrice;
                return {
                  ...next,
                  quantity,
                  unit_price: unitPrice,
                  total_amount: roundCurrency(derivedTotal),
                };
              });
              return {
                counterDraftLineItems: {
                  ...state.counterDraftLineItems,
                  [bidId]: updated,
                },
              };
            });
          },
          addCounterDraftLineItem: (bidId: string, item: BidLineItem) => {
            if (!bidId || !item) return;
            set((state) => {
              const current = state.counterDraftLineItems[bidId] || [];
              const normalized = normalizeBidLineItems([item])[0];
              if (!normalized) return {};
              const exists = normalized.id ? current.some((li) => li.id === normalized.id) : false;
              const nextRemoveIds = {...state.counterRemoveIds};
              if (normalized.id) {
                nextRemoveIds[bidId] = (nextRemoveIds[bidId] || []).filter((rid) => rid !== normalized.id);
              }
              return exists
                ? {}
                : {
                    counterDraftLineItems: {
                      ...state.counterDraftLineItems,
                      [bidId]: [...current, normalized],
                    },
                    counterRemoveIds: nextRemoveIds,
                  };
            });
          },
          removeCounterDraftLineItem: (bidId: string, itemId: string) => {
            if (!bidId || !itemId) return;
            set((state) => {
              const current = state.counterDraftLineItems[bidId];
              if (!current) return {};
              return {
                counterDraftLineItems: {
                  ...state.counterDraftLineItems,
                  [bidId]: current.map((li) =>
                    li.id === itemId
                      ? {
                          ...li,
                          removed: true,
                        }
                      : li
                  ),
                },
                counterRemoveIds: {
                  ...state.counterRemoveIds,
                  [bidId]: [...new Set([...(state.counterRemoveIds[bidId] || []), itemId])],
                },
              };
            });
          },
          restoreCounterDraftLineItem: (bidId: string, itemId: string) => {
            if (!bidId || !itemId) return;
            set((state) => {
              const current = state.counterDraftLineItems[bidId];
              if (!current) return {};
              return {
                counterDraftLineItems: {
                  ...state.counterDraftLineItems,
                  [bidId]: current.map((li) =>
                    li.id === itemId ? { ...li, removed: false } : li
                  ),
                },
                counterRemoveIds: {
                  ...state.counterRemoveIds,
                  [bidId]: (state.counterRemoveIds[bidId] || []).filter((rid) => rid !== itemId),
                },
              };
            });
          },
          clearCounterDraft: (bidId: string) => {
            if (!bidId) return;
            set((state) => {
              if (!state.counterDraftLineItems[bidId]) {
                return {};
              }
              const next = { ...state.counterDraftLineItems };
              delete next[bidId];
              const nextRemovals = { ...state.counterRemoveIds };
              delete nextRemovals[bidId];
              return { counterDraftLineItems: next, counterRemoveIds: nextRemovals };
            });
          },
          fetchShipmentChangeRequests: async (shipmentId: string) => {
            set({ loading: true, error: null });
            try {
              const { ShipmentService } = await import('../services/ShipmentService');
              const { data, error } = await ShipmentService.getChangeRequests(shipmentId);
              if (error) throw error;
              set({ currentChangeRequests: data || [], loading: false });
              set((state) => ({
                pendingChangeByShipmentId: {
                  ...state.pendingChangeByShipmentId,
                  [shipmentId]: (data || []).some((cr: any) => cr.status === 'pending')
                }
              }));
            } catch (error) {
              console.error('Error fetching change requests:', error);
              set({ error: (error as Error).message, loading: false });
            }
          },
          
          createChangeRequest: async (
            shipmentId: string,
            type: 'scope' | 'withdrawal',
            params?: { proposedAmount?: number; proposedShipDate?: string; proposedDeliveryDate?: string; reason?: string }
          ) => {
            set({ loading: true, error: null });
            try {
              const { ShipmentService } = await import('../services/ShipmentService');
              const { error } = await ShipmentService.createChangeRequest(shipmentId, type, params || {});
              if (error) throw error;
              await get().fetchShipmentChangeRequests(shipmentId);
              set({ loading: false });
              return { error: null };
            } catch (error) {
              console.error('Error creating change request:', error);
              set({ error: (error as Error).message, loading: false });
              return { error };
            }
          },
          
          respondToChangeRequest: async (
            requestId: string,
            action: 'approve' | 'counter' | 'reject',
            params?: { proposedAmount?: number; notes?: string; bidId?: string }
          ) => {
            const reqKey = requestId;
            set((state) => ({
              error: null,
              changeRequestActionLoading: { ...state.changeRequestActionLoading, [reqKey]: true }
            }));
            try {
              const { ShipmentService } = await import('../services/ShipmentService');
              const branchOrgId = get().organization?.id;
              if (!branchOrgId) {
                const err = new Error('Select an invited branch to respond to change requests.');
                set({ error: err.message });
                return { error: err };
              }
              let svcError: any = null;
              if (action === 'approve') {
                ({ error: svcError } = await ShipmentService.approveChangeRequest(requestId, branchOrgId, params?.notes));
              } else if (action === 'counter') {
                const bidId = params?.bidId;
                if (!bidId) {
                  return { error: new Error('Missing bid context for counter offer.') };
                }
                const drafts = get().counterDraftLineItems[bidId];
              if (!drafts || drafts.length === 0) {
                return { error: new Error('Prepare line items before sending a counter-offer.') };
              }
              const removeIds = get().counterRemoveIds[bidId] || [];
              const normalizedLineItems = drafts
                  .filter((item) => item.id || item.id === null)
                  .map((item) => ({
                    id: (item.id as string | null) ?? null,
                    category: item.category,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total_amount: item.total_amount,
                    is_optional: item.is_optional,
                    notes: item.notes,
                    sort_order: item.sort_order,
                  }));
              const counterAmount =
                  typeof params?.proposedAmount === 'number'
                    ? params.proposedAmount
                    : calculateDraftTotal(drafts);
              ({ error: svcError } = await ShipmentService.counterChangeRequest(requestId, {
                  amount: counterAmount,
                  lineItems: normalizedLineItems,
                  removeIds,
                  branchOrgId,
                  notes: params?.notes,
              }));
                if (!svcError) {
                  get().clearCounterDraft(bidId);
                  try {
                    await get().fetchMyBids();
                  } catch {
                    // ignore
                  }
                }
              } else if (action === 'reject') {
                ({ error: svcError } = await ShipmentService.rejectChangeRequest(requestId, branchOrgId, params?.notes));
              } else {
                return { error: new Error('Unsupported change-request action') };
              }
              if (svcError) {
                const status = typeof svcError?.status === 'number' ? svcError.status : undefined;
                if (status !== 403) {
                  set({ error: (svcError?.message as string) || 'Unable to respond to change request.' });
                }
                return { error: svcError };
              }
              const currentShipmentId = get().selectedShipmentId;
              if (currentShipmentId) await get().fetchShipmentChangeRequests(currentShipmentId);
              // Refresh shipments to reflect any approved changes immediately
              try {
                await get().fetchAssignedShipments();
              } catch {}
              return { error: null };
            } catch (error) {
              console.error('Error responding to change request:', error);
              set({ error: (error as Error).message });
              return { error };
            } finally {
              set((state) => ({
                changeRequestActionLoading: { ...state.changeRequestActionLoading, [reqKey]: false }
              }));
            }
          },

          refreshPendingChangeMapForShipments: async (shipmentIds: string[]) => {
            try {
              const { data, error } = await supabase
                .from('shipment_change_requests')
                .select('shipment_id, status')
                .in('shipment_id', shipmentIds)
                .eq('status', 'pending');
              if (error) throw error;
              const map: Record<string, boolean> = {};
              for (const sId of shipmentIds) map[sId] = false;
              for (const row of data || []) map[row.shipment_id as string] = true;
              set({ pendingChangeByShipmentId: map });
            } catch (e) {
              console.warn('refreshPendingChangeMapForShipments failed', e);
            }
          },
          
          withdrawChangeRequestAndShipment: async (shipmentId: string, requestId?: string) => {
            set({ loading: true, error: null });
            try {
              const { ShipmentService } = await import('../services/ShipmentService');
              const { error } = await ShipmentService.withdrawChangeRequestAndShipment(shipmentId, requestId);
              if (error) throw error;
              await get().fetchShipmentChangeRequests(shipmentId);
              set({ loading: false });
              return { error: null };
            } catch (error) {
              console.error('Error withdrawing from shipment:', error);
              set({ error: (error as Error).message, loading: false });
              return { error };
            }
          },
          
          // Real-time subscriptions
          initializeRealtime: () => {
            const { subscribeToQuoteUpdates, subscribeToBidUpdates, subscribeToShipmentUpdates } = get();
            subscribeToQuoteUpdates();
            subscribeToBidUpdates();
            subscribeToShipmentUpdates();
            set((state) => ({
              realtime: { ...state.realtime, isConnected: true }
            }));
          },
          
          subscribeToQuoteUpdates: () => {
            // Implementation will be added in useRealtime hook
          },
          
          subscribeToBidUpdates: () => {
            // Implementation will be added in useRealtime hook
          },
          
          subscribeToShipmentUpdates: () => {
            // Implementation will be added in useRealtime hook
          },
          
          unsubscribeFromAll: () => {
            const { realtime } = get();
            realtime.subscriptions.forEach((sub) => sub.unsubscribe());
            set((state) => ({
              realtime: {
                isConnected: false,
                subscriptions: new Map()
              }
            }));
          },
          
          // Utilities
          setLoading: (loading) => set({ loading }),
          setAuthLoading: (authLoading) => set({ authLoading }),
          setError: (error) => set({ error }),
          setPaperTextureEnabled: (enabled) =>
            set((state) => ({
              uiPreferences: {
                ...state.uiPreferences,
                paperTextureEnabled: enabled,
              },
            })),
          setPaperTextureOpacity: (opacity) =>
            set((state) => ({
              uiPreferences: {
                ...state.uiPreferences,
                paperTextureOpacity: Math.min(1, Math.max(0, opacity)),
              },
            })),
          setDashboardSearchTerm: (value) => set({ dashboardSearchTerm: value }),
          clearStore: () => {
            console.log('🧹 Store clearStore - Clearing all data');
            try {
              get().unsubscribeFromAll();
            } catch (error) {
              console.warn('⚠️ Error unsubscribing from realtime:', error);
            }
            
            // Clear ALL persisted store data from both stores
            try {
              localStorage.removeItem('shipper-storage');
              localStorage.removeItem('shipper-auth-storage');
              console.log('🗑️ Cleared all Zustand persisted storage (shipper-storage + shipper-auth-storage)');
            } catch (error) {
              console.warn('⚠️ Error clearing persisted storage:', error);
            }
            
            // Clear all Supabase-related storage as well (in case AuthService didn't clear it)
            try {
              const keys = Object.keys(localStorage);
              keys.forEach(key => {
                if (key.startsWith('sb-') || key.includes('supabase')) {
                  localStorage.removeItem(key);
                  console.log(`🗑️ Removed Supabase localStorage key: ${key}`);
                }
              });
              
              // Clear session storage as well
              const sessionKeys = Object.keys(sessionStorage);
              sessionKeys.forEach(key => {
                if (key.startsWith('sb-') || key.includes('supabase')) {
                  sessionStorage.removeItem(key);
                  console.log(`🗑️ Removed Supabase sessionStorage key: ${key}`);
                }
              });
            } catch (error) {
              console.warn('⚠️ Error clearing Supabase storage:', error);
            }
            
            set({
              user: null,
              profile: null,
              organization: null,
              branchOrganization: null,
              logisticsPartner: null,
              memberships: [],
              currencyPreference: 'USD',
              currencyRates: DEFAULT_CURRENCY_RATES,
              currencyRatesLoading: false,
              currencyRatesError: null,
              availableQuotes: [],
              myBids: [],
              assignedShipments: [],
              partners: [],
              branchNetwork: [],
              branchNetworkLoading: false,
              branchNetworkError: null,
              selectedQuoteId: null,
              selectedBidId: null,
              selectedShipmentId: null,
              loading: false,
              authLoading: false,
              error: null,
              authHydrationPending: false,
              authHydrated: false,
              dashboardPrefetched: false,
              authHydrationPromise: null,
              uiPreferences: {
                paperTextureEnabled: false,
                paperTextureOpacity: 0.24,
              },
              hydratedUserId: null,
            });
            console.log('✅ Store clearStore - All data cleared (including both Zustand stores and Supabase data)');
          },
          
          // Auth methods (copied from existing useSupabaseStore)
          signUp: async (email, password, fullName) => {
            try {
              set({ authLoading: true, error: null });
              
              const result = await AuthService.signUp(email, password, fullName);
              
              if (result.success && result.user) {
                set({ user: result.user });
                get().hydrateFromSession().catch(err => {
                  console.error('❌ signUp: hydrateFromSession failed', err);
                });
                // Note: Dashboard data will be loaded by each component as needed
              }
              
              set({ authLoading: false });
              return result;
            } catch (error: any) {
              set({ authLoading: false, error: error.message });
              return { success: false, error: error.message };
            }
          },
          
          signIn: async (email, password) => {
            try {
              set({ authLoading: true, error: null });
              
              const result = await AuthService.signIn(email, password);
              
              if (result.success && result.user) {
                set({ user: result.user, profile: result.profile });
                get().hydrateFromSession().catch(err => {
                  console.error('❌ signIn: hydrateFromSession failed', err);
                });
                // Note: Dashboard data will be loaded by each component as needed
              }
              
              set({ authLoading: false });
              return result;
            } catch (error: any) {
              set({ authLoading: false, error: error.message });
              return { success: false, error: error.message };
            }
          },
          
          signOut: async () => {
            console.log('🚪 Store signOut - Starting logout process');
            set({ authLoading: true });

            try {
              await AuthService.signOut();
              console.log('✅ Store signOut - AuthService signOut completed');
              useGeocodeSessionStore.getState().clearAll();

              // Give the auth listener a moment to process the SIGNED_OUT event
              // If it doesn't happen within 2 seconds, force clear the store
              setTimeout(() => {
                const currentUser = get().user;
                if (currentUser) {
                  console.log('⚠️ Store signOut - Auth listener didn\'t clear store, forcing clear');
                  get().clearStore();
                }
              }, 2000);
              
            } catch (error) {
              console.error('❌ Store signOut - Error during logout:', error);
              // If signout fails, force clear the store immediately
              console.log('🧹 Store signOut - Forcing store clear due to error');
              useGeocodeSessionStore.getState().clearAll();
              get().clearStore();
            }
          },
          
          fetchUserMemberships: async () => {
            const user = get().user;
            console.log('🔍 useShipperStore.fetchUserMemberships - Starting for user:', user?.email);
            
            if (!user) {
              console.log('⚠️ No user found, skipping membership fetch');
              return;
            }
            
            try {
              const {
                memberships,
                currentOrg,
                branchOrg,
                logisticsPartnerId,
              } = await AuthService.fetchUserMemberships(user.id);
              
              console.log('📊 Membership fetch result:', {
                memberships: memberships,
                currentOrg: currentOrg,
                logisticsPartnerId: logisticsPartnerId
              });
              
              // If we have a logistics partner ID, fetch full partner details
              let logisticsPartner: LogisticsPartner | null = null;
              if (logisticsPartnerId) {
                console.log('📦 Fetching full logistics partner details for ID:', logisticsPartnerId);
                const { data: partnerData, error: partnerDataError } = await supabase
                  .from('logistics_partners')
                  .select('*')
                  .eq('id', logisticsPartnerId)
                  .maybeSingle();

                if (partnerDataError && (partnerDataError as any).code !== 'PGRST116') {
                  throw partnerDataError;
                }

                if (partnerData) {
                  logisticsPartner = partnerData as LogisticsPartner;
                  console.log('✅ Full logistics partner details:', logisticsPartner);
                } else {
                  // Fallback to minimal partner object
                  logisticsPartner = { id: logisticsPartnerId } as LogisticsPartner;
                  console.log('⚠️ Could not fetch full partner details, using minimal object');
                }
              }
              set({
                memberships,
                organization: currentOrg,
                branchOrganization: branchOrg ?? currentOrg,
                logisticsPartner,
              });
              
              console.log('✅ Store updated with memberships and partner info');
            } catch (error: any) {
              console.error('❌ Error fetching memberships:', error);
              set({ error: error.message });
            }
          },
          
          preloadPartnerDashboardData: async () => {
            const currentState = get();
            const organization = currentState.organization;
            const logisticsPartner = currentState.logisticsPartner;
            
            console.log('🚀 useShipperStore.preloadPartnerDashboardData - Starting for:', {
              organization: organization?.name,
              logisticsPartner: logisticsPartner?.name,
              hasLogisticsPartner: !!logisticsPartner?.id
            });
            
            // Must have at least an organization to load data
            if (!organization?.id) {
              console.log('⚠️ No organization found, skipping dashboard data preload');
              set({ dashboardPrefetched: true });
              return;
            }
            
            try {
              // Fetch all data in parallel
              await Promise.all([
                get().fetchAvailableQuotes(),
                get().fetchMyBids(),
                get().fetchAssignedShipments(),
              ]);
              console.log('✅ Dashboard data preloaded successfully');
              set({ dashboardPrefetched: true });
            } catch (error: any) {
              console.error('❌ Error preloading dashboard data:', error);
              set({ error: error.message, dashboardPrefetched: false });
            }
          },
        }),
        {
          name: 'shipper-storage',
          storage: createJSONStorage(() => localStorage),
          partialize: (state) => ({
            // Only persist selections and form data, NOT auth state
            selectedQuoteId: state.selectedQuoteId,
            selectedBidId: state.selectedBidId,
            selectedShipmentId: state.selectedShipmentId,
            forms: state.forms,
            uiPreferences: state.uiPreferences,
          }),
          // Don't persist auth state to avoid hydration issues
          skipHydration: false,
          // Add a storage version for migration if needed
          version: 1,
          // Custom merge function to handle partial state restoration
          merge: (persistedState: any, currentState) => ({
            ...currentState,
            ...(persistedState || {}),
            // Always start with fresh auth state
            user: null,
            profile: null,
            organization: null,
            logisticsPartner: null,
            memberships: [],
            loading: false,
            authLoading: false,
            error: null,
            uiPreferences: {
              paperTextureEnabled: persistedState?.uiPreferences?.paperTextureEnabled ?? currentState.uiPreferences.paperTextureEnabled,
              paperTextureOpacity:
                typeof persistedState?.uiPreferences?.paperTextureOpacity === 'number'
                  ? persistedState.uiPreferences.paperTextureOpacity
                  : currentState.uiPreferences.paperTextureOpacity,
            },
          }),
        }
      )
    )
  )
);

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // @ts-expect-error debug helper for devtools inspection
  window.shipperStore = useShipperStore;
}

export default useShipperStore;
