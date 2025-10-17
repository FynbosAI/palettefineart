import React, { useState, useEffect } from 'react';
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
import type { QuoteWithDetails } from '../../lib/supabase';
import useCurrency from '../../hooks/useCurrency';
import { downloadCsv } from '../../../../shared/export/csv';

type ItemType = 'shipment' | 'estimate';
type FilterType = 'all' | 'active' | /* 'pending' | 'in_transit' | */ 'delivered' | /* 'draft' | */ 'cancelled';
type TypeFilter = 'all' | 'shipments' | 'estimates';

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
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search') || '';
    setSearchTerm(prev => (prev === searchParam ? prev : searchParam));
  }, [location.search]);

  
  
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
      return {
        id: shipment.id,
        type: 'shipment' as ItemType,
        name: shipment.name,
        code: shipment.client_reference ? `REF: ${shipment.client_reference}` : `REF: ${shipment.code}`,
        status: shipment.status,
        route: `${shipment.origin?.name || 'Origin TBD'} → ${shipment.destination?.name || 'Destination TBD'}`,
        date: shipment.estimated_arrival || 'TBD',
        thumbnail: <div className="thumb"></div>,
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
      // Extract artwork count from the aggregated count query
      const artworkCount = (quote as any).quote_artworks?.[0]?.count || 0;
      
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
        thumbnail: (
          <div className="thumb" style={{ 
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-magenta) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '20px',
            fontWeight: 'bold'
          }} aria-label={quote.type === 'auction' ? 'Auction quote' : 'Requested quote'}>
          {quote.type === 'auction' ? 'A' : 'Q'}
        </div>
      ),
      subType: quote.type,
      bids: quote.bids?.length || 0,
      lowestBid: quote.bids?.length > 0 ? Math.min(...quote.bids.map(bid => bid.amount)) : undefined,
      bidders: quote.bids?.map(bid => {
        const branch = bid.branch_org || null;
        const branchLabel = (branch?.branch_name || branch?.name || '').trim();
        const partner = bid.logistics_partner || {};
        const companyName = (partner as any)?.name || null;
        const displayName = branchLabel || companyName || 'Unknown partner';
        const abbreviation = branchLabel ? deriveInitials(branchLabel) : (partner?.abbreviation || deriveInitials(displayName));
        const imageUrl = branch?.img_url || partner?.organization?.img_url || null;

        const bidder = {
          id: bid.id,
          name: displayName,
          abbreviation,
          brandColor: partner?.brand_color || '#666666',
          price: bid.amount,
          imageUrl,
          companyName,
          branchName: branchLabel || null,
          branchOrgId: branch?.id || null,
        };

        // console.log('🏢 LogisticsPage bidder data:', {
        //   quoteName: quote.title,
        //   bidId: bid.id,
        //   displayName,
        //   branch,
        //   logisticsPartner: partner,
        //   finalImageUrl: imageUrl,
        // });

        return bidder;
      }) || [],
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

  // Filter items
  const filteredItems = unifiedItems.filter(item => {
    // Type filter
    if (typeFilter !== 'all' && 
        ((typeFilter === 'shipments' && item.type !== 'shipment') ||
         (typeFilter === 'estimates' && item.type !== 'estimate'))) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }

    // Search filter
    const searchLower = searchTerm.toLowerCase();
    return item.name.toLowerCase().includes(searchLower) || 
           item.code.toLowerCase().includes(searchLower) ||
           item.route.toLowerCase().includes(searchLower);
  });

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
    logger.debug('LogisticsPage', `Selected estimate - Status: ${selectedItem.status}, Bid count: ${selectedItem.bids || 0}`);
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

  const handleExportSelectedItems = () => {
    if (selectedItems.length === 0) {
      return;
    }

    const headers = [
      'Type',
      'Code',
      'Name',
      'Status',
      'Route',
      'Date',
      'Value',
      'Additional Info'
    ];

    const rows = selectedItems.map((item) => {
      if (item.type === 'shipment') {
        const shipment = item.originData;
        const routeLabel = `${shipment?.origin?.name ?? 'Origin TBD'} → ${shipment?.destination?.name ?? 'Destination TBD'}`;
        const totalValue =
          typeof shipment?.total_value === 'number'
            ? formatCurrency(shipment.total_value)
            : shipment?.total_value ?? '';
        return [
          'Shipment',
          shipment?.code ?? item.code,
          shipment?.name ?? item.name,
          shipment?.status ?? item.status,
          routeLabel,
          formatDateForCsv(shipment?.estimated_arrival ?? item.date),
          totalValue,
          shipment?.transport_method ?? ''
        ];
      }

      const quote = quotes.find((q) => q.id === item.id);
      const deadline =
        quote && quote.auto_close_bidding === false
          ? 'Manual close'
          : formatDateForCsv(quote?.bidding_deadline ?? item.biddingDeadline ?? null);
      const targetRange = formatTargetDateRange(
        quote?.target_date_start ?? null,
        quote?.target_date_end ?? null
      );
      const value =
        typeof item.value === 'number' ? formatCurrency(item.value) : item.value ?? '';

      return [
        'Estimate',
        quote?.client_reference ? `REF: ${quote.client_reference}` : item.code,
        quote?.title ?? item.name,
        quote?.status ?? item.status,
        item.route,
        targetRange,
        value,
        deadline
      ];
    });

    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`gallery-logistics-${today}.csv`, headers, rows);
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

    const bidderDisplayName = bidder.branchName && bidder.companyName && bidder.branchName !== bidder.companyName
      ? `${bidder.branchName} (${bidder.companyName})`
      : bidder.name;

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
      const input = window.prompt('Enter new bid deadline (YYYY-MM-DD)', defaultDate);
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
          (json?.error && (json.error.message || json.error)) || 'Reopen bidding failed'
        );
      }

      logger.success('LogisticsPage', 'Shipment reopened for bidding');
      await fetchShipments();
    } catch (err) {
      console.error('Error reopening shipment for bidding:', err);
      alert(`Failed to reopen bidding: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
      'local_delivery': { border: '#ff4081', background: 'rgba(255, 64, 129, 0.1)', color: '#ff4081' }
    };
    
    return statusColorMap[status] || statusColorMap['all'];
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  // Title-case labels for filter buttons (e.g., 'delivered' -> 'Delivered')
  const formatStatusLabel = (status: string) => {
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
              {(['all', 'active', /* 'pending', 'in_transit', */ 'delivered', /* 'draft', */ 'cancelled'] as FilterType[]).map((status) => {
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
                    aria-label={`Filter by ${status.replace('_', ' ')}`}
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
                              <span>{item.autoCloseBidding ? 'Bids close' : 'Bidding deadline'}</span>
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
                              {/* <button
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
                              </button> */}
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
                                {reopeningShipmentId === item.id ? 'Reopening…' : 'Reopen bidding'}
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
                                  {item.bids} bid{item.bids !== 1 ? 's' : ''}
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
                                    {item.status === 'active' ? 'Click to message' : 'Bidders'}
                                  </div>
                                  <div style={{ 
                                    display: 'flex', 
                                    gap: '6px',
                                    flexWrap: 'wrap'
                                  }}>
                                    {item.bidders.slice(0, 4).map((bidder, index) => (
                                      <ShipperAvatar
                                        key={index}
                                        name={bidder.name}
                                        abbreviation={bidder.abbreviation}
                                        brandColor={bidder.brandColor}
                                        imageUrl={bidder.imageUrl}
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
                            Awaiting bids...
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
