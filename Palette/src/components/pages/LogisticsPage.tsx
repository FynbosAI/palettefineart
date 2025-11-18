import React, { useState, useEffect, useRef } from 'react';
import { CircularProgress, Alert, Box, Button, Checkbox, FormControlLabel } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLogisticsPageData } from '../../hooks/useStoreSelectors';
import ShipmentDetail from './ShipmentDetail';
import EstimateDetail from './EstimateDetail';
import DiagnosticInfo from '../DiagnosticInfo';
import ShipperAvatar from '../ShipperAvatar';
import { formatTargetDateRange, safeDateFormat } from '../../lib/utils/dateUtils';
import logger from '../../lib/utils/logger';
import { supabase } from '../../lib/supabase';
import useSupabaseStore from '../../store/useSupabaseStore';
import ChangeRequestModal, { ChangeRequestFormValues } from '../ChangeRequestModal';
import { motion } from 'motion/react';
import { slideInLeft } from '../../lib/motion';
import useMessagingUiStore from '../../store/messagingUiStore';
import type { QuoteWithDetails, ShipmentWithDetails } from '../../lib/supabase';
import useCurrency from '../../hooks/useCurrency';
import * as CsvExportModule from '../../../../shared/export/csv';
import { resolveOrganizationLogo } from '../../lib/organizationLogos';

type ItemType = 'shipment' | 'estimate';
type FilterType =
  | 'all'
  | 'active'
  | /* 'pending' | 'in_transit' | */ 'delivered'
  | /* 'draft' | */ 'cancelled'
  | 'estimates_in'
  | 'awaiting_estimates';
type TypeFilter = 'all' | 'shipments' | 'estimates';

const SHIPMENT_STATUS_FILTERS: FilterType[] = ['all', 'active', 'delivered', 'cancelled'];
const ESTIMATE_STATUS_FILTERS: FilterType[] = ['all', 'estimates_in', 'awaiting_estimates'];

const normalizeLabel = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractCompanyName = (partner: any, branchNetwork: any): string | null => {
  const candidates = [
    normalizeLabel(partner?.name),
    normalizeLabel(partner?.organization?.name),
    normalizeLabel(partner?.company?.name),
    normalizeLabel(branchNetwork?.companyName),
    normalizeLabel(branchNetwork?.company?.name),
  ];
  return candidates.find(Boolean) || null;
};

const extractBranchName = (
  branch: any,
  branchNetwork: any,
  fallbackCompanyName: string | null
): string | null => {
  const candidates = [
    normalizeLabel(branch?.branch_name),
    normalizeLabel(branch?.name),
    normalizeLabel(branchNetwork?.branchName),
    normalizeLabel(branchNetwork?.branch_name),
    normalizeLabel(branchNetwork?.displayName),
    normalizeLabel(branchNetwork?.display_name),
    normalizeLabel(branchNetwork?.branchLabel),
    normalizeLabel(branchNetwork?.branch_label),
  ];
  const result = candidates.find(Boolean) || null;
  if (!result) return null;
  if (fallbackCompanyName && result === fallbackCompanyName) {
    return null;
  }
  return result;
};

const collectUniqueUrls = (...urls: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  urls.forEach((entry) => {
    const normalized = normalizeLabel(entry);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  });
  return result;
};

interface UnifiedItem {
  id: string;
  type: ItemType;
  name: string;
  code: string;
  status: string;
  route: string;
  date: string;
  value?: number;
  thumbnail?: React.ReactNode;
  subType?: 'auction' | 'requested';
  bids?: number;
  lowestBid?: number;
  bidders?: Array<{
    id: string;
    name: string;
    abbreviation: string;
    brandColor: string;
    price: number;
    imageUrl?: string | null;
    fallbackImageUrl?: string | null;
    localLogoUrl?: string | null;
    remoteLogoUrl?: string | null;
    companyName?: string | null;
    branchName?: string | null;
    branchOrgId?: string | null;
  }>;
  originData?: any;
  artworkCount?: number;
  hasCounterOffer?: boolean;
  counterOfferAmount?: number;
  biddingDeadline?: string | null;
  autoCloseBidding?: boolean;
  quoteDetails?: QuoteWithDetails | null;
}

const makeItemKey = (item: { id: string; type: ItemType }) => `${item.type}:${item.id}`;

