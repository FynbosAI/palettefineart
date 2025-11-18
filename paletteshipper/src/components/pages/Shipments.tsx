import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Typography, CircularProgress, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField, InputAdornment, Divider, Checkbox, FormControlLabel, Alert, Switch, Collapse, FormControl, InputLabel, Select, MenuItem, Chip, OutlinedInput } from '@mui/material';
import ChangeCircleOutlinedIcon from '@mui/icons-material/ChangeCircleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RouteMap from '../Map';
import CopyButton from '../CopyButton';
import { useShipments, useAuth, useLoadingState, useChangeRequests, useBids, useQuotes } from '../../hooks/useStoreSelectors';
import useCurrency from '../../hooks/useCurrency';
import { ShipmentService } from '../../services/ShipmentService';
import { AuthService } from '../../services/AuthService';
import { motion, AnimatePresence } from 'motion/react';
import { slideInLeft, staggerContainer, easeStandard } from '../../lib/motion';
import { downloadCsv } from '../../../../shared/export/csv';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import useMessagingUiStore from '../../store/messagingUiStore';
import { findOrganizationLogoUrl } from '../../lib/organizationLogos';
import { extractLocationCoordinates } from '../../lib/locationCoordinates';
import {
  diffLineItems,
  calculateDraftTotal,
  normalizeBidLineItems,
  roundCurrency,
  type CounterLineItemDraft,
  type LineItemDiffField,
} from '../../lib/changeRequests/lineItemDrafts';
import {
  clampSupportedCurrency,
  formatCurrencyValue,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from '../../lib/currency';

interface Shipment {
  id: string;
  name: string;
  code: string;
  status: string;
  origin?: {
    id: string;
    name?: string;
    address_full?: string;
    contact_name?: string;
    contact_phone?: string;
  };
  destination?: {
    id: string;
    name?: string;
    address_full?: string;
    contact_name?: string;
    contact_phone?: string;
  };
  estimated_arrival?: string | null;
  transport_method?: string;
  total_value?: number;
  condition_report?: string;
  artworks: any[];
  documents: any[];
  tracking_events: any[];
}

// Category-based filtering for shipments
type CategoryFilter = 'all' | 'pre_shipment' | 'needs_attention' | 'in_transit' | 'completed' | 'cancelled';
type ShipmentStatus =
  | 'checking' | 'pending' | 'pending_change' | 'in_transit'
  | 'artwork_collected' | 'security_check' | 'local_delivery'
  | 'delivered' | 'cancelled';

// Map each shipment status to a category
const statusToCategory: Record<ShipmentStatus, CategoryFilter> = {
  checking: 'pre_shipment',
  pending: 'pre_shipment',
  pending_change: 'needs_attention',
  in_transit: 'in_transit',
  artwork_collected: 'in_transit',
  security_check: 'in_transit',
  local_delivery: 'in_transit',
  delivered: 'completed',
  cancelled: 'cancelled',
};

const CATEGORY_LABEL: Record<CategoryFilter, string> = {
  all: 'All',
  pre_shipment: 'Pre-shipment',
  needs_attention: 'Needs attention',
  in_transit: 'In transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const getCategoryColors = (cat: CategoryFilter) => ({
  border: ({
    pre_shipment: '#58517E',
    needs_attention: '#E9932D',
    in_transit: '#2378da',
    completed: '#0dab71',
    cancelled: '#8a86a3',
    all: '#8412ff'
  } as Record<CategoryFilter, string>)[cat],
  background: ({
    pre_shipment: 'rgba(88,81,126,0.1)',
    needs_attention: 'rgba(233,147,45,0.1)',
    in_transit: 'rgba(35,120,218,0.1)',
    completed: 'rgba(13,171,113,0.1)',
    cancelled: 'rgba(138,134,163,0.1)',
    all: 'rgba(132,18,255,0.1)'
  } as Record<CategoryFilter, string>)[cat],
  color: ({
    pre_shipment: '#58517E',
    needs_attention: '#E9932D',
    in_transit: '#2378da',
    completed: '#0dab71',
    cancelled: '#8a86a3',
    all: '#8412ff'
  } as Record<CategoryFilter, string>)[cat],
});

