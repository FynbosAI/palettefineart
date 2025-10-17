import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, CircularProgress, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField, InputAdornment, Divider, Checkbox, FormControlLabel } from '@mui/material';
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
  const { currentChangeRequests, fetchShipmentChangeRequests, respondToChangeRequest, changeRequestActionLoading } = useChangeRequests();
  const { myBids, fetchMyBids } = useBids();
  const { fetchQuoteDetails } = useQuotes();
  const shipments = assignedShipments;
  const openMessagingModal = useMessagingUiStore((state) => state.openForQuote);

  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState<number>(0);
  const [counterNotes, setCounterNotes] = useState('');
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [changeAmount, setChangeAmount] = useState<number>(0);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletableDocIds, setDeletableDocIds] = useState<string[]>([]);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [openPreviewMap, setOpenPreviewMap] = useState<Record<string, boolean>>({});
  const [previewUrlMap, setPreviewUrlMap] = useState<Record<string, { url: string; fetchedAt: number }>>({});
  const [previewLoadingMap, setPreviewLoadingMap] = useState<Record<string, boolean>>({});
  const [previewErrorMap, setPreviewErrorMap] = useState<Record<string, string | null>>({});
  const { formatCurrency } = useCurrency();

  const [currentQuote, setCurrentQuote] = useState<any | null>(null);
  const [messagingLaunchInFlight, setMessagingLaunchInFlight] = useState(false);

  const activeChangeRequest = currentChangeRequests.find((cr: any) => ['pending', 'countered'].includes(cr?.status)) || currentChangeRequests[0];

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
    if (explicit) return String(explicit);
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
    return shipment.name.toLowerCase().includes(searchLower) || 
           shipment.code.toLowerCase().includes(searchLower) ||
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
                      <div className="thumb"></div>
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
                      Message Gallery
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
                        const oldOriginDisplay = [selectedShipment.origin?.name, selectedShipment.origin?.address_full].filter(Boolean).join(' — ');
                        const oldDestinationDisplay = [selectedShipment.destination?.name, selectedShipment.destination?.address_full].filter(Boolean).join(' — ');
                        const newOriginDisplay = [proposal.origin_location?.name, proposal.origin_location?.address_full].filter(Boolean).join(' — ');
                        const newDestinationDisplay = [proposal.destination_location?.name, proposal.destination_location?.address_full].filter(Boolean).join(' — ');
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

                        const DiffRow = ({
                          icon,
                          label,
                          from,
                          to,
                        }: { icon: React.ReactNode; label: string; from: string; to: string; }) => (
                          <Box sx={{
                            border: '1px solid #E9EAEB',
                            borderRadius: '10px',
                            p: 2,
                            mb: 1.5,
                            background: '#FFFFFF'
                          }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: 1 }}>
                              {icon}
                              <Typography variant="body2" sx={{ color: '#58517E', fontWeight: 600 }}>{label}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <Typography variant="body2" sx={{ color: '#170849' }}>{from || 'TBD'}</Typography>
                              <ArrowForwardIcon sx={{ fontSize: 18, color: '#B587E8' }} />
                              <Typography variant="body2" sx={{ color: '#8412FF', fontWeight: 600 }}>{to || 'TBD'}</Typography>
                            </Box>
                          </Box>
                        );

                        return (
                          <Box sx={{ mb: 2 }}>
                            {(showOrigin || showDestination || showShipDate || showDeliveryDate || showAmount || showNotes) ? (
                              <>
                                {showOrigin && (
                                  <DiffRow
                                    icon={<PlaceOutlinedIcon sx={{ color: '#170849' }} />}
                                    label="Origin"
                                    from={oldOriginDisplay || 'TBD'}
                                    to={newOriginDisplay || 'TBD'}
                                  />
                                )}
                                {showDestination && (
                                  <DiffRow
                                    icon={<PlaceOutlinedIcon sx={{ color: '#170849' }} />}
                                    label="Destination"
                                    from={oldDestinationDisplay || 'TBD'}
                                    to={newDestinationDisplay || 'TBD'}
                                  />
                                )}
                                {showShipDate && (
                                  <DiffRow
                                    icon={<CalendarTodayOutlinedIcon sx={{ color: '#170849' }} />}
                                    label="Ship date"
                                    from={oldShipDate ? formatDate(oldShipDate as any) : 'TBD'}
                                    to={newShipDate ? formatDate(newShipDate) : 'TBD'}
                                  />
                                )}
                                {showDeliveryDate && (
                                  <DiffRow
                                    icon={<CalendarTodayOutlinedIcon sx={{ color: '#170849' }} />}
                                    label="Arrival date"
                                    from={selectedShipment.estimated_arrival ? formatDate(selectedShipment.estimated_arrival) : 'TBD'}
                                    to={newDeliveryDate ? formatDate(newDeliveryDate) : 'TBD'}
                                  />
                                )}
                                {showAmount && (
                                  <DiffRow
                                    icon={<AttachMoneyOutlinedIcon sx={{ color: '#170849' }} />}
                                    label="Proposed amount"
                                    from={acceptedBid ? formatCurrency((acceptedBid as any).amount) : '—'}
                                    to={formatCurrency(proposedAmount)}
                                  />
                                )}
                                {showNotes && (
                                  <Box sx={{
                                    border: '1px solid #E9EAEB',
                                    borderRadius: '10px',
                                    p: 2,
                                    mb: 1.5,
                                    background: '#FFFFFF'
                                  }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: 1 }}>
                                      <NotesOutlinedIcon sx={{ color: '#170849' }} />
                                      <Typography variant="body2" sx={{ color: '#58517E', fontWeight: 600 }}>Notes</Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{ color: '#170849' }}>{cr.notes}</Typography>
                                  </Box>
                                )}
                              </>
                            ) : (
                              <Typography variant="body2" sx={{ color: '#58517E' }}>No details provided.</Typography>
                            )}
                          </Box>
                        );
                      })()}
                      <Divider sx={{ mb: 2 }} />
                      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        {activeChangeRequest.change_type === 'scope' && (
                          <>
                            <Button 
                              variant="contained" color="primary"
                              onClick={() => setApproveDialogOpen(true)}
                              sx={{ textTransform: 'none' }}
                              disabled={!!changeRequestActionLoading[activeChangeRequest.id]}
                            >
                              Approve Changes
                            </Button>
                            <Button 
                              variant="outlined" color="warning"
                              onClick={() => setCounterModalOpen(true)}
                              sx={{ textTransform: 'none' }}
                              disabled={!!changeRequestActionLoading[activeChangeRequest.id]}
                            >
                              Counter Offer
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

                  {/* Temporarily hide condition report card at stakeholder request.
                  <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                    <h2>Condition</h2>
                    <p>{selectedShipment.condition_report || 'No condition report available.'}</p>
                  </motion.div>
                  */}

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
                                        variant="contained"
                                        size="small"
                                        onClick={() => handleDeleteDocument(doc)}
                                        disabled={deletingDocId === docId}
                                      sx={{
                                        backgroundColor: '#D94E45',
                                        borderRadius: '10px',
                                        textTransform: 'none',
                                        fontWeight: 500,
                                        fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                                        '&:hover': {
                                          backgroundColor: '#c33f37',
                                        },
                                        }}
                                        startIcon={<DeleteOutlineIcon fontSize="small" />}
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
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                      <Box
                                        sx={{
                                          mt: 1,
                                          borderRadius: '10px',
                                          backgroundColor: '#F8F8FF',
                                          overflow: 'hidden',
                                          height: 180,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        {isPreviewLoading ? (
                                          <CircularProgress size={24} />
                                        ) : previewError ? (
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              color: '#6E6A86',
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
                                            sx={{ maxHeight: 180, width: '100%', objectFit: 'contain' }}
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

                  {/* Artworks card moved inside animated left column to inherit parent initial/animate */}
                  <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                    <h2>Artworks</h2>
                    {!selectedShipment.artworks || selectedShipment.artworks.length === 0 ? (
                      <p>No artworks in this shipment.</p>
                    ) : (
                      <div className="artworks-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Title</th>
                              <th>Artist</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedShipment.artworks?.map((artwork: any) => (
                              <tr key={artwork.id}>
                                <td>{artwork.name}</td>
                                <td>{artwork.artist_name}</td>
                                <td>{formatCurrency(artwork.declared_value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </motion.div>
                </div>

                <div className="shipment-detail-right">
                  <motion.div className="detail-card" variants={slideInLeft} style={{ willChange: 'transform' }}>
                    <div className="route-map-container">
                      <RouteMap 
                        origin={selectedShipment.origin?.address_full || ''} 
                        destination={selectedShipment.destination?.address_full || ''} 
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


              {/* Approve dialog */}
              <Dialog open={approveDialogOpen && !!activeChangeRequest} onClose={() => setApproveDialogOpen(false)}>
                <DialogTitle>Approve Request</DialogTitle>
                <DialogContent>
                  <DialogContentText>Optional notes to include with approval.</DialogContentText>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    value={approveNotes}
                    onChange={(e) => setApproveNotes(e.target.value)}
                    sx={{ mt: 2 }}
                    placeholder="Notes (optional)"
                  />
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      if (!activeChangeRequest) return;
                      await respondToChangeRequest(activeChangeRequest.id, 'approve', { notes: approveNotes || undefined });
                      setApproveDialogOpen(false);
                      setApproveNotes('');
                    }}
                    disabled={!activeChangeRequest || !!changeRequestActionLoading[activeChangeRequest.id]}
                  >
                    Confirm
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Reject dialog */}
              <Dialog open={rejectDialogOpen && !!activeChangeRequest} onClose={() => setRejectDialogOpen(false)}>
                <DialogTitle>Reject Request</DialogTitle>
                <DialogContent>
                  <DialogContentText>Optional notes to include with rejection.</DialogContentText>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    sx={{ mt: 2 }}
                    placeholder="Notes (optional)"
                  />
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
                  <Button
                    color="error"
                    variant="contained"
                    onClick={async () => {
                      if (!activeChangeRequest) return;
                      await respondToChangeRequest(activeChangeRequest.id, 'reject', { notes: rejectNotes || undefined });
                      setRejectDialogOpen(false);
                      setRejectNotes('');
                    }}
                    disabled={!activeChangeRequest || !!changeRequestActionLoading[activeChangeRequest.id]}
                  >
                    Reject
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Counter-offer modal */}
              <Dialog open={counterModalOpen && !!activeChangeRequest} onClose={() => setCounterModalOpen(false)}>
                <DialogTitle>Make Counter-Offer</DialogTitle>
                <DialogContent>
                  <DialogContentText>Enter a new amount and optional notes.</DialogContentText>
                  <TextField
                    type="number"
                    fullWidth
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(parseFloat(e.target.value))}
                    sx={{ mt: 2 }}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    value={counterNotes}
                    onChange={(e) => setCounterNotes(e.target.value)}
                    sx={{ mt: 2 }}
                    placeholder="Notes (optional)"
                  />
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setCounterModalOpen(false)}>Cancel</Button>
                  <Button
                    variant="contained"
                    onClick={async () => {
                      if (!activeChangeRequest) return;
                      await respondToChangeRequest(activeChangeRequest.id, 'counter', { proposedAmount: counterAmount, notes: counterNotes || undefined });
                      setCounterModalOpen(false);
                      setCounterNotes('');
                    }}
                    disabled={!activeChangeRequest || !!changeRequestActionLoading[activeChangeRequest.id]}
                  >
                    Send
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
        </div>
        </div>
      </div>
    </div>
  );
};

export default Shipments; 