export const formatDeadlineLabel = (deadline?: string | null, autoClose?: boolean) => {
  if (!autoClose) return 'Manual close';
  if (!deadline) return 'Deadline not set';
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

export const isDeadlinePast = (deadline?: string | null, autoClose?: boolean) => {
  if (!autoClose || !deadline) return false;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
};

const LogisticsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    shipments,
    quotes,
    selectedItemId,
    selectedItemType,
    loading,
    error,
    currentOrg,
    initialLoading,
    selectUnifiedItem,
    branchNetworkAuthError,
  } = useLogisticsPageData();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const prevTypeFilterRef = useRef<TypeFilter>('all');
  const currentStatusOptions = typeFilter === 'estimates' ? ESTIMATE_STATUS_FILTERS : SHIPMENT_STATUS_FILTERS;

  useEffect(() => {
    if (!currentStatusOptions.includes(statusFilter)) {
      setStatusFilter('all');
    }
  }, [currentStatusOptions, statusFilter]);
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search') || '';
    setSearchTerm(prev => (prev === searchParam ? prev : searchParam));
  }, [location.search]);

  useEffect(() => {
    if (!selectedItemType || !selectedItemId) {
      return;
    }

    const desiredFilter: TypeFilter | null =
      selectedItemType === 'shipment'
        ? 'shipments'
        : selectedItemType === 'estimate'
        ? 'estimates'
        : null;

    if (!desiredFilter) {
      return;
    }

    setTypeFilter((current) => (current === desiredFilter ? current : desiredFilter));
  }, [selectedItemId, selectedItemType]);

  
  
  const openMessagingModal = useMessagingUiStore((state) => state.openForQuote);
  const { formatCurrency } = useCurrency();
  const [withdrawingQuoteId, setWithdrawingQuoteId] = useState<string | null>(null);
  const fetchQuotes = useSupabaseStore(state => state.fetchQuotes);
  const fetchShipments = useSupabaseStore(state => state.fetchShipments);
  const [cancellingShipmentId, setCancellingShipmentId] = useState<string | null>(null);
  const [reopeningShipmentId, setReopeningShipmentId] = useState<string | null>(null);
  const [requestingChangeForShipmentId, setRequestingChangeForShipmentId] = useState<string | null>(null);
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState<boolean>(false);
  const setBranchNetworkAuthError = useSupabaseStore(state => state.setBranchNetworkAuthError);

  const handleDismissBranchNetworkWarning = () => {
    setBranchNetworkAuthError(null);
  };

  const handleReauthenticate = () => {
    setBranchNetworkAuthError(null);
    navigate(`/auth?redirect=${encodeURIComponent('/dashboard/logistics')}`);
  };

  // Avoid spamming fetches when the user legitimately has zero records
  const initialFetchRequested = useRef(false);
  // Ensure data loads on direct reload/entry into logistics
  useEffect(() => {
    const needsShipments = shipments.length === 0;
    const needsQuotes = quotes.length === 0;
    if (!initialFetchRequested.current && (needsShipments || needsQuotes) && !initialLoading && !loading) {
      initialFetchRequested.current = true;
      if (needsShipments) fetchShipments();
      if (needsQuotes) fetchQuotes();
    }
  }, [shipments.length, quotes.length, initialLoading, loading, fetchShipments, fetchQuotes]);

  // Transform shipments and quotes into unified format
  // Build a set of quote IDs that have a "truly active" shipment (status not 'pending_approval').
  // Quotes with shipments in 'pending_approval' should still appear as estimates (reopened for bidding).
  const activeShipmentQuoteIdSet = new Set<string>(
    shipments
      .filter((s: any) => Boolean(s?.quote_id) && s?.status !== 'pending_approval')
      .map((s: any) => s.quote_id as string)
  );
  const deriveInitials = (label: string) => {
    const trimmed = label?.trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) {
      return parts[0].slice(0, 3).toUpperCase();
    }
    return parts.map((part) => part[0]?.toUpperCase() || '').join('').slice(0, 3) || '?';
  };

  const unifiedItems: UnifiedItem[] = [
    // Transform shipments
    ...shipments.map(shipment => {
      const relatedQuote = quotes.find(q => q.id === shipment.quote_id);
      const counterBid = relatedQuote?.bids?.find((b: any) => b?.status === 'counter_offer' || (b?.status === 'needs_confirmation' && Boolean(b?.needs_confirmation_at)));
      const acceptedBid = relatedQuote?.bids?.find((b: any) => b?.status === 'accepted');
      const primaryBid = acceptedBid || relatedQuote?.bids?.[0] || null;
      const branch = primaryBid?.branch_org || null;
      const branchNetwork = (primaryBid as any)?.branch_network || null;
      const partner = primaryBid?.logistics_partner || null;
      const partnerOrg = partner?.organization || null;
      const partnerCompanyName = extractCompanyName(partner, branchNetwork);
      const branchLabel = extractBranchName(branch, branchNetwork, partnerCompanyName);
      const fallbackLogisticsName = normalizeLabel(shipment.logistics_partner);
      const partnerName = partnerCompanyName || fallbackLogisticsName || null;
      const displayName = branchLabel || partnerName || shipment.logistics_partner || 'Shipper';
      const abbreviation = deriveInitials(displayName);
      const brandColor = partner?.brand_color || '#58517E';
      const branchLogoUrl = normalizeLabel(branchNetwork?.logoUrl);
      const remoteLogo =
        branchLogoUrl ||
        branch?.img_url ||
        partnerOrg?.img_url ||
        (partner as any)?.logo_url ||
        null;
      const {
        primaryUrl: shipmentResolvedPrimaryLogo,
        localUrl: shipmentLogoLocalUrl,
        remoteUrl: shipmentLogoRemoteUrl,
      } = resolveOrganizationLogo(
        [
          branchLabel,
          branchNetwork?.displayName ?? null,
          branchNetwork?.companyName ?? null,
          partnerOrg?.name ?? null,
          partnerName,
        ],
        remoteLogo
      );
      const [shipmentLogoUrl, shipmentFallbackLogoUrl] = collectUniqueUrls(
        branchLogoUrl,
        shipmentResolvedPrimaryLogo,
        shipmentLogoLocalUrl,
        shipmentLogoRemoteUrl
      );

      const shipmentThumbnail = (
        <ShipperAvatar
          name={displayName}
          abbreviation={abbreviation}
          brandColor={brandColor}
          imageUrl={shipmentLogoUrl ?? undefined}
          fallbackImageUrl={shipmentFallbackLogoUrl ?? undefined}
          size={48}
        />
      );

      return {
        id: shipment.id,
        type: 'shipment' as ItemType,
        name: shipment.name,
        code: shipment.client_reference ? `REF: ${shipment.client_reference}` : `REF: ${shipment.code}`,
        status: shipment.status,
        route: `${shipment.origin?.name || 'Origin TBD'} → ${shipment.destination?.name || 'Destination TBD'}`,
        date: shipment.estimated_arrival || 'TBD',
        thumbnail: shipmentThumbnail,
        originData: shipment,
        hasCounterOffer: Boolean(counterBid),
        counterOfferAmount: counterBid?.amount,
        quoteDetails: relatedQuote || null,
      } as UnifiedItem;
    }),
    // Transform quotes (hide completed quotes and those that already have an active shipment)
    ...quotes
      .filter(quote => quote.status !== 'completed' && !activeShipmentQuoteIdSet.has(quote.id))
      .map(quote => {
      const artworkCount = Array.isArray(quote.quote_artworks) ? quote.quote_artworks.length : 0;
      const rawBids = Array.isArray(quote.bids) ? quote.bids : [];
      const activeBids = rawBids.filter((bid: any) => {
        const status = typeof bid?.status === 'string' ? bid.status : null;
        return status !== 'withdrawn';
      });
      const bidders = activeBids.map(bid => {
        const branch = bid.branch_org || null;
        const branchNetwork = (bid as any).branch_network || null;
        const partner = bid.logistics_partner || {};
        const partnerOrg = partner.organization || null;
        const partnerCompanyName = extractCompanyName(partner, branchNetwork);
        const branchLabel = extractBranchName(branch, branchNetwork, partnerCompanyName);
        const primaryName = partnerCompanyName || branchLabel || 'Unknown shipper';
        const abbreviationSource = (partner?.abbreviation && partner.abbreviation.trim()) || primaryName;
        const abbreviation = deriveInitials(abbreviationSource || '');
        const branchLogoUrl = normalizeLabel(branchNetwork?.logoUrl);
        const remoteLogo =
          branchLogoUrl ||
          branch?.img_url ||
          partnerOrg?.img_url ||
          (partner as any)?.logo_url ||
          null;
        const { primaryUrl, localUrl, remoteUrl } = resolveOrganizationLogo(
          [
            branchLabel,
            branchNetwork?.displayName ?? null,
            branchNetwork?.companyName ?? null,
            partnerOrg?.name ?? null,
            partnerCompanyName,
          ],
          remoteLogo
        );
        const [primaryLogoUrl, fallbackLogoUrl] = collectUniqueUrls(
          branchLogoUrl,
          primaryUrl,
          localUrl,
          remoteUrl
        );

        return {
          id: bid.id,
          name: primaryName,
          abbreviation,
          brandColor: partner?.brand_color || '#666666',
          price: bid.amount,
          imageUrl: primaryLogoUrl ?? null,
          fallbackImageUrl: fallbackLogoUrl ?? null,
          localLogoUrl: localUrl,
          remoteLogoUrl: remoteUrl,
          companyName: partnerCompanyName,
          branchName: branchLabel,
          branchOrgId: branch?.id || (bid as any).branch_org_id || null,
        };
      });

      const firstBidder = bidders[0] || null;
      const activeBidAmounts = activeBids
        .map((bid: any) => bid?.amount)
        .filter((amount: any): amount is number => typeof amount === 'number');
      const thumbnail = firstBidder ? (
        <ShipperAvatar
          name={firstBidder.companyName || firstBidder.name}
          abbreviation={firstBidder.abbreviation}
          brandColor={firstBidder.brandColor}
          imageUrl={firstBidder.imageUrl ?? undefined}
          fallbackImageUrl={firstBidder.fallbackImageUrl ?? undefined}
          size={48}
        />
      ) : (
        <div
          className="thumb"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-magenta) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '20px',
            fontWeight: 'bold'
          }}
          aria-label={quote.type === 'auction' ? 'Auction quote' : 'Requested quote'}
        >
          {quote.type === 'auction' ? 'A' : 'Q'}
        </div>
      );

      return {
        id: quote.id,
        type: 'estimate' as ItemType,
        name: quote.type.toUpperCase(),
        code: quote.client_reference ? `REF: ${quote.client_reference}` : `REF: ${quote.title}`,
        status: quote.status,
        route: quote.route || `${quote.origin?.name || 'TBD'} → ${quote.destination?.name || 'TBD'}`,
        date: formatTargetDateRange(quote.target_date_start, quote.target_date_end),
        value: quote.value || 0,
        artworkCount,
        biddingDeadline: quote.bidding_deadline,
        autoCloseBidding: quote.auto_close_bidding ?? true,
        galleryOrgId: quote.owner_org?.id || quote.owner_org_id || null,
        shipmentId: quote.shipment_id || null,
        thumbnail,
        subType: quote.type,
        bids: activeBids.length,
        lowestBid: activeBidAmounts.length > 0 ? Math.min(...activeBidAmounts) : undefined,
        bidders,
        originData: quote
      };
  })
  ];

  useEffect(() => {
    const knownKeys = new Set(unifiedItems.map((item) => makeItemKey(item)));
    setSelectedItemKeys((prev) => {
      const next = prev.filter((key) => knownKeys.has(key));
      return next.length === prev.length ? prev : next;
    });
  }, [unifiedItems]);

  const getEstimateBidCount = (item: UnifiedItem) => (typeof item.bids === 'number' ? item.bids : 0);

  const matchesStatusFilter = (item: UnifiedItem, filter: FilterType) => {
    if (filter === 'all') return true;
    if (filter === 'estimates_in') {
      return item.type === 'estimate' && getEstimateBidCount(item) > 0;
    }
    if (filter === 'awaiting_estimates') {
      return item.type === 'estimate' && getEstimateBidCount(item) === 0;
    }
    if (item.type !== 'shipment') {
      return false;
    }
    return item.status === filter;
  };

  // Filter items
  const filteredItems = unifiedItems.filter(item => {
    // Type filter
    if (typeFilter !== 'all' && 
        ((typeFilter === 'shipments' && item.type !== 'shipment') ||
         (typeFilter === 'estimates' && item.type !== 'estimate'))) {
      return false;
    }

    // Status filter
    if (!matchesStatusFilter(item, statusFilter)) {
      return false;
    }

    // Search filter
    const searchLower = searchTerm.toLowerCase();
    return item.name.toLowerCase().includes(searchLower) || 
           item.code.toLowerCase().includes(searchLower) ||
           item.route.toLowerCase().includes(searchLower);
  });

  useEffect(() => {
    const prevTypeFilter = prevTypeFilterRef.current;
    if (typeFilter !== prevTypeFilter && (typeFilter === 'shipments' || typeFilter === 'estimates')) {
      const targetType: ItemType = typeFilter === 'shipments' ? 'shipment' : 'estimate';
      const firstVisible = filteredItems.find((item) => item.type === targetType);
      const fallback = unifiedItems.find((item) => item.type === targetType);
      const candidate = firstVisible || fallback || null;

      if (candidate) {
        if (selectedItemId !== candidate.id || selectedItemType !== candidate.type) {
          selectUnifiedItem(candidate.id, candidate.type);
        }
      } else if (selectedItemId || selectedItemType) {
        selectUnifiedItem(null, null);
      }
    }

    prevTypeFilterRef.current = typeFilter;
  }, [typeFilter, filteredItems, unifiedItems, selectedItemId, selectedItemType, selectUnifiedItem]);

  const visibleItemKeys = filteredItems.map((item) => makeItemKey(item));
  const selectedItems = unifiedItems.filter((item) =>
    selectedItemKeys.includes(makeItemKey(item))
  );

  const allVisibleSelected =
    filteredItems.length > 0 &&
    visibleItemKeys.every((key) => selectedItemKeys.includes(key));

  const someVisibleSelected =
    filteredItems.length > 0 &&
    visibleItemKeys.some((key) => selectedItemKeys.includes(key));

  // Get selected item
  const selectedItem = unifiedItems.find(item => 
    item.id === selectedItemId && item.type === selectedItemType
  );

  // Debug: Log when LogisticsPage has an estimate selected
  if (selectedItem && selectedItem.type === 'estimate') {
    logger.debug('LogisticsPage', `Selected estimate - Status: ${selectedItem.status}, Estimate count: ${selectedItem.bids || 0}`);
  }

  const handleItemClick = (item: UnifiedItem) => {
    selectUnifiedItem(item.id, item.type);
  };

  const toggleItemSelection = (item: UnifiedItem, explicitlyChecked?: boolean) => {
    const key = makeItemKey(item);
    setSelectedItemKeys((prev) => {
      const next = new Set(prev);
      const shouldSelect =
        typeof explicitlyChecked === 'boolean' ? explicitlyChecked : !next.has(key);
      if (shouldSelect) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return Array.from(next);
    });
  };

  const handleToggleSelectAllVisible = (checked: boolean) => {
    setSelectedItemKeys((prev) => {
      const next = new Set(prev);
      visibleItemKeys.forEach((key) => {
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return Array.from(next);
    });
  };

  const clearItemSelection = () => {
    setSelectedItemKeys([]);
  };

  const formatDateForCsv = (value: string | null | undefined) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const CSV_HEADERS = [
    'Record Type',
    'Reference Code',
    'Title / Name',
    'Status',
    'Route',
    'Key Date',
    'Declared Value',
    'Contact Organization',
    'Contact Name',
    'Contact Role',
    'Contact Email',
    'Contact Phone',
    'Contact Address',
    'Client Segment',
    'Artwork Identifiers',
    'Artwork Titles',
    'Artists / Authors',
    'Materials / Mediums',
    'Dimensions',
    'Declared Artwork Values',
    'Packing Types',
    'Artwork Images',
    'Condition Report Included',
    'Special Handling Requirements',
    'Customs Notes',
    'Insurance Required',
    'Insurance Type',
    'Services Requested',
    'Estimate Type',
    'Shippers Invited',
    'Shipper 1 Cost',
    'Shipper 2 Cost',
    'Shipper 3 Cost',
    'CO2 Estimate (kg)',
    'TIVE Tracking',
    'Damage Claim Filed',
    'Shipment Purpose',
    'Selected Shipper',
    'Shipment Line Items',
    'Shipment Cost (Accepted Bid)',
    'Shipment Route Details',
    'Shipment Transport Method',
    'Carrier / Agent',
    'Shipping Agents',
    'Destination Contact'
  ];

  type ArtworkLike = {
    id?: string | null;
    quote_artwork_id?: string | null;
    name?: string | null;
    artist_name?: string | null;
    medium?: string | null;
    dimensions?: string | null;
    weight?: string | null;
    declared_value?: number | null;
    crating?: string | null;
    image_url?: string | null;
    tariff_code?: string | null;
    country_of_origin?: string | null;
    export_license_required?: boolean | null;
    special_requirements?: unknown;
  };

  const formatCurrencyOrEmpty = (value?: number | null) => {
    if (typeof value !== 'number') return '';
    return formatCurrency(value);
  };

  const yesNo = (value: boolean | null | undefined) => {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return '';
  };

  const flattenRequirementValues = (input: unknown, keyPrefix?: string): string[] => {
    if (input === null || input === undefined) {
      return [];
    }
    if (Array.isArray(input)) {
      return input.flatMap((entry) => flattenRequirementValues(entry, keyPrefix));
    }
    if (typeof input === 'object') {
      return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) =>
        flattenRequirementValues(value, key)
      );
    }
    if (typeof input === 'boolean') {
      if (!input) return [];
      return [keyPrefix || 'Requirement'];
    }
    const text = String(input).trim();
    if (!text) return [];
    return keyPrefix ? [`${keyPrefix}: ${text}`] : [text];
  };

  const collectSpecialHandlingEntries = (shipment?: ShipmentWithDetails | null) => {
    if (!shipment) return [];
    const entries: string[] = [];
    const pushValue = (value: string | null | undefined) => {
      if (!value) return;
      const trimmed = value.trim();
      if (trimmed.length) {
        entries.push(trimmed);
      }
    };
    const collect = (value: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => collect(entry));
        return;
      }
      pushValue(typeof value === 'string' ? value : String(value));
    };
    collect(shipment.special_services || []);
    collect(shipment.delivery_requirements || []);
    collect(shipment.access_requirements || []);
    collect(shipment.safety_security_requirements || []);
    collect(shipment.condition_check_requirements || []);
    pushValue(shipment.packing_requirements || '');
    return Array.from(new Set(entries));
  };

  const formatServicesRequested = (quote?: QuoteWithDetails | null, shipment?: ShipmentWithDetails | null) => {
    const values = [
      ...flattenRequirementValues(quote?.requirements ?? null),
      ...flattenRequirementValues(quote?.delivery_specifics ?? null),
      ...collectSpecialHandlingEntries(shipment)
    ].filter(Boolean);
    return Array.from(new Set(values)).join('; ');
  };

  const formatInvitedShippers = (quote?: QuoteWithDetails | null) => {
    if (!quote?.quote_invites) return '';
    const names = quote.quote_invites
      .map(
        (invite) =>
          invite.logistics_partner?.name ||
          invite.logistics_partner?.abbreviation ||
          invite.logistics_partner_id ||
          ''
      )
      .filter((value): value is string => Boolean(value));
    return names.join('; ');
  };

  const getSortedBidSnapshots = (quote?: QuoteWithDetails | null) =>
    (quote?.bids ?? [])
      .filter((bid): bid is QuoteWithDetails['bids'][number] => typeof bid?.amount === 'number')
      .sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));

  const formatTopBidCosts = (quote?: QuoteWithDetails | null): [string, string, string] => {
    const sorted = getSortedBidSnapshots(quote);
    const formatted = sorted.slice(0, 3).map((bid) => formatCurrency(bid.amount ?? 0));
    return [formatted[0] ?? '', formatted[1] ?? '', formatted[2] ?? ''];
  };

  const formatLineItems = (bid?: QuoteWithDetails['bids'][number] | null) => {
    if (!bid?.line_items || bid.line_items.length === 0) {
      return '';
    }
    return bid.line_items
      .map((line) => {
        const descriptionArray = Array.isArray(line.description)
          ? line.description.filter((entry): entry is string => Boolean(entry))
          : line.description
            ? [line.description]
            : [];
        const description = descriptionArray.join(' / ');
        const amount = typeof line.unit_price === 'number' ? ` ${formatCurrency(line.unit_price)}` : '';
        return `${line.category || 'Line Item'}${description ? `: ${description}` : ''}${amount}`;
      })
      .join('; ');
  };

  const formatArtworkField = (
    artworks: ArtworkLike[] | undefined,
    selector: (artwork: ArtworkLike) => string | null | undefined
  ) => {
    if (!artworks || artworks.length === 0) {
      return '';
    }
    const values = artworks
      .map((artwork) => {
        const selected = selector(artwork);
        if (typeof selected !== 'string') {
          return selected ? String(selected) : '';
        }
        return selected;
      })
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    return values.join('; ');
  };

  const buildCustomsNotes = (artworks?: ArtworkLike[]) => {
    if (!artworks || artworks.length === 0) {
      return '';
    }
    const notes = new Set<string>();
    artworks.forEach((artwork) => {
      if (artwork.tariff_code) {
        notes.add(`Tariff ${artwork.tariff_code}`);
      }
      if (artwork.country_of_origin) {
        notes.add(`Origin ${artwork.country_of_origin}`);
      }
      if (artwork.export_license_required) {
        notes.add('Export license required');
      }
    });
    return Array.from(notes).join('; ');
  };

  const buildSpecialHandling = (
    shipment?: ShipmentWithDetails | null,
    quote?: QuoteWithDetails | null
  ) => {
    const entries = new Set<string>(collectSpecialHandlingEntries(shipment));
    flattenRequirementValues(quote?.delivery_specifics ?? null).forEach((entry) => {
      const trimmed = entry.trim();
      if (trimmed.length) {
        entries.add(trimmed);
      }
    });
    return Array.from(entries).join('; ');
  };

  const getAcceptedBid = (quote?: QuoteWithDetails | null) =>
    (quote?.bids ?? []).find((bid) => bid?.status === 'accepted') ?? null;

  const buildDestinationContact = (
    destination?: { contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null }
  ) => {
    if (!destination) return '';
    const parts = [
      destination.contact_name?.trim() || '',
      destination.contact_email?.trim() || '',
      destination.contact_phone?.trim() || ''
    ].filter(Boolean);
    return parts.join(' / ');
  };

  const buildCsvRowForItem = (item: UnifiedItem): string[] => {
    const shipment = item.type === 'shipment' ? (item.originData as ShipmentWithDetails | undefined) : undefined;
    const quote =
      item.type === 'shipment'
        ? ((item.quoteDetails as QuoteWithDetails | null) ?? null)
        : ((item.originData as QuoteWithDetails | null) ?? null);

    const originLocation = shipment?.origin ?? quote?.origin ?? null;
    const destinationLocation = shipment?.destination ?? quote?.destination ?? null;
    const shipmentArtworks = shipment?.artworks ?? [];
    const quoteArtworks = quote?.quote_artworks ?? [];
    const artworks: ArtworkLike[] =
      shipmentArtworks.length > 0 ? shipmentArtworks : quoteArtworks;
    const acceptedBid = getAcceptedBid(quote);
    const [shipperCost1, shipperCost2, shipperCost3] = formatTopBidCosts(quote);

    const contactOrganization = quote?.owner_org?.name || currentOrg?.name || '';
    const clientSegment = quote?.owner_org?.type || currentOrg?.type || '';
    const declaredValue =
      item.type === 'shipment'
        ? formatCurrencyOrEmpty(shipment?.total_value ?? null)
        : formatCurrencyOrEmpty(quote?.value ?? null);

    const conditionReport = shipment
      ? yesNo(
          Boolean(
            shipment.condition_report ||
              (shipment.documents || []).some(
                (doc) => typeof doc?.kind === 'string' && doc.kind.toLowerCase().includes('condition')
              )
          )
        )
      : '';

    const insuranceType = shipment?.insurance_type || '';
    const insuranceRequired = shipment ? yesNo(Boolean(insuranceType && insuranceType !== 'none')) : '';
    const servicesRequested = formatServicesRequested(quote, shipment);
    const specialHandling = buildSpecialHandling(shipment, quote);
    const customsNotes = buildCustomsNotes(artworks);
    const destinationContact = buildDestinationContact(destinationLocation || undefined);

    const co2Estimate = (() => {
      if (typeof shipment?.carbon_estimate === 'number') {
        return shipment.carbon_estimate.toString();
      }
      if (typeof acceptedBid?.co2_estimate === 'number') {
        return acceptedBid.co2_estimate.toString();
      }
      const sorted = getSortedBidSnapshots(quote)
        .map((bid) => bid.co2_estimate)
        .filter((value): value is number => typeof value === 'number');
      return sorted.length ? sorted[0].toString() : '';
    })();

    const selectedShipper = shipment
      ? acceptedBid?.logistics_partner?.name ||
        shipment.logistics_partner ||
        acceptedBid?.branch_org?.name ||
        ''
      : '';

    const shipmentLineItems = formatLineItems(acceptedBid);
    const shipmentCost = acceptedBid?.amount ? formatCurrency(acceptedBid.amount) : '';
    const routeDetails =
      originLocation?.address_full || destinationLocation?.address_full
        ? `${originLocation?.address_full || ''} → ${destinationLocation?.address_full || ''}`
        : '';
    const transportMethod = shipment?.transport_method || '';
    const carrierInfo = shipment?.logistics_partner || selectedShipper;
    const shippingAgents =
      acceptedBid?.branch_org?.name ||
      acceptedBid?.logistics_partner?.name ||
      (item.type === 'estimate' ? formatInvitedShippers(quote) : '');

    const recordTypeLabel = item.type === 'shipment' ? 'Shipment' : 'Estimate';
    const title = item.type === 'shipment' ? shipment?.name || item.name : quote?.title || item.name;
    const keyDate =
      item.type === 'shipment'
        ? formatDateForCsv(shipment?.estimated_arrival || shipment?.ship_date || item.date)
        : formatDateForCsv(quote?.bidding_deadline || item.biddingDeadline || null);

    return [
      recordTypeLabel,
      item.code,
      title,
      item.status,
      item.route,
      keyDate,
      declaredValue,
      contactOrganization,
      originLocation?.contact_name || '',
      '',
      originLocation?.contact_email || '',
      originLocation?.contact_phone || '',
      originLocation?.address_full || '',
      clientSegment || '',
      formatArtworkField(artworks, (art) => art.quote_artwork_id || art.id || ''),
      formatArtworkField(artworks, (art) => art.name || ''),
      formatArtworkField(artworks, (art) => art.artist_name || ''),
      formatArtworkField(artworks, (art) => art.medium || ''),
      formatArtworkField(artworks, (art) => art.dimensions || art.weight || ''),
      formatArtworkField(artworks, (art) =>
        typeof art.declared_value === 'number' ? formatCurrency(art.declared_value) : ''
      ),
      formatArtworkField(artworks, (art) => art.crating || ''),
      formatArtworkField(artworks, (art) => art.image_url || ''),
      conditionReport,
      specialHandling,
      customsNotes,
      insuranceRequired,
      insuranceType,
      servicesRequested,
      quote ? (quote.type === 'auction' ? 'Competitive' : 'Direct') : '',
      formatInvitedShippers(quote),
      shipperCost1,
      shipperCost2,
      shipperCost3,
      co2Estimate,
      '',
      '',
      '',
      selectedShipper,
      shipmentLineItems,
      shipmentCost,
      routeDetails,
      transportMethod,
      carrierInfo,
      shippingAgents,
      destinationContact
    ];
  };

  const handleExportSelectedItems = () => {
    if (selectedItems.length === 0) {
      return;
    }

    const rows = selectedItems.map(buildCsvRowForItem);

    const today = new Date().toISOString().slice(0, 10);
    resolvedDownloadCsv(`gallery-logistics-${today}.csv`, CSV_HEADERS, rows);
  };

  const handleMessageBidder = (bidId: string, item: UnifiedItem) => {
    logger.debug('LogisticsPage', 'handleMessageBidder called');
    
    if (item.type !== 'estimate' || !item.bidders) {
    console.warn('⚠️ Item is not an estimate or has no bidders:', item);
      return;
    }
    
    const bidder = item.bidders.find(b => b.id === bidId);
    if (!bidder) {
      console.warn('⚠️ Bidder not found for bidId:', bidId, 'in bidders:', item.bidders);
      return;
    }
    
    logger.debug('LogisticsPage', 'Opening messaging modal for bidder');

    const companyName = bidder.companyName || bidder.name;
    const branchLabel = bidder.branchName;
    const bidderDisplayName = companyName && branchLabel && branchLabel !== companyName
      ? `${companyName} (${branchLabel})`
      : companyName || branchLabel || bidder.name;

    openMessagingModal({
      quoteId: item.id,
      quoteTitle: item.code,
      quoteRoute: item.route,
      quoteValue: item.value || 0,
      targetDateStart: item.originData?.target_date_start || null,
      targetDateEnd: item.originData?.target_date_end || null,
      quoteType: (item.subType as 'auction' | 'requested') || 'requested',
      bidderName: bidderDisplayName,
      bidderAbbreviation: bidder.abbreviation,
      bidderColor: bidder.brandColor || '#8412ff',
      bidPrice: bidder.price,
      shipmentId: item.shipmentId || null,
      shipperBranchOrgId: bidder.branchOrgId || null,
      galleryBranchOrgId: item.galleryOrgId || null,
    }).catch((launchError) => {
      console.error('[LogisticsPage] failed to open messaging modal', launchError);
    });
  };

  const handleWithdrawQuote = async (quoteId: string, reason?: string) => {
    try {
      setWithdrawingQuoteId(quoteId);
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');

      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
      const resp = await fetch(`${API_BASE_URL}/api/withdraw-quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ p_quote_id: quoteId, ...(reason ? { p_reason: reason } : {}) }),
      });

      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || 'Withdraw failed');
      }

      logger.success('LogisticsPage', 'Quote withdrawn');
      await fetchQuotes();
    } catch (err) {
      console.error('Error withdrawing quote:', err);
      alert(`Failed to withdraw quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setWithdrawingQuoteId(null);
    }
  };

  const handleCancelShipment = async (shipmentId: string, reason?: string) => {
    try {
      setCancellingShipmentId(shipmentId);
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');

      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
      const resp = await fetch(`${API_BASE_URL}/api/cancel-shipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ p_shipment_id: shipmentId, ...(reason ? { p_reason: reason } : {}) }),
      });

      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || 'Cancel failed');
      }

      logger.success('LogisticsPage', 'Shipment cancelled');
      await fetchShipments();
    } catch (err) {
      console.error('Error cancelling shipment:', err);
      alert(`Failed to cancel shipment: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCancellingShipmentId(null);
    }
  };

  const handleReopenShipmentForBidding = async (shipmentId: string) => {
    try {
      setReopeningShipmentId(shipmentId);
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');

      // Ask for a new bid deadline (default to 7 days from today)
      const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const input = window.prompt('Enter new Estimate deadline (YYYY-MM-DD)', defaultDate);
      if (!input) {
        return; // user cancelled
      }

      // Send end-of-day UTC for the provided date
      const p_new_deadline = `${input}T23:59:59Z`;

      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
      const resp = await fetch(`${API_BASE_URL}/api/reopen-shipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ p_shipment_id: shipmentId, p_new_deadline }),
      });

      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !json?.ok) {
        throw new Error(
          (json?.error && (json.error.message || json.error)) || 'Reopen estimate window failed'
        );
      }

      logger.success('LogisticsPage', 'Shipment reopened for estimates');
      await fetchShipments();
    } catch (err) {
      console.error('Error reopening shipment for bidding:', err);
      alert(`Error reopening shipment for bidding: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setReopeningShipmentId(null);
    }
  };

  const handleOpenChangeRequest = (shipmentId: string) => {
    setRequestingChangeForShipmentId(shipmentId);
  };

  const handleSubmitChangeRequest = async (shipmentId: string, values: ChangeRequestFormValues) => {
    try {
      setSubmittingChangeRequest(true);
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');

      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
      const resp = await fetch(`${API_BASE_URL}/api/create-change-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          p_shipment_id: shipmentId,
          p_change_type: 'scope',
          p_proposed_ship_date: values.proposed_ship_date || null,
          p_proposed_delivery_date: values.proposed_delivery_date || null,
          p_notes: values.notes || null,
          p_reason: values.reason || null,
          p_proposal: values.proposal || null,
        }),
      });

      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || 'Create change request failed');
      }

      logger.success('LogisticsPage', 'Change request submitted');
      await fetchShipments();
    } catch (err) {
      console.error('Error creating change request:', err);
      alert(`Failed to create change request: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSubmittingChangeRequest(false);
      setRequestingChangeForShipmentId(null);
    }
  };

  const getStatusTag = (status: string) => {
    const statusColorMap: Record<string, string> = {
      // Shipment statuses
      'delivered': 'green',
      'in_transit': 'yellow',
      'security_check': 'blue',
      'artwork_collected': 'purple',
      'local_delivery': 'magenta',
      // Quote statuses
      'active': 'green',
      'completed': 'blue',
      'draft': 'yellow',
      'cancelled': 'gray',
      // Default
      'pending': 'gray'
    };
    
    const color = statusColorMap[status] || 'gray';
    return `tag ${color}`;
  };

  const getStatusFilterColors = (status: string) => {
    const statusColorMap: Record<string, { border: string; background: string; color: string }> = {
      'all': { border: '#8412ff', background: 'rgba(132, 18, 255, 0.1)', color: '#8412ff' },
      'delivered': { border: '#0dab71', background: 'rgba(13, 171, 113, 0.1)', color: '#0dab71' },
      'active': { border: '#0dab71', background: 'rgba(13, 171, 113, 0.1)', color: '#0dab71' },
      // 'in_transit': { border: '#E9932D', background: 'rgba(233, 147, 45, 0.1)', color: '#E9932D' },
      // 'pending': { border: '#58517E', background: 'rgba(88, 81, 126, 0.1)', color: '#58517E' },
      'security_check': { border: '#2378da', background: 'rgba(35, 120, 218, 0.1)', color: '#2378da' },
      // 'completed' removed; replaced by 'delivered' for shipment completion filter
      // 'draft': { border: '#E9932D', background: 'rgba(233, 147, 45, 0.1)', color: '#E9932D' },
      'cancelled': { border: '#58517E', background: 'rgba(88, 81, 126, 0.1)', color: '#58517E' },
      'artwork_collected': { border: '#8412ff', background: 'rgba(132, 18, 255, 0.1)', color: '#8412ff' },
      'local_delivery': { border: '#ff4081', background: 'rgba(255, 64, 129, 0.1)', color: '#ff4081' },
      'estimates_in': { border: '#21725e', background: 'rgba(33, 114, 94, 0.12)', color: '#21725e' },
      'awaiting_estimates': { border: '#E9932D', background: 'rgba(233, 147, 45, 0.12)', color: '#E9932D' }
    };
    
    return statusColorMap[status] || statusColorMap['all'];
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  // Title-case labels for filter buttons (e.g., 'delivered' -> 'Delivered')
  const formatStatusLabel = (status: FilterType) => {
    const customLabels: Partial<Record<FilterType, string>> = {
      estimates_in: 'Received',
      awaiting_estimates: 'Awaiting'
    };

    if (customLabels[status]) {
      return customLabels[status] as string;
    }

    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString || dateString === 'TBD') return 'TBD';
    // Check if it's already formatted (for quotes) - handle various dash types
    if (dateString.includes(' - ') || dateString.includes(' – ') || dateString.includes(' — ') || dateString.includes(',')) {
      return dateString;
    }
    // Format date for shipments using safe date parsing
    return safeDateFormat(dateString, 'TBD');
  };

  useEffect(() => {
    const orgId = currentOrg?.id ?? null;
    logger.debug(
      'LogisticsPage',
      `State update: initialLoading=${initialLoading}, loading=${loading}, org=${orgId}, shipments=${shipments.length}, quotes=${quotes.length}, selected=${selectedItemId ? `${selectedItemType}:${selectedItemId}` : 'none'}`
    );
  }, [currentOrg?.id, initialLoading, loading, shipments.length, quotes.length, selectedItemId, selectedItemType]);

  useEffect(() => {
    if (currentOrg) {
      logger.debug('LogisticsPage', `Using preloaded data - shipments: ${shipments.length}, quotes: ${quotes.length}`);
    }
  }, [currentOrg, shipments.length, quotes.length]);

  if (initialLoading) {
    logger.debug('LogisticsPage', 'Rendering initial loading spinner');
    return (
      <div className="main-wrap">
        <div className="main-panel">
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <CircularProgress />
          </Box>
        </div>
      </div>
    );
  }

  if (error) {
    logger.error('LogisticsPage', 'Rendering error state', error);
    return (
      <div className="main-wrap">
        <div className="main-panel">
          <Alert severity="error" sx={{ m: 2 }}>
            Error loading logistics data: {error}
          </Alert>
          <DiagnosticInfo />
        </div>
      </div>
    );
  }

  if (!currentOrg) {
    logger.debug('LogisticsPage', 'Rendering empty organization prompt');
    if (initialLoading) {
      return (
        <div className="main-wrap">
          <div className="main-panel">
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
              <CircularProgress />
            </Box>
          </div>
        </div>
      );
    }

    return (
      <div className="main-wrap">
        <div className="main-panel">
          <Alert severity="info" sx={{ m: 2 }}>
            Please select an organization to view logistics.
          </Alert>
          <DiagnosticInfo />
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrap">
      <div className="main-panel main-panel--split">
        <header className="header">
          <div className="header-row">
            <div>
              <h1 className="header-title">Logistics</h1>
              <p className="header-subtitle">
                {currentOrg?.name ? `${currentOrg.name} · Shipments & estimates` : 'Shipments & estimates'}
              </p>
            </div>
          </div>
        </header>
        {branchNetworkAuthError && (
          <Alert
            severity="warning"
            sx={{ mb: 2, alignSelf: 'stretch' }}
            onClose={handleDismissBranchNetworkWarning}
            action={
              <Button color="inherit" size="small" onClick={handleReauthenticate}>
                Re-authenticate
              </Button>
            }
          >
            {branchNetworkAuthError}
          </Alert>
        )}
        <div className="main-panel__split">
          <motion.div
            className="card-stack shipment-list-column"
            initial="hidden"
            animate="show"
            variants={slideInLeft}
            style={{ willChange: 'transform' }}
          >
          <div className="shipment-list-header">
            {/* Type filters - moved above search */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-start', marginBottom: '16px' }}>
              {(['all', 'shipments', 'estimates'] as TypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  style={{
                    padding: type === 'all' ? '10px 20px' : '12px 24px',
                    borderRadius: type === 'all' ? '20px' : '24px',
                    border: typeFilter === type ? '2px solid #8412ff' : '1px solid #e9eaeb',
                    background: typeFilter === type ? 'rgba(132, 18, 255, 0.1)' : '#ffffff',
                    color: typeFilter === type ? '#8412ff' : '#58517E',
                    cursor: 'pointer',
                    fontSize: type === 'all' ? '13px' : '15px',
                    fontWeight: type === 'all' ? 600 : 700,
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                    minWidth: type === 'all' ? '70px' : '90px',
                    letterSpacing: type === 'all' ? '0.2px' : '0.3px',
                    boxShadow: typeFilter === type ? '0 2px 8px rgba(132, 18, 255, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseEnter={(e) => {
                    if (typeFilter !== type) {
                      e.currentTarget.style.background = 'rgba(132, 18, 255, 0.05)';
                      e.currentTarget.style.borderColor = '#c4b5fd';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (typeFilter !== type) {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.borderColor = '#e9eaeb';
                    }
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <input 
              type="text" 
              placeholder="Search logistics..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            {/* Status filters - made bigger */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: '16px' }}>
              {currentStatusOptions.map((status) => {
                const isSelected = statusFilter === status;
                const statusColors = getStatusFilterColors(status);
                
                return (
                  <button
                    type="button"
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '18px',
                      border: isSelected ? `2px solid ${statusColors.border}` : '1px solid #e9eaeb',
                      background: isSelected ? statusColors.background : '#ffffff',
                      color: isSelected ? statusColors.color : 'var(--color-text-muted)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s ease',
                      minWidth: '70px',
                      letterSpacing: '0.2px'
                    }}
                    aria-pressed={isSelected}
                    aria-label={`Filter by ${formatStatusLabel(status)}`}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = `${statusColors.background}`;
                        e.currentTarget.style.borderColor = statusColors.border;
                        e.currentTarget.style.color = statusColors.color;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#ffffff';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-text-muted)';
                      }
                    }}
                  >
                    {formatStatusLabel(status)}
                  </button>
                );
              })}
            </div>
          </div>
          
          {filteredItems.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '4px 0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={allVisibleSelected}
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      onChange={(event) => handleToggleSelectAllVisible(event.target.checked)}
                    />
                  }
                  label="Select all visible"
                  sx={{
                    marginLeft: '-8px',
                    '.MuiFormControlLabel-label': { fontSize: '14px', color: 'var(--color-text-muted)' }
                  }}
                />
                <Button
                  variant="text"
                  onClick={clearItemSelection}
                  disabled={selectedItemKeys.length === 0}
                  sx={{ textTransform: 'none', fontWeight: 500 }}
                >
                  Clear selection
                </Button>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  {selectedItemKeys.length} selected
                </div>
              </div>
              <Button
                variant="contained"
                onClick={handleExportSelectedItems}
                disabled={selectedItemKeys.length === 0}
                sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
              >
                Export selected
              </Button>
            </div>
          ) : null}

          <div className="shipment-list-items">
            {filteredItems.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' 
                  ? 'No items found matching your criteria.' 
                  : 'No logistics items available.'}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedItemId === item.id && selectedItemType === item.type;
                const cardClasses = `shipment-card selectable ${isSelected ? 'selected' : ''}`;
                const borderStyle = isSelected ? { border: `2px solid #00AAAB` } : {};
                const itemKey = makeItemKey(item);
                const isMarkedForExport = selectedItemKeys.includes(itemKey);
                
                return (
                  <div 
                    key={`${item.type}-${item.id}`} 
                    className={cardClasses} 
                    onClick={() => handleItemClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleItemClick(item);
                      }
                    }}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${item.code}`}
                  style={{ ...borderStyle, cursor: 'pointer' }}
                >
                  <div className="head">
                    <Checkbox
                      size="small"
                      checked={isMarkedForExport}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleItemSelection(item, event.target.checked);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      sx={{ padding: 0 }}
                      inputProps={{ 'aria-label': `Select ${item.type} ${item.code}` }}
                    />
                    {item.thumbnail}
                      <div className="title">
                        <small>{item.name}</small>
                        <strong>{item.code}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {item.type === 'shipment' && item.originData?.status === 'pending_change' ? (
                          <div className="tag yellow" style={{ textAlign: 'center', lineHeight: '1.1', display: 'inline-flex', flexDirection: 'column' }}>
                            <span>Pending</span>
                            <span>change</span>
                          </div>
                        ) : (
                          <div className={getStatusTag(item.status)}>
                            {formatStatus(item.status)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="shipment-card-body">
                      <div className={`details ${item.type === 'estimate' ? 'details-estimate' : ''}`}>
                        {item.type === 'shipment' ? (
                          <>
                            <div className="detail-item">
                              <span>Estimated arrival</span>
                              <strong>{formatDate(item.date)}</strong>
                            </div>
                            <div className="detail-item">
                              <span>Method</span>
                              <strong>{item.originData?.transport_method || 'TBD'}</strong>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="detail-item">
                              <span>Target Date</span>
                              <strong>{formatDate(item.date)}</strong>
                            </div>
                            <div className="detail-item">
                              <span>Artworks</span>
                              <strong>{typeof item.artworkCount === 'number' ? item.artworkCount : 'N/A'}</strong>
                            </div>
                            <div className="detail-item">
                              <span>Value</span>
                              <strong>{formatCurrency(item.value || 0)}</strong>
                            </div>
                            <div className="detail-item">
                              <span>{item.autoCloseBidding ? 'Estimates close' : 'Estimate deadline'}</span>
                              <strong
                                style={{ color: isDeadlinePast(item.biddingDeadline, item.autoCloseBidding) ? '#d14343' : undefined }}
                              >
                                {formatDeadlineLabel(item.biddingDeadline, item.autoCloseBidding)}
                              </strong>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {/* Route visualization for shipments or bid info for estimates */}
                      {item.type === 'shipment' ? (
                        <>
                          <div className="route-line">
                            <div className="point"></div>
                            <div className="line"></div>
                            <div className="pin"></div>
                          </div>
                          <div className="locations">
                            <span>{item.originData?.origin?.name || 'Origin TBD'}</span>
                            <span>{item.originData?.destination?.name || 'Destination TBD'}</span>
                          </div>
                          {item.hasCounterOffer && (
                            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                              <div className="tag yellow">
                                Counter offer: {typeof item.counterOfferAmount === 'number'
                                  ? formatCurrency(item.counterOfferAmount)
                                  : item.counterOfferAmount ?? '—'}
                              </div>
                            </div>
                          )}
                          {(item.status === 'checking' || item.status === 'pending_change') && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '8px' }}>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  handleOpenChangeRequest(item.id);
                                }}
                                disabled={item.originData?.status === 'pending_change'}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #e9eaeb',
                                  background: '#ffffff',
                                  color: '#58517E',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: item.originData?.status === 'pending_change' ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (item.originData?.status !== 'pending_change') {
                                    e.currentTarget.style.background = 'rgba(132, 18, 255, 0.06)';
                                    e.currentTarget.style.borderColor = 'rgba(132, 18, 255, 0.3)';
                                    e.currentTarget.style.color = '#8412ff';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.borderColor = 'var(--color-border)';
                                  e.currentTarget.style.color = 'var(--color-text-muted)';
                                }}
                              >
                                Request change
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const confirmed = window.confirm('Cancel this shipment? This will mark it as cancelled.');
                                  if (!confirmed) return;
                                  const reason = window.prompt('Optional: provide a reason for cancelling the shipment');
                                  await handleCancelShipment(item.id, reason || undefined);
                                }}
                                disabled={cancellingShipmentId === item.id || item.originData?.status === 'pending_change'}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #e9eaeb',
                                  background: '#ffffff',
                                  color: '#8a86a3',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: (cancellingShipmentId === item.id || item.originData?.status === 'pending_change') ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (cancellingShipmentId !== item.id && item.originData?.status !== 'pending_change') {
                                    e.currentTarget.style.background = 'rgba(255, 64, 129, 0.06)';
                                    e.currentTarget.style.borderColor = 'rgba(255, 64, 129, 0.3)';
                                    e.currentTarget.style.color = '#c2185b';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.borderColor = 'var(--color-border)';
                                  e.currentTarget.style.color = '#8a86a3';
                                }}
                              >
                                {cancellingShipmentId === item.id ? 'Cancelling…' : 'Cancel shipment'}
                              </button>
                              {/* <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleReopenShipmentForBidding(item.id);
                                }}
                                disabled={reopeningShipmentId === item.id || item.originData?.status === 'pending_change'}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #e9eaeb',
                                  background: '#ffffff',
                                  color: '#58517E',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: (reopeningShipmentId === item.id || item.originData?.status === 'pending_change') ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (reopeningShipmentId !== item.id && item.originData?.status !== 'pending_change') {
                                    e.currentTarget.style.background = 'rgba(132, 18, 255, 0.06)';
                                    e.currentTarget.style.borderColor = 'rgba(132, 18, 255, 0.3)';
                                    e.currentTarget.style.color = '#8412ff';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.borderColor = '#e9eaeb';
                                  e.currentTarget.style.color = '#58517E';
                                }}
                              >
                                {reopeningShipmentId === item.id ? 'Reopening…' : 'Reopen estimates'}
                              </button> */}
                            </div>
                          )}
                        </>
                      ) : (
                        item.type === 'estimate' && item.bids! > 0 && (
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'flex-start',
                            marginTop: '16px',
                            padding: '12px',
                            background: item.status === 'active' 
                              ? 'rgba(132, 18, 255, 0.05)' 
                              : 'rgba(132, 18, 255, 0.02)',
                            borderRadius: '8px',
                            border: item.status === 'active' 
                              ? '1px solid rgba(132, 18, 255, 0.1)' 
                              : '1px solid rgba(132, 18, 255, 0.05)'
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                marginBottom: '8px'
                              }}>
                                <span style={{ 
                                  fontSize: '13px', 
                                  fontWeight: 500,
                                  color: '#170849'
                                }}>
                                  {item.bids} estimate{item.bids !== 1 ? 's' : ''}
                                </span>
                                {item.lowestBid && (
                                  <span style={{ 
                                    fontSize: '13px', 
                                    color: '#0dab71',
                                    background: 'rgba(13, 171, 113, 0.1)',
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontWeight: 600,
                                    border: '1px solid rgba(13, 171, 113, 0.2)',
                                    letterSpacing: '0.1px'
                                  }}>
                                    Lowest: {formatCurrency(item.lowestBid)}
                                  </span>
                                )}
                              </div>
                              
                              {/* Bidder avatars */}
                              {item.bidders && item.bidders.length > 0 && (
                                <div>
                                  <div style={{ 
                                    fontSize: '11px', 
                                    color: 'rgba(23, 8, 73, 0.6)', 
                                    marginBottom: '6px'
                                  }}>
                                    {item.status === 'active' ? 'Click to message' : 'Agents'}
                                  </div>
                                  <div style={{ 
                                    display: 'flex', 
                                    gap: '6px',
                                    flexWrap: 'wrap'
                                  }}>
                                    {item.bidders.slice(0, 4).map((bidder, index) => (
                                      <ShipperAvatar
                                        key={index}
                                        name={bidder.companyName || bidder.name}
                                        abbreviation={bidder.abbreviation}
                                        brandColor={bidder.brandColor}
                                        imageUrl={bidder.imageUrl ?? undefined}
                                        fallbackImageUrl={bidder.fallbackImageUrl ?? undefined}
                                        size={48}
                                        onClick={() => {
                                          if (item.status === 'active') {
                                            handleMessageBidder(bidder.id, item);
                                          }
                                        }}
                                        style={{
                                          cursor: item.status === 'active' ? 'pointer' : 'default',
                                          transition: 'all 0.2s ease',
                                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                        }}
                                        className={item.status === 'active' ? 'hover-scale' : ''}
                                      />
                                    ))}
                                    {item.bidders.length > 4 && (
                                      <div style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '6px',
                                        background: '#58517E',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontSize: '10px',
                                        fontWeight: 'bold',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                      }}>
                                        +{item.bidders.length - 4}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      )}
                      
                      {/* No bids placeholder for active estimates */}
                      {item.type === 'estimate' && item.bids === 0 && item.status === 'active' && (
                        <div style={{ 
                          marginTop: '16px',
                          padding: '12px',
                          background: 'rgba(88, 81, 126, 0.05)',
                          borderRadius: '8px',
                          border: '1px solid rgba(88, 81, 126, 0.1)',
                          textAlign: 'center'
                        }}>
                          <span style={{ 
                            fontSize: '12px', 
                            color: 'rgba(23, 8, 73, 0.6)',
                            fontStyle: 'italic'
                          }}>
                            Awaiting Estimates...
                          </span>
                        </div>
                      )}

                      {item.type === 'estimate' && item.status !== 'cancelled' && item.status !== 'completed' && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const confirmed = window.confirm('Withdraw this quote? This will mark it as cancelled.');
                              if (!confirmed) return;
                              const reason = window.prompt('Optional: provide a reason for withdrawing the quote');
                              await handleWithdrawQuote(item.id, reason || undefined);
                            }}
                            disabled={withdrawingQuoteId === item.id}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #e9eaeb',
                              background: '#ffffff',
                              color: '#8a86a3',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: withdrawingQuoteId === item.id ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              if (withdrawingQuoteId !== item.id) {
                                e.currentTarget.style.background = 'rgba(255, 64, 129, 0.06)';
                                e.currentTarget.style.borderColor = 'rgba(255, 64, 129, 0.3)';
                                e.currentTarget.style.color = '#c2185b';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#ffffff';
                              e.currentTarget.style.borderColor = '#e9eaeb';
                              e.currentTarget.style.color = '#8a86a3';
                            }}
                          >
                            {withdrawingQuoteId === item.id ? 'Withdrawing…' : 'Withdraw'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </motion.div>

          <motion.div
            className="right-container"
            initial="hidden"
            animate="show"
            variants={slideInLeft}
            style={{ willChange: 'transform' }}
          >
          {selectedItem ? (
            <motion.div
              key={`${selectedItem.type}-${selectedItem.id}-${selectedItem.type === 'estimate' ? (selectedItem.originData?.updated_at || '') : ''}`}
              initial="hidden"
              animate="show"
              variants={slideInLeft}
              style={{ willChange: 'transform' }}
            >
              {selectedItem.type === 'shipment' ? (
                <ShipmentDetail
                  shipment={selectedItem.originData}
                  initialQuote={selectedItem.quoteDetails ?? null}
                />
              ) : (
                <EstimateDetail 
                  key={selectedItem.originData.id + '-' + selectedItem.originData.updated_at} 
                  estimate={selectedItem.originData} 
                />
              )}
            </motion.div>
          ) : (
            <motion.p initial="hidden" animate="show" variants={slideInLeft} style={{ willChange: 'transform' }}>
              Select an item to see details.
            </motion.p>
          )}
          </motion.div>
        </div>
      </div>
      
      {/* Change Request Modal */}
      {requestingChangeForShipmentId && (
        <ChangeRequestModal
          open={Boolean(requestingChangeForShipmentId)}
          onClose={() => setRequestingChangeForShipmentId(null)}
          submitting={submittingChangeRequest}
          onSubmit={async (values) => {
            await handleSubmitChangeRequest(requestingChangeForShipmentId, values);
          }}
        />
      )}
    </div>
  );
};

export default LogisticsPage; 
type DownloadCsvFn = (filename: string, headers: string[], rows: any[][]) => void;

const moduleLike = CsvExportModule as Record<string, any>;

const resolvedDownloadCsv: DownloadCsvFn = moduleLike.downloadCsv
  ?? moduleLike['module.exports']?.downloadCsv
  ?? ((filename: string) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[LogisticsPage] downloadCsv helper unavailable; skipping export for', filename);
    }
  });