const Shipments = () => {
  const [selectedShipmentIdLocal, setSelectedShipmentIdLocal] = useState<string | null>(null);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  
  // Get shipments data from new store
  const { assignedShipments, selectedShipmentId, selectedShipment, fetchAssignedShipments, selectShipment, pendingChangeByShipmentId } = useShipments();
  const { logisticsPartner, organization } = useAuth();
  const { loading } = useLoadingState();
  const {
    currentChangeRequests,
    fetchShipmentChangeRequests,
    respondToChangeRequest,
    changeRequestActionLoading,
    counterDraftLineItems,
    initializeCounterDraft,
    updateCounterDraftLineItem,
    addCounterDraftLineItem,
    clearCounterDraft,
  } = useChangeRequests();
  const { myBids, fetchMyBids } = useBids();
  const { availableQuotes, fetchQuoteDetails } = useQuotes();
  const shipments = assignedShipments;
  const openMessagingModal = useMessagingUiStore((state) => state.openForQuote);

  const [counterEditorOpen, setCounterEditorOpen] = useState(false);
  const [counterCurrency, setCounterCurrency] = useState<SupportedCurrency>('USD');
  const [counterNotes, setCounterNotes] = useState('');
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [changeAmount, setChangeAmount] = useState<number>(0);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [branchActionWarning, setBranchActionWarning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletableDocIds, setDeletableDocIds] = useState<string[]>([]);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [openPreviewMap, setOpenPreviewMap] = useState<Record<string, boolean>>({});
  const [previewUrlMap, setPreviewUrlMap] = useState<Record<string, { url: string; fetchedAt: number }>>({});
  const [previewLoadingMap, setPreviewLoadingMap] = useState<Record<string, boolean>>({});
  const [previewErrorMap, setPreviewErrorMap] = useState<Record<string, string | null>>({});
  const [expandedArtworkIds, setExpandedArtworkIds] = useState<Record<string, boolean>>({});
  const [subItemSelections, setSubItemSelections] = useState<Record<string, string[]>>({});
  const { formatCurrency, preferredCurrency, currencyRates, currencySymbol } = useCurrency();

  const [currentQuote, setCurrentQuote] = useState<any | null>(null);
  const [messagingLaunchInFlight, setMessagingLaunchInFlight] = useState(false);

  const quotesById = useMemo(() => {
    const map = new Map<string, any>();
    availableQuotes.forEach((quote) => {
      if (quote?.id) {
        map.set(quote.id, quote);
      }
    });
    if (currentQuote?.id) {
      map.set(currentQuote.id, currentQuote);
    }
    return map;
  }, [availableQuotes, currentQuote]);

  const activeBid = useMemo(() => {
    if (!selectedShipment?.quote_id) return null;
    return (
      myBids.find(
        (bid: any) =>
          bid.quote_id === selectedShipment.quote_id &&
          (bid.status === 'accepted' || bid.status === 'counter_offer')
      ) || null
    );
  }, [myBids, selectedShipment?.quote_id]);

  const originalLineItems = useMemo(
    () => normalizeBidLineItems(activeBid?.bid_line_items || []),
    [activeBid?.bid_line_items]
  );

  useEffect(() => {
    if (activeBid?.id && (activeBid.bid_line_items?.length ?? 0) > 0) {
      initializeCounterDraft(activeBid.id, activeBid.bid_line_items || []);
    }
  }, [activeBid?.id, activeBid?.bid_line_items, initializeCounterDraft]);

  // When counter modal opens, reseed drafts and preload sub-item selections similar to SubmitBid modal.
  useEffect(() => {
    if (!activeBid?.id) return;

    const bidCurrency = clampSupportedCurrency(
      (activeBid as any)?.currency || (activeBid as any)?.currency_code || preferredCurrency
    );
    setCounterCurrency(bidCurrency);

    if (!counterEditorOpen) return;

    clearCounterDraft(activeBid.id);
    initializeCounterDraft(activeBid.id, activeBid.bid_line_items || []);
    const nextSelections: Record<string, string[]> = {};
    (activeBid.bid_line_items || []).forEach((li: any) => {
      if (li?.id) {
        nextSelections[li.id] = Array.isArray(li.description) ? [...li.description] : [];
      }
    });
    setSubItemSelections(nextSelections);
  }, [
    counterEditorOpen,
    activeBid?.id,
    activeBid?.bid_line_items,
    activeBid?.currency,
    activeBid?.currency_code,
    clearCounterDraft,
    initializeCounterDraft,
    preferredCurrency,
  ]);

  useEffect(() => {
    setExpandedArtworkIds({});
  }, [selectedShipment?.id]);

  const draftLineItems: CounterLineItemDraft[] = useMemo(() => {
    if (!activeBid?.id) return [];
    return counterDraftLineItems[activeBid.id] || originalLineItems;
  }, [activeBid?.id, counterDraftLineItems, originalLineItems]);

  const availableLineItemOptions = useMemo(() => {
    const selectedIds = new Set(draftLineItems.map((li) => li.id));
    return originalLineItems.filter((li) => !selectedIds.has(li.id));
  }, [draftLineItems, originalLineItems]);

  const subItemOptions = useMemo(() => {
    const base = [
      'Packing',
      'Crating',
      'Installation',
      'Handling',
      'Insurance',
      'Courier',
      'Customs',
      'White glove',
    ];
    const dynamic = new Set<string>();
    originalLineItems.forEach((li) => {
      (li.description || []).forEach((desc) => dynamic.add(desc));
    });
    draftLineItems.forEach((li) => {
      (li.description || []).forEach((desc) => dynamic.add(desc));
    });
    base.forEach((v) => dynamic.add(v));
    return Array.from(dynamic);
  }, [draftLineItems, originalLineItems]);

  const draftTotal = useMemo(() => calculateDraftTotal(draftLineItems), [draftLineItems]);
  const originalBidTotal = useMemo(() => calculateDraftTotal(originalLineItems), [originalLineItems]);
  const lineItemDiffs = useMemo(
    () => diffLineItems(originalLineItems, draftLineItems),
    [originalLineItems, draftLineItems]
  );
  const hasDraftChanges = lineItemDiffs.some((diff) => diff.hasChanges);

  const activeChangeRequest = currentChangeRequests.find((cr: any) => ['pending', 'countered'].includes(cr?.status)) || currentChangeRequests[0];
  const isCounterActionBusy =
    !!activeChangeRequest && !!changeRequestActionLoading[activeChangeRequest.id];
  const counterSubmitDisabled =
    !activeBid?.id || !activeChangeRequest || !hasDraftChanges || isCounterActionBusy;

  const handleChangeRequestAction = useCallback(
    async (
      action: 'approve' | 'reject' | 'counter',
      options?: { proposedAmount?: number; notes?: string; bidId?: string }
    ) => {
      if (!activeChangeRequest) return false;
      const { error } = await respondToChangeRequest(activeChangeRequest.id, action, options);
      if (error) {
        const status = typeof (error as any)?.status === 'number' ? (error as any).status : undefined;
        if (status === 403) {
          setBranchActionWarning('Switch to the invited branch to respond to this request.');
        } else {
          setBranchActionWarning(null);
          const message =
            (error && typeof error === 'object' && 'message' in error
              ? ((error as any).message as string)
              : 'Unable to respond to change request.');
          alert(message);
        }
        return false;
      }
      setBranchActionWarning(null);
      return true;
    },
    [activeChangeRequest, respondToChangeRequest]
  );

  const handleDraftQuantityChange = useCallback(
    (lineId: string, value: number) => {
      if (!activeBid?.id) return;
      const safeValue = Number.isFinite(value) ? Math.max(value, 0) : 0;
      updateCounterDraftLineItem(activeBid.id, lineId, (item) => ({
        ...item,
        quantity: safeValue,
      }));
    },
    [activeBid?.id, updateCounterDraftLineItem]
  );

  const handleDraftOptionalToggle = useCallback(
    (lineId: string, nextChecked: boolean) => {
      if (!activeBid?.id) return;
      updateCounterDraftLineItem(activeBid.id, lineId, (item) => ({
        ...item,
        is_optional: !nextChecked,
      }));
    },
    [activeBid?.id, updateCounterDraftLineItem]
  );

  const handleDraftLineItemCostChange = useCallback(
    (lineId: string, value: string) => {
      if (!activeBid?.id) return;
      const parsed = Number.parseFloat(value);
      const nextTotal = Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
      updateCounterDraftLineItem(activeBid.id, lineId, (item) => {
        const qty = Number(item.quantity ?? 0) || 1;
        const nextUnit = qty > 0 ? roundCurrency(nextTotal / qty) : item.unit_price;
        return {
          ...item,
          total_amount: nextTotal,
          unit_price: nextUnit,
        };
      });
    },
    [activeBid?.id, updateCounterDraftLineItem]
  );

  const formatCounterCurrency = useCallback(
    (amount: number | null | undefined, options?: Intl.NumberFormatOptions) =>
      formatCurrencyValue(amount, counterCurrency, { ...currencyRates, base: counterCurrency }, options),
    [counterCurrency, currencyRates]
  );

  const formatDiffValue = useCallback(
    (field: LineItemDiffField, side: 'previous' | 'current') => {
      const raw = side === 'previous' ? field.previous : field.current;
      if (field.field === 'unit_price' || field.field === 'total_amount') {
        return formatCounterCurrency(Number(raw ?? 0));
      }
      if (field.field === 'quantity') {
        return Number(raw ?? 0);
      }
      if (field.field === 'is_optional') {
        return raw ? 'Optional' : 'Included';
      }
      if (field.field === 'notes') {
        return (raw as string) || '—';
      }
      return raw ?? '—';
    },
    [formatCounterCurrency]
  );

  // Fetch shipments when component mounts or when logistics partner changes
  const activeBranchName = organization?.branch_name || organization?.name || '';

  useEffect(() => {
    if (logisticsPartner?.id) {
      if (!organization?.id) {
        return;
      }
      fetchAssignedShipments();
      return;
    }

    if (organization?.id) {
      fetchAssignedShipments();
    }
  }, [logisticsPartner?.id, organization?.id, fetchAssignedShipments]);

  useEffect(() => {
    if (selectedShipmentId) {
      fetchShipmentChangeRequests(selectedShipmentId);
    }
  }, [selectedShipmentId, fetchShipmentChangeRequests]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedShipment?.id) {
        setDeletableDocIds([]);
        return;
      }
      const ids = await ShipmentService.getDeletableDocumentIds(selectedShipment.id);
      if (!cancelled) {
        setDeletableDocIds(ids);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedShipment?.id]);

  // Fetch quote details for current/proposed JSON fields mapping
  useEffect(() => {
    const run = async () => {
      if (!selectedShipment?.quote_id) {
        setCurrentQuote(null);
        return;
      }
      const q = await fetchQuoteDetails(selectedShipment.quote_id);
      setCurrentQuote(q);
    };
    run();
  }, [selectedShipment?.quote_id, fetchQuoteDetails]);

  // Ensure bids are available to compute current vs proposed price
  useEffect(() => {
    const ensureBids = async () => {
      if (!selectedShipment?.quote_id) return;
      const hasForQuote = myBids.some((b: any) => b.quote_id === selectedShipment.quote_id);
      if (!hasForQuote) {
        try { await fetchMyBids(); } catch {}
      }
    };
    ensureBids();
  }, [selectedShipment?.quote_id, myBids, fetchMyBids]);


  useEffect(() => {
    setSelectedShipmentIds((prev) =>
      prev.filter((id) => shipments.some((shipment) => shipment.id === id))
    );
  }, [shipments]);

  // Refresh pending banner when shipments list updates and selection exists
  useEffect(() => {
    if (selectedShipmentId) {
      fetchShipmentChangeRequests(selectedShipmentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedShipments.length]);

  

  // Get status tag styling
  const getStatusTag = (status: string) => {
    const statusColorMap: Record<string, string> = {
      'checking': 'yellow',
      'delivered': 'green',
      'in_transit': 'yellow',
      'security_check': 'blue',
      'artwork_collected': 'purple',
      'local_delivery': 'magenta',
      'cancelled': 'gray',
      'pending': 'gray',
    };
    
    const color = statusColorMap[status] || 'gray';
    return `tag ${color}`;
  };

  // Format status for display
  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  // Format date
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString || dateString === 'TBD') return 'TBD';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'TBD';
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'TBD';
    }
  };

  // Format date and time
  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return { date: 'TBD', time: 'TBD' };
      }
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
    } catch (error) {
      return { date: 'TBD', time: 'TBD' };
    }
  };

  const getDocumentDisplayName = (doc: any) => {
    if (!doc) return 'Document';
    return doc.original_filename || doc.kind || (doc.file_url ? String(doc.file_url).split('/').pop() : 'Document');
  };

  const getDocumentType = (doc: any): 'image' | 'pdf' | 'other' => {
    const contentType = (doc?.content_type || doc?.mime_type || doc?.media_type || '').toLowerCase();
    if (contentType.startsWith('image/')) return 'image';
    if (contentType === 'application/pdf') return 'pdf';
    const name = getDocumentDisplayName(doc).toLowerCase();
    if (name.match(/\.(png|jpe?g|gif|bmp|webp|heic|heif|tiff?)$/)) return 'image';
    if (name.endsWith('.pdf')) return 'pdf';
    return 'other';
  };

  const getDocumentTypeLabel = (doc: any) => {
    const explicit = doc?.content_type || doc?.mime_type || doc?.media_type || doc?.kind;
    if (explicit) {
      const lower = String(explicit).toLowerCase();
      if (lower === 'terms_acceptance') {
        return 'Terms Acceptance';
      }
      return String(explicit);
    }
    const name = getDocumentDisplayName(doc);
    if (name.includes('.')) {
      const ext = name.split('.').pop();
      if (ext) return `${ext.toUpperCase()} file`;
    }
    return '';
  };

  const formatDocumentDate = (value: string | null | undefined) => {
    if (!value) return null;
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return null;
    }
  };

  const getDocumentMetadata = (doc: any) => {
    const uploaded = formatDocumentDate(doc?.created_at);
    const typeLabel = getDocumentTypeLabel(doc);
    return [uploaded ? `Uploaded ${uploaded}` : null, typeLabel].filter(Boolean).join(' · ');
  };

  const clearPreviewStateForDoc = useCallback((docId: string) => {
    setOpenPreviewMap((prev) => {
      if (!(docId in prev)) return prev;
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    setPreviewUrlMap((prev) => {
      if (!(docId in prev)) return prev;
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    setPreviewLoadingMap((prev) => {
      if (!(docId in prev)) return prev;
      const next = { ...prev };
      delete next[docId];
      return next;
    });
    setPreviewErrorMap((prev) => {
      if (!(docId in prev)) return prev;
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  }, []);

  const fetchDocumentUrl = useCallback(async (docId: string, opts?: { mode?: 'download' | 'inline' }) => {
    const session = await AuthService.getSession();
    const token = session?.access_token;
    if (!token) {
      throw new Error('Not signed in');
    }
    const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
    const params = new URLSearchParams({ id: docId });
    if (opts?.mode === 'inline') {
      params.set('mode', 'inline');
    }
    const resp = await fetch(`${API_BASE_URL}/api/documents/get-download-url?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await resp.json().catch(() => ({} as any));
    if (!resp.ok || !json?.ok) {
      throw new Error(json?.error || 'Failed to get download URL');
    }
    const url = json?.result?.url as string | undefined;
    if (!url) {
      throw new Error('Download URL not available');
    }
    return url;
  }, []);

  // Helpers for diff display

  const formatLocation = (loc: any) => {
    if (!loc) return 'TBD';
    const nameOrAddress = loc.name || loc.address_full || 'TBD';
    return nameOrAddress;
  };

  const stringifyJson = (value: any) => {
    try {
      if (value === null || value === undefined) return '—';
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  // Price: accepted vs counter_offer
  const bidsForQuote = (selectedShipment?.quote_id ? (myBids || []).filter((b: any) => b.quote_id === selectedShipment.quote_id) : []) as any[];
  const acceptedBid = bidsForQuote.find((b: any) => b.status === 'accepted');
  const counterOfferBid = bidsForQuote.find((b: any) => (b as any).status === 'counter_offer');

  // Local vertical entrance for left column container
  const slideInTop = {
    hidden: { opacity: 0, y: -24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeStandard } },
  } as const;

  // Filter shipments based on category and search
  const filteredShipments = shipments.filter(shipment => {
    // Category filter
    if (categoryFilter !== 'all') {
      const derivedCategory: CategoryFilter = ((statusToCategory as unknown as Record<string, CategoryFilter>)[shipment.status] || 'all');
      const hasPendingChange = !!pendingChangeByShipmentId[shipment.id];
      if (categoryFilter === 'needs_attention') {
        if (!hasPendingChange && derivedCategory !== 'needs_attention') return false;
      } else {
        if (derivedCategory !== categoryFilter) return false;
      }
    }

    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const quote = shipment.quote_id ? quotesById.get(shipment.quote_id) : null;
    const ownerOrg = shipment.owner_org || quote?.owner_org || null;
    const ownerOrgName = ownerOrg?.company?.name || ownerOrg?.name || '';

    return shipment.name.toLowerCase().includes(searchLower) || 
           shipment.code.toLowerCase().includes(searchLower) ||
           ownerOrgName.toLowerCase().includes(searchLower) ||
           (shipment.origin?.name?.toLowerCase().includes(searchLower) || false) ||
           (shipment.destination?.name?.toLowerCase().includes(searchLower) || false);
  });

  const emptyStateMessage = searchTerm
    ? 'No shipments found matching your criteria.'
    : logisticsPartner?.id
      ? `No shipments available for ${activeBranchName || 'this branch'} yet.`
      : 'No shipments available.';

  const visibleShipmentIds = filteredShipments.map((shipment) => shipment.id);
  const selectedShipments = shipments.filter((shipment) =>
    selectedShipmentIds.includes(shipment.id)
  );

  const allVisibleShipmentsSelected =
    filteredShipments.length > 0 &&
    visibleShipmentIds.every((id) => selectedShipmentIds.includes(id));

  const someVisibleShipmentsSelected =
    filteredShipments.length > 0 &&
    visibleShipmentIds.some((id) => selectedShipmentIds.includes(id));

  const toggleShipmentSelection = (shipmentId: string, explicitlyChecked?: boolean) => {
    setSelectedShipmentIds((prev) => {
      const next = new Set(prev);
      const shouldSelect =
        typeof explicitlyChecked === 'boolean' ? explicitlyChecked : !next.has(shipmentId);
      if (shouldSelect) {
        next.add(shipmentId);
      } else {
        next.delete(shipmentId);
      }
      return Array.from(next);
    });
  };

  const handleToggleSelectAllShipments = (checked: boolean) => {
    setSelectedShipmentIds((prev) => {
      const next = new Set(prev);
      visibleShipmentIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return Array.from(next);
    });
  };

  const clearShipmentSelection = () => {
    setSelectedShipmentIds([]);
  };

  const formatDateForCsv = (value: string | null | undefined) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleOpenConversation = useCallback(async () => {
    if (!selectedShipment?.id || !selectedShipment.quote_id || messagingLaunchInFlight) {
      return;
    }

    setMessagingLaunchInFlight(true);
    const originLabel =
      selectedShipment.origin?.name ||
      selectedShipment.origin?.address_full ||
      null;
    const destinationLabel =
      selectedShipment.destination?.name ||
      selectedShipment.destination?.address_full ||
      null;
    const routeLabel =
      originLabel && destinationLabel ? `${originLabel} → ${destinationLabel}` : undefined;

    let targetDateLabel: string | undefined;
    if (selectedShipment.estimated_arrival) {
      const parsed = new Date(selectedShipment.estimated_arrival);
      if (!Number.isNaN(parsed.getTime())) {
        targetDateLabel = `ETA: ${parsed.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}`;
      }
    }

    const quoteValueLabel =
      typeof selectedShipment.total_value === 'number' && selectedShipment.total_value > 0
        ? `Value ${formatCurrency(selectedShipment.total_value)}`
        : undefined;

    const branchName = currentQuote?.owner_org?.branch_name?.trim() || null;
    const companyName =
      currentQuote?.owner_org?.company?.name?.trim() ||
      currentQuote?.owner_org?.name?.trim() ||
      'Gallery Team';
    try {
      await openMessagingModal({
        quoteId: selectedShipment.quote_id,
        quoteTitle: currentQuote?.title ?? selectedShipment.name ?? 'Shipment conversation',
        galleryName: companyName,
        galleryBranchName: branchName ?? undefined,
        galleryCompanyName: companyName,
        routeLabel,
        targetDateLabel,
        quoteValueLabel,
        shipmentId: selectedShipment.id,
        shipperBranchOrgId: organization?.id ?? null,
        galleryBranchOrgId:
          currentQuote?.owner_org?.id ?? selectedShipment.owner_org_id ?? null,
      });
    } catch (error) {
      console.error('[Shipments] failed to open messaging modal', error);
    } finally {
      setMessagingLaunchInFlight(false);
    }
  }, [
    currentQuote,
    formatCurrency,
    messagingLaunchInFlight,
    openMessagingModal,
    organization?.id,
    selectedShipment,
  ]);

  const handleExportSelectedShipments = () => {
    if (selectedShipments.length === 0) {
      return;
    }

    const headers = [
      'Shipment Code',
      'Name',
      'Status',
      'Origin',
      'Destination',
      'Estimated Arrival',
      'Transport Method',
      'Total Value'
    ];

    const rows = selectedShipments.map((shipment) => [
      shipment.code ?? '',
      shipment.name ?? '',
      formatStatus(shipment.status ?? ''),
      shipment.origin?.name ?? '',
      shipment.destination?.name ?? '',
      formatDateForCsv(shipment.estimated_arrival ?? null),
      shipment.transport_method ?? '',
      typeof shipment.total_value === 'number'
        ? formatCurrency(shipment.total_value)
        : shipment.total_value ?? ''
    ]);

    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`shipper-shipments-${today}.csv`, headers, rows);
  };

  // Selected shipment is already provided by the store hook

  const documents = Array.isArray(selectedShipment?.documents) ? (selectedShipment?.documents as any[]) : [];
  const selectedShipmentOriginCoordinates = useMemo(
    () => extractLocationCoordinates(selectedShipment?.origin),
    [selectedShipment?.origin]
  );
  const selectedShipmentDestinationCoordinates = useMemo(
    () => extractLocationCoordinates(selectedShipment?.destination),
    [selectedShipment?.destination]
  );
  const documentCount = documents.length;
  const hasDocuments = documentCount > 0;

  const handleShipmentClick = (shipmentId: string) => {
    selectShipment(shipmentId);
    setSelectedShipmentIdLocal(shipmentId);
  };

  const handleTogglePreview = async (doc: any) => {
    if (!doc?.id) return;
    const docId = String(doc.id);
    const isCurrentlyOpen = Boolean(openPreviewMap[docId]);
    const nextOpen = !isCurrentlyOpen;
    const docType = getDocumentType(doc);

    setOpenPreviewMap((prev) => ({ ...prev, [docId]: nextOpen }));

    if (!nextOpen) {
      return;
    }

    setPreviewErrorMap((prev) => ({ ...prev, [docId]: null }));

    const PREVIEW_URL_REFRESH_MS = 240000; // 4 minutes
    const previewEntry = previewUrlMap[docId];
    const needsRefetch =
      docType === 'image' || docType === 'pdf'
        ? !previewEntry || Date.now() - previewEntry.fetchedAt > PREVIEW_URL_REFRESH_MS
        : false;

    if (docType === 'image' || docType === 'pdf') {
      if (needsRefetch) {
        setPreviewLoadingMap((prev) => ({ ...prev, [docId]: true }));
        try {
          const url = await fetchDocumentUrl(docId, { mode: 'inline' });
          setPreviewUrlMap((prev) => ({ ...prev, [docId]: { url, fetchedAt: Date.now() } }));
        } catch (err: any) {
          const message = err instanceof Error ? err.message : 'Unable to load preview';
          setPreviewErrorMap((prev) => ({ ...prev, [docId]: message }));
          alert(`Unable to load preview: ${message}`);
        } finally {
          setPreviewLoadingMap((prev) => ({ ...prev, [docId]: false }));
        }
      }
    }
  };

  const handleDownload = async (doc: any) => {
    if (!doc?.id) return;
    try {
      const url = await fetchDocumentUrl(doc.id, { mode: 'download' });
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      console.error('Download failed:', err);
      alert(`Unable to download document: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDeleteDocument = async (doc: any) => {
    if (!selectedShipment?.id || !doc?.id) return;
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeletingDocId(doc.id);
    try {
      const ok = await ShipmentService.deleteDocument(doc.id);
      if (!ok) throw new Error('Delete failed');
      await fetchAssignedShipments();
      const updated = await ShipmentService.getDeletableDocumentIds(selectedShipment.id, { force: true });
      setDeletableDocIds(updated);
      clearPreviewStateForDoc(doc.id);
    } catch (err) {
      console.error('Delete failed:', err);
      alert(`Unable to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingDocId(null);
    }
  };

  const toggleArtworkDetails = useCallback((artworkId: string) => {
    setExpandedArtworkIds((prev) => ({ ...prev, [artworkId]: !prev[artworkId] }));
  }, []);

  if (loading && shipments.length === 0) {
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
      <div className="main-panel main-panel--split">
        <header className="header">
          <div className="header-row">
            <div>
              <h1 className="header-title">Shipments</h1>
              <p className="header-subtitle">Manage assigned shipments</p>
            </div>
          </div>
        </header>
        <div className="main-panel__split">
          <motion.div
            className="card-stack shipment-list-column"
            initial="hidden"
            animate="show"
            variants={slideInTop}
            style={{ willChange: 'transform' }}
          >
          <motion.div
            className="shipment-list-header"
            initial="hidden"
            animate="show"
            variants={slideInLeft}
            style={{ willChange: 'transform' }}
          >
            <input 
              type="text" 
              placeholder="Search shipments..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {/* Category filters */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: '16px' }}>
              {(['all','pre_shipment', /*'needs_attention',*/ /*'in_transit',*/ 'completed','cancelled'] as CategoryFilter[]).map((cat) => {
                const isSelected = categoryFilter === cat;
                const c = getCategoryColors(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '18px',
                      border: isSelected ? `2px solid ${c.border}` : '1px solid #e9eaeb',
                      background: isSelected ? c.background : '#ffffff',
                      color: isSelected ? c.color : '#58517E',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s ease',
                      minWidth: '70px',
                      letterSpacing: '0.2px'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = `${c.background}`;
                        e.currentTarget.style.borderColor = c.border;
                        e.currentTarget.style.color = c.color;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#ffffff';
                        e.currentTarget.style.borderColor = '#e9eaeb';
                        e.currentTarget.style.color = '#58517E';
                      }
                    }}
                  >
                    {CATEGORY_LABEL[cat]}
                  </button>
                );
              })}
            </div>
            {/* {logisticsPartner?.id && (
              <Typography
                variant="body2"
                sx={{ color: '#58517E', marginTop: '16px', fontWeight: 500 }}
              >
                Viewing shipments for {activeBranchName || 'selected branch'}
              </Typography>
            )} */}
          </motion.div>

          {filteredShipments.length > 0 ? (
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
                      checked={allVisibleShipmentsSelected}
                      indeterminate={!allVisibleShipmentsSelected && someVisibleShipmentsSelected}
                      onChange={(event) => handleToggleSelectAllShipments(event.target.checked)}
                    />
                  }
                  label="Select all visible"
                  sx={{
                    marginLeft: '-8px',
                    '.MuiFormControlLabel-label': { fontSize: '14px', color: '#58517E' }
                  }}
                />
                <Button
                  variant="text"
                  onClick={clearShipmentSelection}
                  disabled={selectedShipmentIds.length === 0}
                  sx={{ textTransform: 'none', fontWeight: 500 }}
                >
                  Clear selection
                </Button>
                <div style={{ fontSize: '13px', color: '#58517E' }}>
                  {selectedShipmentIds.length} selected
                </div>
              </div>
              <Button
                variant="contained"
                onClick={handleExportSelectedShipments}
                disabled={selectedShipmentIds.length === 0}
                sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
              >
                Export selected
              </Button>
            </div>
          ) : null}

          <motion.div
            className="shipment-list-items"
            initial="hidden"
            animate="show"
            variants={staggerContainer(0.06)}
          >
            {filteredShipments.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {emptyStateMessage}
              </div>
            ) : (
              filteredShipments.map((shipment) => {
                const isSelected = selectedShipmentId === shipment.id;
                const cardClasses = `shipment-card selectable ${isSelected ? 'selected' : ''}`;
                const borderStyle = isSelected ? { border: `2px solid #00AAAB` } : {};
                const canComplete = ['checking','in_transit','artwork_collected','security_check','local_delivery'].includes(shipment.status);
                const quote = shipment.quote_id ? quotesById.get(shipment.quote_id) : null;
                const ownerOrg = shipment.owner_org || quote?.owner_org || null;
                const organizationName = ownerOrg?.company?.name || ownerOrg?.name || null;
                const galleryLogoLocalUrl = findOrganizationLogoUrl(organizationName);
                const galleryLogoRemoteUrl = ownerOrg?.img_url || ownerOrg?.company?.img_url || null;
                const displayLogoUrl = galleryLogoLocalUrl ?? galleryLogoRemoteUrl ?? null;
                const fallbackLetter = (organizationName || shipment.name || shipment.code || 'S').charAt(0).toUpperCase();
                const altText = organizationName ? `${organizationName} logo` : 'Organization logo';

                return (
                  <motion.div 
                    key={shipment.id} 
                    className={cardClasses} 
                    onClick={() => handleShipmentClick(shipment.id)}
                    style={{ ...borderStyle, cursor: 'pointer', willChange: 'transform' }}
                    variants={slideInTop}
                  >
                    <div className="head">
                      <Checkbox
                        size="small"
                        checked={selectedShipmentIds.includes(shipment.id)}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleShipmentSelection(shipment.id, event.target.checked);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        sx={{ padding: 0 }}
                        inputProps={{ 'aria-label': `Select shipment ${shipment.code}` }}
                      />
                      <div
                        className="thumb"
                        style={{
                          background: 'rgba(132, 18, 255, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                      >
                        {displayLogoUrl ? (
                          <img
                            src={displayLogoUrl}
                            alt={altText}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            onError={(event) => {
                              const target = event.currentTarget;
                              const attemptedRemote = target.dataset.attempt === 'remote';
                              if (!attemptedRemote && galleryLogoLocalUrl && galleryLogoRemoteUrl && target.src !== galleryLogoRemoteUrl) {
                                target.dataset.attempt = 'remote';
                                target.src = galleryLogoRemoteUrl;
                                return;
                              }
                              target.style.display = 'none';
                              const fallback = target.parentElement?.querySelector('[data-thumb-fallback]') as HTMLElement | null;
                              if (fallback) {
                                fallback.style.display = 'flex';
                              }
                            }}
                            data-attempt={galleryLogoLocalUrl && galleryLogoRemoteUrl ? 'local' : 'final'}
                          />
                        ) : null}
                        <div
                          data-thumb-fallback
                          style={{
                            display: displayLogoUrl ? 'none' : 'flex',
                            width: '100%',
                            height: '100%',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#170849',
                            fontWeight: 700,
                            fontSize: '18px'
                          }}
                        >
                          {fallbackLetter || 'S'}
                        </div>
                      </div>
                      <div className="title">
                        <small>SHIPMENT</small>
                        <strong>{shipment.code}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {pendingChangeByShipmentId[shipment.id] ? (
                          <div className="tag yellow" style={{ textAlign: 'center', lineHeight: '1.1', display: 'inline-flex', flexDirection: 'column' }}>
                            <span>Pending</span>
                            <span>change</span>
                          </div>
                        ) : (
                          <div className={getStatusTag(shipment.status)}>
                            {formatStatus(shipment.status)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="shipment-card-body">
                      <div className="details">
                        <div className="detail-item">
                          <span>Estimated arrival</span>
                          <strong>{formatDate(shipment.estimated_arrival)}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Method</span>
                          <strong>{shipment.transport_method || 'TBD'}</strong>
                        </div>
                      </div>
                      
                      <div className="route-line">
                        <div className="point"></div>
                        <div className="line"></div>
                        <div className="pin"></div>
                      </div>
                      <div className="locations">
                        <span>{shipment.origin?.name || 'Origin TBD'}</span>
                        <span>{shipment.destination?.name || 'Destination TBD'}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button
                          disabled={!canComplete}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!canComplete) return;
                            if (!window.confirm('Mark this shipment as completed?')) return;
                            const { error } = await ShipmentService.completeShipment(shipment.id);
                            if (error) {
                              console.error('Complete shipment failed:', error);
                              alert(`Unable to complete shipment: ${error?.message || 'Unknown error'}`);
                              return;
                            }
                            await fetchAssignedShipments();
                          }}
                          style={{
                            padding: '6px 16px',
                            borderRadius: 6,
                            border: '1px solid #e9eaeb',
                            background: canComplete ? '#8412FF' : '#f3f3f6',
                            color: canComplete ? '#fff' : '#9aa3b2',
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                            cursor: canComplete ? 'pointer' : 'not-allowed',
                            transition: 'background-color 0.2s ease, color 0.2s ease',
                          }}
                          title={canComplete ? 'Mark delivered' : 'Not available for current status'}
                        >
                          Complete shipment
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        </motion.div>
        
          <div className="right-container">
          {selectedShipment ? (
            <>
              <motion.div
                key={`header-${selectedShipmentId || 'none'}`}
                className="shipment-detail-header"
                initial="hidden"
                animate="show"
                variants={slideInLeft}
                style={{ willChange: 'transform' }}
              >
                <h1>{selectedShipment.name}</h1>
                <div
                  className="tracking-info"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Tracking no. <strong>{selectedShipment.code}</strong></span>
                  <CopyButton text={selectedShipment.code} size="small" />
                  {selectedShipment?.quote_id && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<MessageOutlinedIcon />}
                      disabled={messagingLaunchInFlight}
                      onClick={handleOpenConversation}
                      sx={{
                        textTransform: 'none',
                        ml: { xs: 0, sm: 'auto' },
                        borderColor: '#8412FF',
                        color: '#8412FF',
                        fontWeight: 600,
                        '&:hover': {
                          borderColor: '#5f5bff',
                          backgroundColor: 'rgba(132,18,255,0.08)',
                        },
                      }}
                    >
                      Message Client
                    </Button>
                  )}
                </div>
              </motion.div>

              <motion.div
                key={`body-${selectedShipmentId || 'none'}`}
                className="shipment-detail-body"
                initial="hidden"
                animate="show"
                variants={staggerContainer(0.06)}
              >
                <div className="shipment-detail-left">
                  {!!activeChangeRequest && (
                    <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ChangeCircleOutlinedIcon sx={{ color: '#170849' }} />
                          <h2 style={{ margin: 0 }}>Pending Request</h2>
                        </Box>
                      </Box>
                      {(() => {
                        const cr: any = activeChangeRequest;
                        const proposal = (cr?.proposal || {}) as any;
                        const summarizeLocation = (loc: any) => {
                          if (!loc) return { title: 'Not set', subtitle: '' };
                          const title = loc.name || loc.address_full || 'Not set';
                          const subtitle = loc.address_full || '';
                          return { title, subtitle };
                        };
                        const oldOrigin = summarizeLocation(selectedShipment.origin);
                        const oldDestination = summarizeLocation(selectedShipment.destination);
                        const newOrigin = summarizeLocation(proposal.origin_location);
                        const newDestination = summarizeLocation(proposal.destination_location);
                        const oldShipDate = (selectedShipment as any).ship_date || selectedShipment.estimated_arrival;
                        const newShipDate = cr.proposed_ship_date;
                        const newDeliveryDate = cr.proposed_delivery_date;
                        const proposedAmount = cr.proposed_amount;
                        const showOrigin = !!proposal.origin_location;
                        const showDestination = !!proposal.destination_location;
                        const showShipDate = !!newShipDate;
                        const showDeliveryDate = !!newDeliveryDate;
                        const showAmount = typeof proposedAmount === 'number';
                        const showNotes = typeof cr.notes === 'string' && cr.notes.length > 0;

                        const GridCard = ({
                          label,
                          proposedTitle,
                          proposedSubtitle,
                          currentTitle,
                          currentSubtitle,
                          icon,
                        }: {
                          label: string;
                          proposedTitle?: string | null;
                          proposedSubtitle?: string | null;
                          currentTitle?: string | null;
                          currentSubtitle?: string | null;
                          icon?: React.ReactNode;
                        }) => (
                          <Box
                            sx={{
                              border: '1px solid #E9EAEB',
                              borderRadius: '12px',
                              p: 2,
                              background: '#FCFCFD',
                              minHeight: 120,
                              boxShadow: '0 8px 20px rgba(10, 13, 18, 0.06)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 0.5,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {icon}
                              <Typography variant="body2" sx={{ color: '#58517E', fontWeight: 700 }}>{label}</Typography>
                            </Box>
                            <Typography variant="subtitle1" sx={{ color: '#170849', fontWeight: 700 }}>
                              {proposedTitle || 'Not set'}
                            </Typography>
                            {proposedSubtitle && (
                              <Typography variant="body2" sx={{ color: '#58517E', lineHeight: 1.35 }}>
                                {proposedSubtitle}
                              </Typography>
                            )}
                            {(currentTitle || currentSubtitle) && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" sx={{ color: '#58517E', fontWeight: 700, letterSpacing: 0.2 }}>
                                  Current
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#170849', fontWeight: 600 }}>
                                  {currentTitle || 'Not set'}
                                </Typography>
                                {currentSubtitle && (
                                  <Typography variant="body2" sx={{ color: '#58517E', lineHeight: 1.35 }}>
                                    {currentSubtitle}
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </Box>
                        );

                        const GridCardDate = ({
                          label,
                          proposed,
                          current,
                          icon,
                        }: { label: string; proposed?: string | null; current?: string | null; icon?: React.ReactNode }) => (
                          <GridCard
                            label={label}
                            icon={icon}
                            proposedTitle={proposed || 'Not set'}
                            currentTitle={current || 'Not set'}
                          />
                        );

                        return (
                          <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {(showOrigin || showDestination || showShipDate || showDeliveryDate || showAmount || showNotes) ? (
                              <Box
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
                                  gap: 1.5,
                                }}
                              >
                                {showOrigin && (
                                  <GridCard
                                    label="Origin"
                                    icon={<PlaceOutlinedIcon sx={{ color: '#170849' }} />}
                                    proposedTitle={newOrigin.title}
                                    proposedSubtitle={newOrigin.subtitle}
                                    currentTitle={oldOrigin.title}
                                    currentSubtitle={oldOrigin.subtitle}
                                  />
                                )}
                                {showDestination && (
                                  <GridCard
                                    label="Destination"
                                    icon={<PlaceOutlinedIcon sx={{ color: '#170849' }} />}
                                    proposedTitle={newDestination.title}
                                    proposedSubtitle={newDestination.subtitle}
                                    currentTitle={oldDestination.title}
                                    currentSubtitle={oldDestination.subtitle}
                                  />
                                )}
                                {showShipDate && (
                                  <GridCardDate
                                    label="Ship date"
                                    icon={<CalendarTodayOutlinedIcon sx={{ color: '#170849' }} />}
                                    proposed={newShipDate ? formatDate(newShipDate) : 'TBD'}
                                    current={oldShipDate ? formatDate(oldShipDate as any) : 'TBD'}
                                  />
                                )}
                                {showDeliveryDate && (
                                  <GridCardDate
                                    label="Arrival date"
                                    icon={<CalendarTodayOutlinedIcon sx={{ color: '#170849' }} />}
                                    proposed={newDeliveryDate ? formatDate(newDeliveryDate) : 'TBD'}
                                    current={selectedShipment.estimated_arrival ? formatDate(selectedShipment.estimated_arrival) : 'TBD'}
                                  />
                                )}
                                {showAmount && (
                                  <GridCard
                                    label="Proposed amount"
                                    icon={<AttachMoneyOutlinedIcon sx={{ color: '#170849' }} />}
                                    proposedTitle={formatCounterCurrency(proposedAmount)}
                                    currentTitle={acceptedBid ? formatCounterCurrency((acceptedBid as any).amount) : '—'}
                                  />
                                )}
                                {showNotes && (
                                  <Box sx={{
                                    gridColumn: '1 / -1',
                                    border: '1px solid #E9EAEB',
                                    borderRadius: '12px',
                                    p: 2,
                                    background: '#FFFFFF',
                                    boxShadow: '0 8px 20px rgba(10, 13, 18, 0.06)'
                                  }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: 1 }}>
                                      <NotesOutlinedIcon sx={{ color: '#170849' }} />
                                      <Typography variant="body2" sx={{ color: '#58517E', fontWeight: 700 }}>Notes</Typography>
                                    </Box>
                                    <Typography variant="body1" sx={{ color: '#170849', lineHeight: 1.45 }}>{cr.notes}</Typography>
                                  </Box>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="body2" sx={{ color: '#58517E' }}>No details provided.</Typography>
                            )}
                          </Box>
                        );
                      })()}
                      <Divider sx={{ mb: 2 }} />
                      {branchActionWarning && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                          {branchActionWarning}
                        </Alert>
                      )}
                      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        {activeChangeRequest.change_type === 'scope' && (
                          <>
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={() => setApproveDialogOpen(true)}
                              disabled={!!changeRequestActionLoading[activeChangeRequest.id]}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: '999px',
                                px: 2.8,
                                boxShadow: '0 14px 30px rgba(132, 18, 255, 0.25)',
                                background: '#8412FF',
                                '&:hover': { background: '#730ADD', boxShadow: '0 18px 32px rgba(115, 10, 221, 0.35)' },
                                '&.Mui-disabled': { background: 'rgba(23, 8, 73, 0.12)', color: 'rgba(23, 8, 73, 0.45)' }
                              }}
                            >
                              Approve Changes
                            </Button>
                            <Button
                              variant="outlined"
                              onClick={() => setCounterEditorOpen(true)}
                              disabled={!!changeRequestActionLoading[activeChangeRequest.id]}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: '999px',
                                px: 2.6,
                                borderColor: '#8412FF',
                                color: '#8412FF',
                                background: 'rgba(132, 18, 255, 0.06)',
                                '&:hover': { borderColor: '#730ADD', background: 'rgba(132, 18, 255, 0.12)' },
                              }}
                            >
                              Counter Offer
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              onClick={() => setRejectDialogOpen(true)}
                              disabled={!!changeRequestActionLoading[activeChangeRequest.id]}
                              sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                borderRadius: '999px',
                                px: 2.4,
                                borderColor: '#D94E45',
                                color: '#D94E45',
                                background: 'rgba(217, 78, 69, 0.04)',
                                '&:hover': { borderColor: '#c23f38', background: 'rgba(217, 78, 69, 0.12)' },
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {activeChangeRequest.change_type === 'withdrawal' && (
                          <>
                            <Button 
                              variant="contained" color="primary"
                              onClick={() => setApproveDialogOpen(true)}
                              sx={{ textTransform: 'none' }}
                              disabled={!!changeRequestActionLoading[activeChangeRequest.id]}
                            >
                              Approve Cancellation
                            </Button>
                            <Button 
                              variant="outlined" color="error"
                              onClick={() => setRejectDialogOpen(true)}
                              sx={{ textTransform: 'none' }}
                              disabled={!!changeRequestActionLoading[activeChangeRequest.id]}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </Box>
                    </motion.div>
                  )}
                  <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                    <h2>Shipping Info</h2>
                    <div className="origin-destination">
                      <div className="location">
                        <h3>Origin</h3>
                        <p>{selectedShipment.origin?.address_full || 'Address TBD'}</p>
                        <p>Contact: {selectedShipment.origin?.contact_name || 'Contact TBD'}</p>
                        {selectedShipment.origin?.contact_phone && <p>Phone: {selectedShipment.origin.contact_phone}</p>}
                      </div>
                      <div className="location">
                        <h3>Destination</h3>
                        <p>{selectedShipment.destination?.address_full || 'Address TBD'}</p>
                        <p>Contact: {selectedShipment.destination?.contact_name || 'Contact TBD'}</p>
                        {selectedShipment.destination?.contact_phone && <p>Phone: {selectedShipment.destination.contact_phone}</p>}
                      </div>
                    </div>
                    <div className="shipping-meta">
                        <div>
                            <h3>No. of artworks</h3>
                            <p>{selectedShipment.artworks?.length || 0}</p>
                        </div>
                         <div>
                            <h3>Total Value</h3>
                            <p>{formatCurrency(selectedShipment.total_value)}</p>
                        </div>
                         <div>
                            <h3>Transport</h3>
                            <p>{selectedShipment.transport_method || 'TBD'}</p>
                        </div>
                    </div>
                  </motion.div>

                  <motion.div
                    className="detail-card"
                    variants={slideInLeft}
                    style={{ willChange: 'transform', padding: 0, background: 'transparent' }}
                  >
                    <Box
                      sx={{
                        borderRadius: '10px',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2.5,
                        p: { xs: 2.5, md: 3 },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontSize: 20,
                            fontWeight: 500,
                            color: '#170849',
                            fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                          }}
                        >
                          Documents
                        </Typography>
                        {hasDocuments && (
                          <Typography
                            variant="body2"
                            sx={{
                              color: '#6E6A86',
                              fontWeight: 500,
                              fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                            }}
                          >
                            {documentCount} document{documentCount === 1 ? '' : 's'}
                          </Typography>
                        )}
                      </Box>

                      {!hasDocuments ? (
                        <Box
                          sx={{
                            borderRadius: '10px',
                            border: '1px solid #E9EAEB',
                            backgroundColor: '#FCFCFD',
                            p: 4,
                            display: 'grid',
                            placeItems: 'center',
                            textAlign: 'center',
                            gap: 1,
                          }}
                        >
                          <CloudUploadOutlinedIcon sx={{ color: '#B587E8', fontSize: 32 }} />
                          <Typography
                            variant="body2"
                            sx={{
                              color: '#6E6A86',
                              fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                            }}
                          >
                            No documents uploaded yet.
                          </Typography>
                        </Box>
                      ) : (
                        <Box
                          component="ul"
                          sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
                        >
                          {documents.map((doc: any) => {
                            const docId = String(doc.id);
                            const docType = getDocumentType(doc);
                            const metadata = getDocumentMetadata(doc);
                            const isPreviewOpen = Boolean(openPreviewMap[docId]);
                            const isPreviewLoading = Boolean(previewLoadingMap[docId]);
                            const previewEntry = previewUrlMap[docId];
                            const previewUrl = previewEntry?.url;
                            const previewError = previewErrorMap[docId];

                            return (
                              <Box
                                component="li"
                                key={docId}
                                sx={{
                                  borderRadius: '10px',
                                  backgroundColor: '#FFFFFF',
                                  border: '1px solid #E9EAEB',
                                  p: 2,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1.5,
                                  transition: 'background-color 0.25s ease, border-color 0.25s ease',
                                  '&:hover': {
                                    backgroundColor: '#FBFAFF',
                                    borderColor: 'rgba(132, 18, 255, 0.18)',
                                  },
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 2,
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                                    <Box
                                      sx={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '10px',
                                        backgroundColor: 'rgba(132,18,255,0.08)',
                                        display: 'grid',
                                        placeItems: 'center',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {docType === 'image' ? (
                                        <ImageOutlinedIcon sx={{ color: '#8412FF', fontSize: 22 }} />
                                      ) : docType === 'pdf' ? (
                                        <PictureAsPdfOutlinedIcon sx={{ color: '#8412FF', fontSize: 22 }} />
                                      ) : (
                                        <InsertDriveFileOutlinedIcon sx={{ color: '#8412FF', fontSize: 22 }} />
                                      )}
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography
                                        variant="subtitle1"
                                        sx={{
                                          fontSize: 16,
                                          fontWeight: 500,
                                          color: '#170849',
                                          fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                                        }}
                                        noWrap
                                        title={getDocumentDisplayName(doc)}
                                      >
                                        {getDocumentDisplayName(doc)}
                                      </Typography>
                                      {metadata && (
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            color: '#6E6A86',
                                            fontSize: 13,
                                            fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                                          }}
                                          noWrap
                                          title={metadata}
                                        >
                                          {metadata}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>

                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={() => handleTogglePreview(doc)}
                                      disabled={isPreviewLoading}
                                      sx={{
                                        borderColor: '#00AAAB',
                                        color: '#00AAAB',
                                        borderRadius: '10px',
                                        textTransform: 'none',
                                        fontWeight: 500,
                                        fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                                        '& .MuiButton-endIcon': {
                                          ml: 0.5,
                                          transition: 'transform 0.18s ease',
                                          transform: isPreviewOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                        },
                                        '&:hover': {
                                          borderColor: '#008C8C',
                                          backgroundColor: 'rgba(0, 170, 171, 0.06)',
                                        },
                                      }}
                                      endIcon={<KeyboardArrowDownIcon fontSize="small" />}
                                    >
                                      {isPreviewOpen ? 'Hide preview' : 'Preview'}
                                    </Button>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={() => handleDownload(doc)}
                                      sx={{
                                        borderColor: '#00AAAB',
                                        color: '#00AAAB',
                                        borderRadius: '10px',
                                        textTransform: 'none',
                                        fontWeight: 500,
                                        fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                                        '&:hover': {
                                          borderColor: '#008C8C',
                                          backgroundColor: 'rgba(0, 170, 171, 0.06)',
                                        },
                                      }}
                                      startIcon={<DownloadOutlinedIcon fontSize="small" />}
                                    >
                                      Download
                                    </Button>
                                    {deletableDocIds.includes(docId) && (
                                      <Button
                                        size="small"
                                        color="error"
                                        variant="text"
                                        onClick={() => handleDeleteDocument(docId)}
                                        disabled={deletingDocId === docId}
                                        startIcon={<DeleteOutlineIcon fontSize="small" />}
                                        sx={{ textTransform: 'none', fontWeight: 600 }}
                                      >
                                        {deletingDocId === docId ? 'Deleting…' : 'Delete'}
                                      </Button>
                                    )}
                                  </Box>
                                </Box>

                                <AnimatePresence initial={false}>
                                  {isPreviewOpen && (
                                    <motion.div
                                      key={`preview-${docId}`}
                                      initial={{
                                        height: 0,
                                        opacity: 0,
                                      }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.22, ease: easeStandard }}
                                      style={{ overflow: 'hidden' }}
                                    >
                                      <Box
                                        sx={{
                                          mt: 1,
                                          borderRadius: '10px',
                                          border: '1px solid #E9EAEB',
                                          backgroundColor: '#FFFFFF',
                                          minHeight: 140,
                                          maxHeight: 340,
                                          overflow: 'hidden',
                                        }}
                                      >
                                        {isPreviewLoading ? (
                                          <Box sx={{ display: 'grid', placeItems: 'center', height: 220 }}>
                                            <CircularProgress size={20} />
                                          </Box>
                                        ) : previewError ? (
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              color: '#D14343',
                                              fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                                            }}
                                          >
                                            {previewError}
                                          </Typography>
                                        ) : docType === 'image' && previewUrl ? (
                                          <Box
                                            component="img"
                                            src={previewUrl}
                                            alt={`Preview for ${getDocumentDisplayName(doc)}`}
                                            sx={{ maxHeight: 320, width: '100%', objectFit: 'contain' }}
                                          />
                                        ) : docType === 'pdf' && previewUrl ? (
                                          <Box
                                            component="iframe"
                                            src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                            title={`document preview ${getDocumentDisplayName(doc)}`}
                                            sx={{ border: 'none', width: '100%', height: '100%' }}
                                          />
                                        ) : (
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              color: '#6E6A86',
                                              fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                                            }}
                                          >
                                            Preview not available for this file type.
                                          </Typography>
                                        )}
                                      </Box>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </Box>
                            );
                          })}
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="application/pdf,image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (!files || files.length === 0 || !selectedShipment?.id) return;
                            const file = files[0];
                            try {
                              setUploading(true);
                              const created = await ShipmentService.createSignedUpload(selectedShipment.id, file);
                              if (!created) throw new Error('Failed to create upload');
                              const ok = await ShipmentService.uploadFileToSignedUrl(created.path, created.token, file);
                              if (!ok) throw new Error('Failed to upload file');
                              const newId = await ShipmentService.confirmUpload(selectedShipment.id, created.path, file.name);
                              if (!newId) throw new Error('Failed to confirm upload');
                              await fetchAssignedShipments();
                              const updated = await ShipmentService.getDeletableDocumentIds(selectedShipment.id, { force: true });
                              setDeletableDocIds(updated);
                              clearPreviewStateForDoc(String(newId));
                            } catch (err) {
                              console.error('Upload failed:', err);
                              alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                            } finally {
                              setUploading(false);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }
                          }}
                        />
                        <Button
                          variant="contained"
                          size="medium"
                          disabled={uploading}
                          onClick={() => fileInputRef.current?.click?.()}
                          sx={{
                            alignSelf: 'flex-start',
                            borderRadius: '6px',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                            paddingY: '6px',
                            paddingX: '16px',
                            backgroundColor: '#00AAAB',
                            '&:hover': {
                              backgroundColor: '#008C8C',
                            },
                          }}
                          startIcon={<CloudUploadOutlinedIcon />}
                        >
                          {uploading ? 'Uploading…' : 'Upload Document'}
                        </Button>
                      </Box>
                    </Box>
                  </motion.div>

                  {/* Temporarily hide condition report card at stakeholder request.
                  <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                    <h2>Condition</h2>
                    <p>{selectedShipment.condition_report || 'No condition report available.'}</p>
                  </motion.div>
                  */}

                </div>

                <div className="shipment-detail-right">
                  <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                    <div className="route-map-container">
                      <RouteMap
                        origin={selectedShipment.origin?.address_full || selectedShipment.origin?.name || ''}
                        destination={selectedShipment.destination?.address_full || selectedShipment.destination?.name || ''}
                        originCoordinates={selectedShipmentOriginCoordinates}
                        destinationCoordinates={selectedShipmentDestinationCoordinates}
                        allowGeocoding={false}
                      />
                    </div>
                  </motion.div>
                  <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                    <h2>Route</h2>
                    <ul className="tracking-history">
                      {!selectedShipment.tracking_events || selectedShipment.tracking_events.length === 0 ? (
                        <li>No tracking events available.</li>
                      ) : (
                        selectedShipment.tracking_events?.map((event: any) => {
                          const { date, time } = formatDateTime(event.event_time);
                          return (
                            <li key={event.id}>
                              <div className="event-status">{formatStatus(event.status || 'Unknown')}</div>
                              <div className="event-location">{event.location || 'Location TBD'}</div>
                              <div className="event-time">{date} at {time}</div>
                              {event.notes && <div className="event-notes">{event.notes}</div>}
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </motion.div>
                </div>
              </motion.div>


                <motion.div
                  className="detail-card artworks-table"
                  variants={slideInLeft}
                  style={{ willChange: 'transform', gridColumn: '1 / -1' }}
                >
                  <h2>Artworks</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Artwork</th>
                        <th>Artist</th>
                        <th>Year</th>
                        <th>Value</th>
                        <th>Medium</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedShipment.artworks || selectedShipment.artworks.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>
                            No artworks in this shipment.
                          </td>
                        </tr>
                      ) : (
                        selectedShipment.artworks.map((artwork: any) => {
                          const expanded = Boolean(expandedArtworkIds[artwork.id]);
                          const detailEntries: Array<{ label: string; value: string }> = [
                            { label: 'Dimensions', value: artwork.dimensions || 'Not provided' },
                            { label: 'Framed dimensions', value: artwork.framed_dimensions || 'Not provided' },
                            { label: 'Weight', value: artwork.weight ? `${artwork.weight}` : 'Not provided' },
                            { label: 'Location', value: artwork.location || 'Not provided' },
                            { label: 'Crating', value: artwork.crating || 'Not provided' },
                            { label: 'Notes', value: artwork.notes || '—' },
                          ];
                          return (
                            <React.Fragment key={artwork.id}>
                              <tr>
                                <td>{artwork.name}</td>
                                <td>{artwork.artist_name || 'Unknown'}</td>
                                <td>{artwork.year_completed || 'Unknown'}</td>
                                <td>{formatCurrency(artwork.declared_value)}</td>
                                <td>{artwork.medium || 'Unknown'}</td>
                                <td>
                                  <Button
                                    variant="text"
                                    size="small"
                                    onClick={() => toggleArtworkDetails(artwork.id)}
                                    endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    sx={{
                                      textTransform: 'none',
                                      fontWeight: 600,
                                      color: '#170849'
                                    }}
                                  >
                                    {expanded ? 'Hide details' : 'View details'}
                                  </Button>
                                </td>
                              </tr>
                              <tr>
                                <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                                    <div
                                      style={{
                                        padding: '16px 20px',
                                        borderTop: '1px solid rgba(0, 0, 0, 0.08)',
                                        background: 'rgba(247, 246, 255, 0.8)'
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                          gap: '12px'
                                        }}
                                      >
                                        {detailEntries.map(({ label, value }) => (
                                          <div key={`${artwork.id}-${label}`}>
                                            <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.6)', marginBottom: '4px' }}>
                                              {label}
                                            </div>
                                            <div style={{ fontSize: '14px', color: '#170849', fontWeight: 600, wordBreak: 'break-word' }}>
                                              {value || 'Not provided'}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </Collapse>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </motion.div>
              {/* Approve dialog */}
              <Dialog
                open={approveDialogOpen && !!activeChangeRequest}
                onClose={() => setApproveDialogOpen(false)}
                PaperProps={{
                  sx: {
                    borderRadius: '16px',
                    boxShadow: '0 10px 40px rgba(10, 13, 18, 0.16)',
                    border: '1px solid #E9EAEB',
                    maxWidth: 520,
                    width: '100%',
                  },
                }}
              >
                <DialogTitle sx={{ fontWeight: 800, color: '#170849', pb: 1.5 }}>Approve Request</DialogTitle>
                <DialogContent sx={{ pt: 0 }}>
                  <DialogContentText sx={{ color: '#58517E', mb: 2 }}>
                    Optional notes to include with approval.
                  </DialogContentText>
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    value={approveNotes}
                    onChange={(e) => setApproveNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                        background: '#FCFCFD',
                      },
                    }}
                  />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3, pt: 1.5, gap: 1 }}>
                  <Button
                    onClick={() => setApproveDialogOpen(false)}
                    variant="outlined"
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#DAD8E5',
                      color: '#170849',
                      px: 2.5,
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      const success = await handleChangeRequestAction('approve', { notes: approveNotes || undefined });
                      if (success) {
                        setApproveDialogOpen(false);
                        setApproveNotes('');
                      }
                    }}
                    disabled={!activeChangeRequest || !!changeRequestActionLoading[activeChangeRequest.id]}
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 800,
                      px: 3,
                    }}
                  >
                    Confirm
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Reject dialog */}
              <Dialog
                open={rejectDialogOpen && !!activeChangeRequest}
                onClose={() => setRejectDialogOpen(false)}
                PaperProps={{
                  sx: {
                    borderRadius: '16px',
                    boxShadow: '0 10px 40px rgba(10, 13, 18, 0.16)',
                    border: '1px solid #E9EAEB',
                    maxWidth: 520,
                    width: '100%',
                  },
                }}
              >
                <DialogTitle sx={{ fontWeight: 800, color: '#170849', pb: 1.5 }}>Reject Request</DialogTitle>
                <DialogContent sx={{ pt: 0 }}>
                  <DialogContentText sx={{ color: '#58517E', mb: 2 }}>
                    Optional notes to include with rejection.
                  </DialogContentText>
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                        background: '#FCFCFD',
                      },
                    }}
                  />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3, pt: 1.5, gap: 1 }}>
                  <Button
                    onClick={() => setRejectDialogOpen(false)}
                    variant="outlined"
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#DAD8E5',
                      color: '#170849',
                      px: 2.5,
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="error"
                    variant="contained"
                    onClick={async () => {
                      const success = await handleChangeRequestAction('reject', { notes: rejectNotes || undefined });
                      if (success) {
                        setRejectDialogOpen(false);
                        setRejectNotes('');
                      }
                    }}
                    disabled={!activeChangeRequest || !!changeRequestActionLoading[activeChangeRequest.id]}
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 800,
                      px: 3,
                    }}
                  >
                    Reject
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Counter-offer modal */}
              <Dialog
                open={counterEditorOpen && !!activeChangeRequest}
                onClose={() => setCounterEditorOpen(false)}
                fullWidth
                maxWidth="md"
                PaperProps={{
                  sx: {
                    borderRadius: '18px',
                    overflow: 'hidden',
                    border: '1px solid #ECE8FF',
                    boxShadow: '0 22px 48px rgba(9, 11, 43, 0.14)',
                  },
                }}
              >
                <DialogTitle sx={{ p: 3, pb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '12px',
                      background: 'rgba(132,18,255,0.12)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#8412FF',
                      fontWeight: 800,
                      fontSize: 18,
                      fontFamily: 'Fractul, Inter, sans-serif',
                    }}
                  >
                    {currencySymbol}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#170849' }}>
                      Make Counter-Offer
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#58517E' }} noWrap>
                      Send an updated amount and line items to the gallery
                    </Typography>
                  </Box>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3, background: '#F9F8FF' }}>
                  <DialogContentText sx={{ mb: 2, color: '#58517E' }}>
                    Adjust quantities or unit prices below. Optional services can be toggled before sending.
                  </DialogContentText>
                  {availableLineItemOptions.length > 0 && (
                    <Box sx={{
                      mb: 2,
                      p: 2,
                      border: '1px dashed #DAD8E5',
                      borderRadius: '14px',
                      background: '#FFFFFF',
                      display: 'flex',
                      gap: 1.5,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}>
                      <TextField
                        select
                        label="Add line item"
                        size="small"
                        value=""
                        onChange={(e) => {
                          const nextId = e.target.value;
                          const template = availableLineItemOptions.find((li) => li.id === nextId);
                          if (template && activeBid?.id) {
                            const existingRemoved = draftLineItems.find(
                              (li) => li.id === nextId && li.removed
                            );
                            if (existingRemoved) {
                              restoreCounterDraftLineItem(activeBid.id, nextId);
                            } else {
                              addCounterDraftLineItem(activeBid.id, template as any);
                            }
                          }
                        }}
                        sx={{ minWidth: 260 }}
                        SelectProps={{ native: true }}
                      >
                        <option value="" disabled>
                          Select a service to include
                        </option>
                        {availableLineItemOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.category || 'Line item'} — {formatCounterCurrency((opt.total_amount ?? ((opt.quantity ?? 0) * (opt.unit_price ?? 0))) || 0)}
                          </option>
                        ))}
                      </TextField>
                      <Typography variant="body2" sx={{ color: '#58517E' }}>
                        Preloaded with current quantities and pricing.
                      </Typography>
                    </Box>
                  )}

                  {draftLineItems.map((item) => {
                    return (
                      <Box
                        key={item.id}
                        sx={{
                          position: 'relative',
                          background: '#F6F7FB',
                          border: '1px solid #E9EAEB',
                          borderRadius: '14px',
                          p: 2.5,
                          mb: 2,
                          boxShadow: '0 6px 20px rgba(10, 13, 18, 0.06)',
                        }}
                      >
                        <Typography variant="h6" sx={{ fontSize: 18, fontWeight: 800, color: '#1a153b' }}>
                          {(item.category || 'Line item').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Typography>
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 14,
                            right: 14,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 1,
                            fontWeight: 800,
                            background: '#F0E6FF',
                            borderRadius: '12px',
                            px: 1.5,
                            py: 1,
                            boxShadow: '0 1px 2px rgba(132, 18, 255, 0.15)',
                          }}
                        >
                          <span>{currencySymbol}</span>
                          <TextField
                            value={item.total_amount ?? 0}
                            onChange={(e) => handleDraftLineItemCostChange(item.id, e.target.value)}
                            size="small"
                            variant="standard"
                            InputProps={{
                              disableUnderline: true,
                              inputProps: {
                                style: {
                                  fontWeight: 800,
                                  fontSize: '16px',
                                  width: '120px',
                                  textAlign: 'right',
                                  cursor: 'text',
                                },
                                inputMode: 'decimal',
                                pattern: '[0-9]*',
                              },
                            }}
                            sx={{
                              '& .MuiInputBase-input': { padding: 0 },
                            }}
                          />
                        </Box>

                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, pt: 1, mt: 1.5 }}>
                          <FormControl fullWidth sx={{ flex: '1 1 320px' }}>
                            <InputLabel id={`${item.id}-subitems-label`}>Select options</InputLabel>
                            <Select
                              labelId={`${item.id}-subitems-label`}
                              id={`${item.id}-subitems-select`}
                              multiple
                              displayEmpty
                              value={subItemSelections[item.id] || []}
                              onChange={(e) => {
                                const values = e.target.value as string[];
                                setSubItemSelections((prev) => ({ ...prev, [item.id]: values }));
                                if (activeBid?.id) {
                                  updateCounterDraftLineItem(activeBid.id, item.id, (draft) => ({
                                    ...draft,
                                    description: values,
                                  }));
                                }
                              }}
                              input={(
                                <OutlinedInput
                                  label="Select options"
                                  sx={{
                                    borderRadius: '10px',
                                    background: '#fff',
                                    px: 1.5,
                                    py: 0.5,
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E9EAEB' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#C7C9D1' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                      borderColor: '#8412FF',
                                      boxShadow: '0 0 0 3px rgba(132, 18, 255, 0.12)',
                                    },
                                  }}
                                />
                              )}
                              sx={{
                                '& .MuiSelect-select': {
                                  display: 'flex',
                                  gap: 0.75,
                                  flexWrap: 'wrap',
                                  minHeight: 44,
                                  alignItems: 'center',
                                  py: 1,
                                },
                              }}
                              MenuProps={{
                                PaperProps: {
                                  sx: {
                                    borderRadius: 2,
                                    boxShadow: '0 8px 24px rgba(10, 13, 18, 0.12)',
                                    mt: 0.5,
                                    border: '1px solid #E9EAEB',
                                  },
                                },
                                MenuListProps: {
                                  dense: true,
                                  sx: { py: 0.5 },
                                },
                              }}
                              renderValue={(selected) => {
                                const values = selected as string[];
                                if (!values.length) {
                                  return (
                                    <Typography variant="body2" sx={{ color: '#9AA3B2' }}>
                                      Select options
                                    </Typography>
                                  );
                                }
                                return (
                                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                                    {(values as string[]).map((v) => (
                                      <Chip
                                        key={v}
                                        label={v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                        sx={{
                                          background: 'rgba(132, 18, 255, 0.08)',
                                          color: '#170849',
                                          borderRadius: '999px',
                                          border: '1px solid #E9EAEB',
                                          height: 28,
                                          fontWeight: 600,
                                          px: 1.25,
                                        }}
                                        size="small"
                                      />
                                    ))}
                                  </Box>
                                );
                              }}
                            >
                              {subItemOptions.map((opt) => (
                                <MenuItem
                                  key={opt}
                                  value={opt}
                                  sx={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    px: 1.5,
                                    py: 1,
                                    borderRadius: 1,
                                    color: '#170849',
                                    '&.Mui-selected': {
                                      backgroundColor: 'rgba(132, 18, 255, 0.12)',
                                      color: '#170849',
                                    },
                                    '&.Mui-selected:hover': {
                                      backgroundColor: 'rgba(132, 18, 255, 0.16)',
                                    },
                                    '&:hover': {
                                      backgroundColor: 'rgba(132, 18, 255, 0.06)',
                                    },
                                  }}
                                >
                                  {opt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                        </Box>
                      </Box>
                    );
                  })}

                  <Divider sx={{ my: 2 }} />
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2.5,
                      flexWrap: 'wrap',
                      background: 'rgba(132, 18, 255, 0.04)',
                      border: '1px solid #E9EAEB',
                      borderRadius: '14px',
                      p: 2,
                    }}
                  >
                    <Box sx={{ minWidth: 180 }}>
                      <Typography variant="body2" sx={{ color: '#58517E', fontWeight: 600 }}>
                        Original total
                      </Typography>
                      <Typography variant="h6" sx={{ color: '#170849', fontWeight: 800 }}>
                        {formatCounterCurrency(originalBidTotal)}
                      </Typography>
                    </Box>
                    <Box sx={{ minWidth: 180 }}>
                      <Typography variant="body2" sx={{ color: '#58517E', fontWeight: 600 }}>
                        Counter total
                      </Typography>
                      <Typography variant="h6" sx={{ color: '#170849', fontWeight: 800 }}>
                        {formatCounterCurrency(draftTotal)}
                        {draftTotal !== originalBidTotal && (
                          <Typography
                            component="span"
                            sx={{ ml: 1, fontWeight: 700 }}
                            color={draftTotal > originalBidTotal ? 'success.main' : 'error.main'}
                          >
                            {draftTotal > originalBidTotal ? '+' : ''}
                            {formatCounterCurrency(draftTotal - originalBidTotal)}
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                  </Box>

                  {!hasDraftChanges ? (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      Adjust at least one line item to enable the counter-offer button.
                    </Alert>
                  ) : (
                    <>
                      <Typography variant="subtitle2" sx={{ mt: 3, color: '#170849', fontWeight: 700 }}>
                        Changes preview
                      </Typography>
                      {lineItemDiffs
                        .filter((diff) => diff.hasChanges)
                        .map((diff) => (
                          <Box
                            key={diff.id}
                            sx={{
                              mt: 1.5,
                              backgroundColor: '#FCFCFD',
                              borderRadius: '12px',
                              border: '1px solid #E9EAEB',
                              boxShadow: '0 6px 20px rgba(10, 13, 18, 0.06)',
                              p: 2,
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#170849' }}>
                              {(diff.category || 'Line item').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </Typography>
                            {diff.fields
                              .filter((field) => field.field !== 'unit_price')
                              .map((field) => (
                              <Typography key={`${diff.id}-${field.field}`} variant="body2" sx={{ color: '#3f475a', mt: 0.25 }}>
                                {field.field === 'unit_price'
                                  ? 'Unit price'
                                  : field.field === 'total_amount'
                                  ? 'Line total'
                                  : field.field === 'is_optional'
                                  ? 'Optional'
                                  : field.field === 'quantity'
                                  ? 'Quantity'
                                  : 'Notes'}
                                : {formatDiffValue(field, 'previous')} →{' '}
                                <Typography component="span" sx={{ fontWeight: 800, color: '#170849' }}>
                                  {formatDiffValue(field, 'current')}
                                </Typography>
                              </Typography>
                            ))}
                          </Box>
                        ))}
                    </>
                  )}

                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="Notes to gallery (optional)"
                    value={counterNotes}
                    onChange={(e) => setCounterNotes(e.target.value)}
                    sx={{ mt: 3 }}
                  />
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 2, gap: 1.5 }}>
                  <Button
                    onClick={() => setCounterEditorOpen(false)}
                    variant="outlined"
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#DAD8E5',
                      color: '#170849',
                      px: 2.5,
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      const success = await handleChangeRequestAction('counter', {
                        proposedAmount: draftTotal,
                        notes: counterNotes || undefined,
                        bidId: activeBid?.id,
                      });
                      if (success) {
                        setCounterEditorOpen(false);
                        setCounterNotes('');
                      }
                    }}
                    disabled={counterSubmitDisabled}
                    sx={{
                      borderRadius: '999px',
                      textTransform: 'none',
                      fontWeight: 700,
                      px: 3,
                      boxShadow: '0 14px 30px rgba(132,18,255,0.25)',
                      background: '#8412FF',
                      '&:hover': { background: '#730ADD', boxShadow: '0 18px 32px rgba(115,10,221,0.35)' },
                    }}
                  >
                    {isCounterActionBusy ? 'Sending…' : 'Send Counter-Offer'}
                  </Button>
                </DialogActions>
              </Dialog>

              
            </>
          ) : (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: '#666' 
            }}>
              <Typography variant="h6">
                Select a shipment to see details
              </Typography>
            </Box>
          )}
        </div> {/* right-container */}
      </div> {/* main-panel__split */}
    </div> {/* main-panel */}
  </div>
  );
};

export default Shipments; 
