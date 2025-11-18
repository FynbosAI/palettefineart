import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShipmentWithDetails } from '../../lib/supabase';
import RouteMap from '../Map';
import CopyButton from '../CopyButton';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Typography } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChangeRequestModal, { ChangeRequestFormValues } from '../ChangeRequestModal';
import { supabase } from '../../lib/supabase';
import useSupabaseStore from '../../store/useSupabaseStore';
import useMessagingUiStore from '../../store/messagingUiStore';
import { QuoteService, ShipmentService } from '../../lib/supabase';
import ShipperAvatar from '../ShipperAvatar';
import BidLineItemsCard, { type BidLineItemDisplay } from '../bids/BidLineItemsCard';
import type { QuoteWithDetails } from '../../lib/supabase';
import logger from '../../lib/utils/logger';
import { AnimatePresence, motion } from 'motion/react';
import useCurrency from '../../hooks/useCurrency';
import { resolveOrganizationLogo } from '../../lib/organizationLogos';
import { extractLocationCoordinates } from '../../lib/locationCoordinates';

interface ShipmentDetailProps {
  shipment: ShipmentWithDetails;
  initialQuote?: QuoteWithDetails | null;
}

type InviteSummary = {
  id: string;
  participantKey: string;
  inviteId: string;
  partnerId: string | null;
  branchOrgId?: string | null;
  name: string;
  branchName?: string | null;
  partnerName?: string | null;
  abbreviation: string;
  brandColor: string;
  imageUrl?: string | null;
  fallbackImageUrl?: string | null;
  localLogoUrl?: string | null;
  remoteLogoUrl?: string | null;
  contactEmail?: string | null;
  hasBid: boolean;
  bidAmount?: number;
  bidStatus?: string | null;
  invitedAt?: string | null;
};

type AcceptedBidDisplay = {
  id: string;
  participantKey: string;
  shipperName: string;
  branchLabel: string | null;
  abbreviation: string;
  brandColor: string;
  imageUrl?: string | null;
  fallbackImageUrl?: string | null;
  price: number;
  status: string;
  deliveryLabel: string;
  co2Label: string;
  insuranceIncluded: boolean;
  specialServicesLabel: string | null;
  lineItems: BidLineItemDisplay[];
  breakdownLocked: boolean;
  summaryLabel: string;
  optionalCount: number;
  lastUpdatedLabel: string | null;
};

const deriveInitials = (label: string): string => {
  const trimmed = (label || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase();
  }
  return parts.map((part) => part[0]?.toUpperCase() || '').join('').slice(0, 3) || '?';
};

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

const humanizeLabel = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .toString()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)([a-z])/g, (_, space, char) => `${space}${char.toUpperCase()}`);
};

const joinDescriptions = (list?: string[] | null): string => {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.map(humanizeLabel).filter(Boolean).join(', ');
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

const formatTransitTime = (value: unknown): string => {
  if (!value) return 'Delivery TBD';
  try {
    const timeStr = value.toString();
    if (timeStr.includes('day')) {
      const days = parseInt(timeStr, 10);
      if (!Number.isNaN(days)) {
        return `${days} ${days === 1 ? 'day' : 'days'}`;
      }
    }
    if (timeStr.includes('week')) {
      const weeks = parseInt(timeStr, 10);
      if (!Number.isNaN(weeks)) {
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
      }
    }
    if (timeStr.includes(':')) {
      return 'Same day';
    }
    return timeStr || 'Delivery TBD';
  } catch (error) {
    console.warn('ShipmentDetail', 'Unable to parse transit time', error);
    return 'Delivery TBD';
  }
};

const makeParticipantKey = (
  partnerId?: string | null,
  branchOrgId?: string | null,
  fallback?: string
): string => {
  if (partnerId) {
    return `${partnerId}:${branchOrgId || 'none'}`;
  }
  return fallback || 'unknown';
};

const ShipmentDetail: React.FC<ShipmentDetailProps> = ({ shipment, initialQuote = null }) => {
  // Select each slice independently to keep stable references and avoid effect loops
  const currentChangeRequests = useSupabaseStore(state => state.currentChangeRequests);
  const fetchShipmentChangeRequests = useSupabaseStore(state => state.fetchShipmentChangeRequests);
  const respondToChangeRequest = useSupabaseStore(state => state.respondToChangeRequest);
  const reopenQuote = useSupabaseStore(state => state.reopenQuote);
  const createChangeRequest = useSupabaseStore(state => state.createChangeRequest);
  const fetchShipments = useSupabaseStore(state => state.fetchShipments);
  const memberships = useSupabaseStore(state => state.memberships);
  const fetchQuoteDetails = useSupabaseStore(state => state.fetchQuoteDetails);
  const fetchQuotes = useSupabaseStore(state => state.fetchQuotes);
  const currentOrg = useSupabaseStore(state => state.currentOrg);
  const { formatCurrency } = useCurrency();

  const originCoordinates = useMemo(
    () => extractLocationCoordinates(shipment.origin),
    [shipment.origin]
  );
  const destinationCoordinates = useMemo(
    () => extractLocationCoordinates(shipment.destination),
    [shipment.destination]
  );

  const [counterOfferAmount, setCounterOfferAmount] = useState<number | null>(null);
  const [counterOfferNotes, setCounterOfferNotes] = useState<string | null>(null);
  const [counterBidId, setCounterBidId] = useState<string | null>(null);
  const [counterBidBranchOrgId, setCounterBidBranchOrgId] = useState<string | null>(null);
  const [acceptingCounter, setAcceptingCounter] = useState(false);
  const [rejectingCounter, setRejectingCounter] = useState(false);

  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const [expandedAcceptedBids, setExpandedAcceptedBids] = useState<Record<string, boolean>>({});
  const [expandedArtworkIds, setExpandedArtworkIds] = useState<Record<string, boolean>>({});

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [deletableDocIds, setDeletableDocIds] = useState<string[]>([]);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [openPreviewMap, setOpenPreviewMap] = useState<Record<string, boolean>>({});
  const [previewUrlMap, setPreviewUrlMap] = useState<Record<string, { url: string; fetchedAt: number }>>({});
  const [previewLoadingMap, setPreviewLoadingMap] = useState<Record<string, boolean>>({});
  const [previewErrorMap, setPreviewErrorMap] = useState<Record<string, string | null>>({});
  const [quoteDetails, setQuoteDetails] = useState<QuoteWithDetails | null>(initialQuote);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(Boolean(shipment?.quote_id) && !initialQuote);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteFetchIdRef = useRef<string | null>(initialQuote?.id ?? null);
  const openMessagingModal = useMessagingUiStore((state) => state.openForQuote);

  const canUploadDocuments = useMemo(() => {
    if (!shipment?.owner_org_id || !Array.isArray(memberships)) return false;
    const membership = memberships.find(m => m.org_id === shipment.owner_org_id);
    const role = membership?.role;
    return role === 'editor' || role === 'admin';
  }, [memberships, shipment?.owner_org_id]);

  const clearFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const refreshDeletableDocuments = async (force = false) => {
    if (!shipment?.id) {
      setDeletableDocIds([]);
      return;
    }
    const ids = await ShipmentService.getDeletableDocumentIds(shipment.id, { force });
    setDeletableDocIds(ids);
  };

  const getDocumentDisplayName = (doc: any) => {
    if (!doc) return 'Document';
    return doc.original_filename || doc.filename || (doc.file_url ? String(doc.file_url).split('/').pop() : 'Document');
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
    const session = (await supabase.auth.getSession()).data.session;
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

  const shipmentRoute = useMemo(() => {
    const originName = shipment.origin?.name || shipment.origin?.address_full || 'Origin TBD';
    const destinationName = shipment.destination?.name || shipment.destination?.address_full || 'Destination TBD';
    return `${originName} → ${destinationName}`;
  }, [shipment.origin?.name, shipment.origin?.address_full, shipment.destination?.name, shipment.destination?.address_full]);

  const conversationTitle = useMemo(() => {
    if (shipment.client_reference) {
      return `Shipment ${shipment.client_reference}`;
    }
    if (shipment.name) {
      return shipment.name;
    }
    if (quoteDetails?.title) {
      return quoteDetails.title;
    }
    return 'Shipment conversation';
  }, [shipment.client_reference, shipment.name, quoteDetails?.title]);

  const documents = Array.isArray(shipment?.documents) ? shipment.documents : [];
  const documentCount = documents.length;
  const hasDocuments = documentCount > 0;

  const launchMessagingModal = (
    partnersForModal: InviteSummary[],
    highlightedIds: string[],
    partnerLabel: { name: string; abbreviation: string; brandColor: string; price?: number }
  ) => {
    const quoteId = quoteDetails?.id || shipment.quote_id;
    if (!quoteId) {
      console.warn('No quote id available to open shipment conversation');
      alert('Unable to open conversation: missing quote reference for this shipment.');
      return;
    }

    const primaryPartner = partnersForModal.find((partner) => highlightedIds.includes(partner.id))
      || partnersForModal[0]
      || null;
    const shipperBranchOrgId = primaryPartner?.branchOrgId || null;
    const galleryBranchOrgId =
      quoteDetails?.owner_org?.id || quoteDetails?.owner_org_id || shipment.owner_org_id || null;

    openMessagingModal({
      quoteId,
      quoteTitle: conversationTitle,
      quoteRoute: shipmentRoute,
      quoteValue: quoteDetails?.value || shipment.total_value || 0,
      targetDateStart: quoteDetails?.target_date_start || null,
      targetDateEnd: quoteDetails?.target_date_end || null,
      quoteType: quoteDetails?.type === 'auction' ? 'auction' : 'requested',
      bidderName: partnerLabel.name,
      bidderAbbreviation: partnerLabel.abbreviation,
      bidderColor: partnerLabel.brandColor,
      bidPrice: partnerLabel.price,
      participants: partnersForModal,
      highlightParticipantIds: highlightedIds,
      shipmentId: shipment.id,
      shipperBranchOrgId,
      galleryBranchOrgId,
      bulkRecipients:
        partnersForModal.length > 1
          ? partnersForModal.map((partner) => ({
              id: partner.id,
              label: partner.name,
              shipmentId: shipment.id,
              shipperBranchOrgId: partner.branchOrgId || null,
              galleryBranchOrgId,
            }))
          : undefined,
    }).catch((launchError) => {
      logger.error('ShipmentDetail', 'Failed to open messaging modal', launchError);
      alert('Unable to open conversation. Please try again.');
    });
  };

  const handleDocumentUpload = async (file: File) => {
    if (!shipment?.id) return;
    setUploadError(null);
    setUploading(true);

    try {
      const created = await ShipmentService.createSignedUpload(shipment.id, file);
      if (!created) {
        throw new Error('Unable to initiate upload. Please verify your access and try again.');
      }

      const uploaded = await ShipmentService.uploadFileToSignedUrl(created.path, created.token, file);
      if (!uploaded) {
        throw new Error('Failed to upload file bytes. Please retry.');
      }

      const confirmed = await ShipmentService.confirmUpload(shipment.id, created.path, file.name);
      if (!confirmed) {
        throw new Error('Upload confirmation failed.');
      }

      await fetchShipments();
      await refreshDeletableDocuments(true);
    } catch (err) {
      console.error('Upload failed:', err);
      const message = err instanceof Error ? err.message : 'Unexpected error';
      const friendly = message.toLowerCase().includes('upload') ? message : `Upload failed: ${message}`;
      setUploadError(friendly);
    } finally {
      setUploading(false);
      clearFileInput();
    }
  };

  const PREVIEW_URL_REFRESH_MS = 240000; // 4 minutes

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

    if (docType === 'image' || docType === 'pdf') {
      const entry = previewUrlMap[docId];
      const needsRefetch = !entry || Date.now() - entry.fetchedAt > PREVIEW_URL_REFRESH_MS;
      if (!needsRefetch) return;

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
  };

  const handleDownloadDocument = async (doc: any) => {
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
    if (!shipment?.id || !doc?.id) return;
    const confirmDelete = window.confirm('Delete this document? This cannot be undone.');
    if (!confirmDelete) return;
    setDeletingDocId(doc.id);
    try {
      const deleted = await ShipmentService.deleteDocument(doc.id);
      if (!deleted) {
        throw new Error('Delete failed');
      }
      await fetchShipments();
      await refreshDeletableDocuments(true);
      clearPreviewStateForDoc(String(doc.id));
    } catch (err) {
      console.error('Delete failed:', err);
      alert(`Unable to delete document: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingDocId(null);
    }
  };

  // Ensure proposal JSON on current change request does not include empty origin/destination locations
  const sanitizeChangeRequestProposalIfNeeded = async (requestId: string) => {
    try {
      const req = (currentChangeRequests || []).find((cr: any) => cr?.id === requestId);
      if (!req?.proposal) return;
      const proposal = { ...(req.proposal || {}) } as any;
      let changed = false;

      // Remove origin_location if it's explicitly null or empty/missing address_full
      if (proposal.origin_location === null) {
        delete proposal.origin_location;
        if (Array.isArray(proposal.modified_fields)) {
          proposal.modified_fields = proposal.modified_fields.filter((f: string) => f !== 'origin_location');
        }
        changed = true;
      } else if (proposal.origin_location && (!proposal.origin_location.address_full || String(proposal.origin_location.address_full).trim() === '')) {
        delete proposal.origin_location;
        if (Array.isArray(proposal.modified_fields)) {
          proposal.modified_fields = proposal.modified_fields.filter((f: string) => f !== 'origin_location');
        }
        changed = true;
      }

      // Remove destination_location if it's explicitly null or empty/missing address_full
      if (proposal.destination_location === null) {
        delete proposal.destination_location;
        if (Array.isArray(proposal.modified_fields)) {
          proposal.modified_fields = proposal.modified_fields.filter((f: string) => f !== 'destination_location');
        }
        changed = true;
      } else if (proposal.destination_location && (!proposal.destination_location.address_full || String(proposal.destination_location.address_full).trim() === '')) {
        delete proposal.destination_location;
        if (Array.isArray(proposal.modified_fields)) {
          proposal.modified_fields = proposal.modified_fields.filter((f: string) => f !== 'destination_location');
        }
        changed = true;
      }

      if (!changed) return;

      const { error } = await supabase
        .from('shipment_change_requests')
        .update({ proposal })
        .eq('id', requestId);
      if (error) {
        console.warn('⚠️ Failed to sanitize change request proposal before accept/reject:', error);
      }
    } catch (e) {
      console.warn('⚠️ Error sanitizing change request proposal:', e);
    }
  };

  useEffect(() => {
    if (shipment?.id) {
      fetchShipmentChangeRequests(shipment.id);
    }
  }, [shipment?.id, fetchShipmentChangeRequests]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!shipment?.id) {
        setDeletableDocIds([]);
        return;
      }
      const ids = await ShipmentService.getDeletableDocumentIds(shipment.id);
      if (!cancelled) {
        setDeletableDocIds(ids);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shipment?.id]);

  useEffect(() => {
    setQuoteDetails(initialQuote ?? null);
    setQuoteError(null);
    quoteFetchIdRef.current = initialQuote?.invites?.length ? initialQuote.id : null;
    setQuoteLoading(Boolean(shipment?.quote_id) && !initialQuote);
  }, [initialQuote, shipment?.quote_id]);

  useEffect(() => {
    setExpandedAcceptedBids({});
  }, [shipment?.id]);

  useEffect(() => {
    if (!shipment?.quote_id || !currentOrg?.id) {
      setQuoteLoading(false);
      quoteFetchIdRef.current = null;
      return;
    }

    const quoteMatchesShipment = quoteDetails?.id === shipment.quote_id;
    const hasInvites = Boolean(quoteMatchesShipment && quoteDetails?.invites?.length);

    if (hasInvites) {
      setQuoteLoading(false);
      quoteFetchIdRef.current = shipment.quote_id;
      return;
    }

    if (quoteFetchIdRef.current === shipment.quote_id) {
      return;
    }

    let cancelled = false;
    quoteFetchIdRef.current = shipment.quote_id;
    setQuoteLoading(true);
    setQuoteError(null);

    (async () => {
      const { data, error } = await QuoteService.getQuote(shipment.quote_id, currentOrg.id);

      if (cancelled) {
        return;
      }

      if (error) {
        console.error('ShipmentDetail', 'Failed to load quote details', error);
        setQuoteError('Unable to load invited shippers.');
        quoteFetchIdRef.current = null;
        setQuoteLoading(false);
        return;
      }

      if (data) {
        setQuoteDetails(data);
        quoteFetchIdRef.current = data.id;
      }

      setQuoteLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [shipment?.quote_id, currentOrg?.id, quoteDetails?.id]);

  useEffect(() => {
    if (!quoteDetails) {
      setCounterOfferAmount(null);
      setCounterOfferNotes(null);
      setCounterBidId(null);
      return;
    }

    const pendingRequest =
      (currentChangeRequests || []).find((cr: any) => cr?.status === 'pending' || cr?.status === 'countered') ||
      currentChangeRequests?.[0];
    const targetBidId = pendingRequest?.counter_bid_id;
    const counterBid = targetBidId
      ? quoteDetails.bids?.find((b: any) => b?.id === targetBidId)
      : quoteDetails.bids?.find(
          (b: any) =>
            b?.status === 'counter_offer' ||
            (b?.status === 'needs_confirmation' && Boolean(b?.needs_confirmation_at))
        );

    if (counterBid) {
      setCounterOfferAmount(counterBid.amount || null);
      setCounterOfferNotes(counterBid.notes || null);
      setCounterBidId(counterBid.id || null);
      setCounterBidBranchOrgId(counterBid.branch_org?.id || counterBid.branch_org_id || null);
    } else {
      setCounterOfferAmount(null);
      setCounterOfferNotes(null);
      setCounterBidId(null);
      setCounterBidBranchOrgId(null);
    }
  }, [quoteDetails, currentChangeRequests]);

  const counterBidLineItems = useMemo(() => {
    if (!counterBidId || !quoteDetails?.bids?.length) return [];
    const bid = quoteDetails.bids.find((b: any) => b?.id === counterBidId);
    return bid?.line_items || [];
  }, [counterBidId, quoteDetails?.bids]);

  const counterLineItemComparisons = useMemo(() => {
    if (!counterBidLineItems.length) return [];
    const allItems = new Map(counterBidLineItems.map((item: any) => [item.id, item]));
    const computeTotal = (row: any) =>
      Number(row?.total_amount ?? Number(row?.quantity ?? 0) * Number(row?.unit_price ?? 0));
    return counterBidLineItems
      .filter((item: any) => item && item.is_active !== false)
      .map((item: any) => {
        const previous = item.supersedes_id ? allItems.get(item.supersedes_id) : null;
        const totalCurrent = computeTotal(item);
        const totalPrevious = computeTotal(previous);
        const prevDescArr = Array.isArray(previous?.description) ? previous.description : [];
        const currDescArr = Array.isArray(item.description) ? item.description : [];
        const hasChanges =
          !previous ||
          Number(previous?.quantity ?? 0) !== Number(item.quantity ?? 0) ||
          Number(previous?.unit_price ?? 0) !== Number(item.unit_price ?? 0) ||
          totalPrevious !== totalCurrent ||
          (!!previous?.is_optional) !== (!!item.is_optional) ||
          joinDescriptions(prevDescArr) !== joinDescriptions(currDescArr);
        return {
          id: item.id,
          category: item.category,
          description: currDescArr,
          previous: {
            quantity: previous?.quantity,
            unit_price: previous?.unit_price,
            total: totalPrevious,
            is_optional: previous?.is_optional,
            description: prevDescArr,
          },
          current: {
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: totalCurrent,
            is_optional: item.is_optional,
            description: currDescArr,
          },
          hasChanges,
        };
      });
  }, [counterBidLineItems]);
  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'TBD';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('⚠️ Invalid date in ShipmentDetail:', dateString);
        return 'TBD';
      }
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      console.error('❌ Date parsing error in ShipmentDetail:', error);
      return 'TBD';
    }
  };

  const invitedPartners = useMemo<InviteSummary[]>(() => {
    if (!quoteDetails) return [];

    const bidsByParticipantKey = new Map<string, any>(
      (quoteDetails.bids || []).map((bid: any) => {
        const branch = bid.branch_org || null;
        const branchOrgId = branch?.id || bid.branch_org_id || null;
        const partnerId = bid.logistics_partner_id || null;
        const participantKey = makeParticipantKey(partnerId, branchOrgId, bid.id);
        return [participantKey, bid];
      })
    );

    const dedupe = new Map<string, InviteSummary>();

    (quoteDetails.invites || []).forEach((invite: any) => {
      const partner = invite.logistics_partner || {};
      const branchNetwork = invite.branch_network || (invite as any).branchNetwork || null;
      const partnerId = invite.logistics_partner_id || partner.id || null;
      const branch = invite.branch_org || null;
      const branchOrgId = branch?.id || invite.branch_org_id || null;
      const participantKey = makeParticipantKey(partnerId, branchOrgId, invite.id);
      const bidForPartner = bidsByParticipantKey.get(participantKey);

      const partnerCompanyName = extractCompanyName(partner, branchNetwork);
      const branchLabel = extractBranchName(branch, branchNetwork, partnerCompanyName);
      const partnerName = partnerCompanyName || branchLabel || 'Unknown Shipper';
      const abbreviation =
        (typeof partner.abbreviation === 'string' && partner.abbreviation.trim()) ||
        deriveInitials(partnerName);
      const branchLogoUrl = normalizeLabel(branchNetwork?.logoUrl);
      const remoteLogo =
        branchLogoUrl ||
        branch?.img_url ||
        partner.organization?.img_url ||
        (partner as any)?.logo_url ||
        null;
      const { primaryUrl, localUrl, remoteUrl } = resolveOrganizationLogo(
        [
          branchLabel,
          branchNetwork?.displayName ?? null,
          branchNetwork?.companyName ?? null,
          partner.organization?.name ?? null,
          partnerName,
        ],
        remoteLogo
      );
      const [primaryLogoUrl, secondaryLogoUrl] = collectUniqueUrls(
        branchLogoUrl,
        primaryUrl,
        localUrl,
        remoteUrl
      );

      dedupe.set(participantKey, {
        id: participantKey,
        participantKey,
        inviteId: invite.id,
        partnerId,
        branchOrgId: branchOrgId || null,
        name: partnerName,
        branchName: branchLabel,
        partnerName,
        abbreviation,
        brandColor: partner.brand_color || '#00aaab',
        imageUrl: primaryLogoUrl ?? null,
        fallbackImageUrl: secondaryLogoUrl ?? null,
        localLogoUrl: localUrl,
        remoteLogoUrl: remoteUrl,
        contactEmail: partner.contact_email || partner.organization?.contact_email || null,
        hasBid: Boolean(bidForPartner),
        bidAmount: bidForPartner?.amount,
        bidStatus: bidForPartner?.status || null,
        invitedAt: invite.invited_at || null,
      });
    });

    return Array.from(dedupe.values()).sort((a, b) => {
      if (a.hasBid === b.hasBid) {
        return (a.name || '').localeCompare(b.name || '');
      }
      return a.hasBid ? -1 : 1;
    });
  }, [quoteDetails]);

  const acceptedParticipantKeys = useMemo(() => {
    return new Set(
      invitedPartners
        .filter((invite) => invite.bidStatus === 'accepted')
        .map((invite) => invite.participantKey)
    );
  }, [invitedPartners]);

  const visibleInvitedPartners = useMemo(() => {
    if (acceptedParticipantKeys.size === 0) {
      return invitedPartners;
    }
    return invitedPartners.filter((invite) => acceptedParticipantKeys.has(invite.participantKey));
  }, [acceptedParticipantKeys, invitedPartners]);

  const hasAcceptedBid = acceptedParticipantKeys.size > 0;

  const acceptedBidDetailsMap = useMemo<Map<string, AcceptedBidDisplay>>(() => {
    const map = new Map<string, AcceptedBidDisplay>();
    if (!quoteDetails?.bids?.length) {
      return map;
    }

    quoteDetails.bids
      .filter((bid: any) => bid?.status === 'accepted')
      .forEach((bid: any) => {
        const branch = bid.branch_org || null;
        const branchNetwork = (bid as any).branch_network || null;
        const branchOrgId = branch?.id || bid.branch_org_id || null;
        const partner = bid.logistics_partner || ({} as any);
        const partnerCompanyName = extractCompanyName(partner, branchNetwork);
        const shipperName = partnerCompanyName || 'Unknown Shipper';
        const branchLabel = extractBranchName(branch, branchNetwork, partnerCompanyName);
        const abbreviation =
          (typeof partner?.abbreviation === 'string' && partner.abbreviation.trim()) ||
          deriveInitials(shipperName);
        const rawBrandColor = typeof partner?.brand_color === 'string' ? partner.brand_color : '#666666';
        const branchLogoUrl = normalizeLabel(branchNetwork?.logoUrl);
        const remoteLogo =
          branchLogoUrl ||
          branch?.img_url ||
          partner?.organization?.img_url ||
          (partner as any)?.logo_url ||
          null;
        const { primaryUrl, localUrl, remoteUrl } = resolveOrganizationLogo(
          [
            branchLabel,
            branchNetwork?.displayName ?? null,
            branchNetwork?.companyName ?? null,
            partner?.organization?.name ?? null,
            shipperName,
          ],
          remoteLogo
        );
        const [primaryLogoUrl, secondaryLogoUrl] = collectUniqueUrls(
          branchLogoUrl,
          primaryUrl,
          localUrl,
          remoteUrl
        );
        const lineItems = Array.isArray((bid as any).line_items)
          ? ((bid as any).line_items as BidLineItemDisplay[])
          : [];
        const optionalCount = lineItems.filter((item) => Boolean(item?.is_optional)).length;
        const showBreakdown = Boolean((bid as any).show_breakdown ?? bid.show_breakdown);
        const breakdownLocked = !showBreakdown && lineItems.length === 0;
        const summaryLabel = lineItems.length
          ? `${lineItems.length} ${lineItems.length === 1 ? 'line item' : 'line items'}${
              optionalCount > 0 ? ` • ${optionalCount} optional` : ''
            }`
          : breakdownLocked
            ? 'Shipper has hidden the breakdown for this estimate.'
            : 'No line items shared yet.';
        const co2Value = typeof bid.co2_estimate === 'number' ? bid.co2_estimate : 0;
        const roundedCo2 = Math.round(co2Value * 100) / 100;
        const co2Label = roundedCo2 > 0 ? `${roundedCo2} kg CO₂e` : 'CO₂ not provided';
        const deliveryLabel = formatTransitTime((bid as any).estimated_transit_time);
        const specialServices = Array.isArray(bid.special_services) ? bid.special_services : [];
        const specialServicesLabel = specialServices.length
          ? `${specialServices.length} special service${specialServices.length === 1 ? '' : 's'}`
          : null;
        const lastUpdatedSource = bid.updated_at || bid.created_at || null;
        const lastUpdatedLabel = lastUpdatedSource
          ? new Date(lastUpdatedSource).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : null;

        const participantKey = makeParticipantKey(bid.logistics_partner_id || null, branchOrgId, bid.id);

        map.set(participantKey, {
          id: bid.id,
          participantKey,
          shipperName,
          branchLabel,
          abbreviation,
          brandColor: rawBrandColor || '#666666',
          imageUrl: primaryLogoUrl ?? null,
          fallbackImageUrl: secondaryLogoUrl ?? null,
          price: typeof bid.amount === 'number' ? bid.amount : 0,
          status: bid.status || 'accepted',
          deliveryLabel,
          co2Label,
          insuranceIncluded: Boolean(bid.insurance_included),
          specialServicesLabel,
          lineItems,
          breakdownLocked,
          summaryLabel,
          optionalCount,
          lastUpdatedLabel,
        });
      });
    return map;
  }, [quoteDetails?.bids]);

  const handleMessageInvitee = useCallback((invite: InviteSummary) => {
    if (hasAcceptedBid && !acceptedParticipantKeys.has(invite.participantKey)) {
      return;
    }

    const participantsForModal = visibleInvitedPartners.length > 0 ? visibleInvitedPartners : [invite];
    launchMessagingModal(participantsForModal, [invite.id], {
      name: invite.partnerName || invite.name,
      abbreviation: invite.abbreviation,
      brandColor: invite.brandColor,
      price: invite.bidAmount,
    });
  }, [acceptedParticipantKeys, hasAcceptedBid, visibleInvitedPartners, launchMessagingModal]);

  const handleMessageAllInvited = useCallback(() => {
    if (!visibleInvitedPartners.length) {
      return;
    }

    launchMessagingModal(visibleInvitedPartners, visibleInvitedPartners.map(invite => invite.id), {
      name: visibleInvitedPartners.length > 1
        ? 'Accepted shippers'
        : (visibleInvitedPartners[0].partnerName || visibleInvitedPartners[0].name),
      abbreviation: visibleInvitedPartners.length > 1 ? 'ALL' : visibleInvitedPartners[0].abbreviation,
      brandColor: '#00aaab',
    });
  }, [visibleInvitedPartners, launchMessagingModal]);

  const showInvitedPartnersCard = Boolean(shipment?.quote_id) && (quoteLoading || visibleInvitedPartners.length > 0 || quoteError);

  const toggleAcceptedBidDetails = useCallback((bidId: string) => {
    setExpandedAcceptedBids((prev) => ({
      ...prev,
      [bidId]: !prev[bidId],
    }));
  }, []);

  const toggleArtworkDetails = useCallback((artworkId: string) => {
    setExpandedArtworkIds((prev) => ({
      ...prev,
      [artworkId]: !prev[artworkId],
    }));
  }, []);

  // Format date and time
  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('⚠️ Invalid date in ShipmentDetail formatDateTime:', dateString);
        return { date: 'TBD', time: 'TBD' };
      }
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
    } catch (error) {
      console.error('❌ Date parsing error in ShipmentDetail formatDateTime:', error);
      return { date: 'TBD', time: 'TBD' };
    }
  };

  // Format status for display
  const formatStatus = (status: string) => {
    return status.replace('_', ' ').toUpperCase();
  };

  return (
    <>
      {/* Pending change banner with details */}
      {shipment.status === 'pending_change' && currentChangeRequests.length > 0 && (
        <div
          className="detail-card"
          style={{
            marginBottom: '16px',
            borderRadius: '16px',
            border: '1px solid #E9EAEB',
            boxShadow: '0 24px 60px rgba(10, 13, 18, 0.12)',
            background: '#FFFFFF',
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '12px',
                background: 'rgba(132, 18, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8412FF',
                fontWeight: 700,
                fontSize: '18px',
              }}
            >
              !
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: 'rgba(132, 18, 255, 0.1)',
                    color: '#8412FF',
                    fontWeight: 700,
                    fontSize: '12px',
                    letterSpacing: '0.2px',
                  }}
                >
                  Pending change
                </span>
                <strong style={{ color: '#170849', fontSize: '16px' }}>
                  A change request is awaiting shipper response.
                </strong>
              </div>
              <p style={{ margin: '6px 0 0', color: '#58517E', fontSize: '14px' }}>
                Review the proposed adjustments below and wait for the shipper to confirm or counter.
              </p>
            </div>
          </div>

          {(() => {
            const req = currentChangeRequests[0] || ({} as any);
            const proposal = (req.proposal || {}) as any;
            const gridStyles = {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
              gap: '14px',
            } as const;

            const chipLabel = (label: string) => (
              <span style={{ color: '#58517E', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2px' }}>{label}</span>
            );

            const formatDateValue = (value?: string | null) => {
              if (!value) return 'Not set';
              const parsed = new Date(value);
              if (Number.isNaN(parsed.getTime())) return value;
              return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };

            const summarizeLocation = (loc: any) => {
              if (!loc) return { title: 'Not set', subtitle: '' };
              const title = loc.name || loc.address_full || 'Not set';
              const subtitle = loc.address_full || '';
              return { title, subtitle };
            };

            const card = (
              label: string,
              proposedTitle?: React.ReactNode,
              currentTitle?: React.ReactNode,
              proposedSubtitle?: React.ReactNode,
              currentSubtitle?: React.ReactNode
            ) => (
              <div
                style={{
                  border: '1px solid #E9EAEB',
                  borderRadius: '12px',
                  padding: '12px',
                  background: '#FCFCFD',
                  minHeight: 110,
                  boxShadow: '0 8px 20px rgba(10, 13, 18, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {chipLabel(label)}
                <div style={{ color: '#170849', fontWeight: 700, marginTop: 4, fontSize: '15px' }}>{proposedTitle || '—'}</div>
                {proposedSubtitle && (
                  <div style={{ color: '#58517E', fontSize: '13px', lineHeight: 1.35 }}>{proposedSubtitle}</div>
                )}
                {(currentTitle || currentSubtitle) && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ color: '#58517E', fontSize: '12px', fontWeight: 600, letterSpacing: '0.2px' }}>Current</div>
                    <div style={{ color: '#170849', fontWeight: 600, fontSize: '14px' }}>{currentTitle || '—'}</div>
                    {currentSubtitle && (
                      <div style={{ color: '#58517E', fontSize: '13px', lineHeight: 1.35 }}>{currentSubtitle}</div>
                    )}
                  </div>
                )}
              </div>
            );

            const currentOrigin = summarizeLocation(shipment.origin || quoteDetails?.origin);
            const currentDestination = summarizeLocation(shipment.destination || quoteDetails?.destination);

            return (
              <div style={gridStyles}>
                {req.proposed_ship_date &&
                  card(
                    'Proposed ship date',
                    formatDateValue(req.proposed_ship_date),
                    formatDateValue(shipment.ship_date)
                  )}
                {req.proposed_delivery_date &&
                  card(
                    'Proposed delivery date',
                    formatDateValue(req.proposed_delivery_date),
                    formatDateValue(shipment.estimated_arrival)
                  )}
                {proposal.origin_location &&
                  card(
                    'Proposed origin',
                    summarizeLocation(proposal.origin_location).title,
                    currentOrigin.title,
                    summarizeLocation(proposal.origin_location).subtitle,
                    currentOrigin.subtitle
                  )}
                {proposal.destination_location &&
                  card(
                    'Proposed destination',
                    summarizeLocation(proposal.destination_location).title,
                    currentDestination.title,
                    summarizeLocation(proposal.destination_location).subtitle,
                    currentDestination.subtitle
                  )}
                {req.notes && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      border: '1px solid #E9EAEB',
                      borderRadius: '12px',
                      padding: '14px',
                      background: '#FFFFFF',
                      boxShadow: '0 8px 20px rgba(10, 13, 18, 0.06)',
                    }}
                  >
                    {chipLabel('Notes')}
                    <div style={{ color: '#170849', fontSize: '14px', marginTop: 4, lineHeight: 1.45 }}>{req.notes}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Counter-offer banner with actions */}
      {counterOfferAmount !== null && (
        <div className="detail-card" style={{ marginBottom: '16px', padding: 0, background: 'transparent' }}>
          <Box
            sx={{
              p: 3,
              border: '1px solid #E9EAEB',
              borderRadius: '12px',
              background: '#FCFCFD',
              boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Chip
                  label="Counter Offer"
                  sx={{
                    borderRadius: '999px',
                    backgroundColor: 'rgba(132,18,255,0.12)',
                    color: '#170849',
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    height: 26,
                  }}
                  size="small"
                />
                <Typography variant="body2" sx={{ color: '#58517E', fontWeight: 600 }}>
                  New price proposed
                </Typography>
              </Box>
              <Typography
                variant="h5"
                sx={{
                  color: '#170849',
                  fontWeight: 800,
                  fontSize: 22,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 1,
                }}
              >
                {formatCurrency(counterOfferAmount ?? 0)}
              </Typography>
            </Box>

            {counterOfferNotes && (
              <Typography variant="body2" sx={{ color: '#170849', lineHeight: 1.5 }}>
                {counterOfferNotes}
              </Typography>
            )}

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button 
                variant="contained" color="primary"
                disabled={acceptingCounter}
                onClick={async () => {
                  if (!shipment?.id) return;
                  try {
                    setAcceptingCounter(true);
                    const session = (await supabase.auth.getSession()).data.session;
                    const token = session?.access_token;
                    if (!token) throw new Error('Not signed in');
                    const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
                    const changeRequestId = (currentChangeRequests || []).find((cr: any) => cr?.status === 'pending' || cr?.status === 'countered')?.id || currentChangeRequests?.[0]?.id;
                    if (changeRequestId) {
                      await sanitizeChangeRequestProposalIfNeeded(changeRequestId);
                    }
                    const payload: any = {
                      p_change_request_id: changeRequestId,
                      p_bid_id: counterBidId,
                    };
                    if (!payload.p_change_request_id || !payload.p_bid_id) {
                      throw new Error('Missing change request or counter-offer bid');
                    }
                    const branchOrgId = counterBidBranchOrgId;
                    if (!branchOrgId) {
                      throw new Error('Counter offer is missing branch context.');
                    }
                    payload.p_branch_org_id = branchOrgId;
                    const resp = await fetch(`${API_BASE_URL}/api/accept-counter-offer`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify(payload)
                    });
                    const json = await resp.json().catch(() => ({} as any));
                    if (!resp.ok || !json?.ok) throw new Error((json?.error && (json.error.message || json.error)) || 'Accept failed');
                    await Promise.all([fetchShipments(), shipment?.quote_id ? fetchQuoteDetails(shipment.quote_id) : Promise.resolve(null), fetchQuotes()]);
                  } catch (err) {
                    console.error('Error accepting counter-offer:', err);
                    alert(`Failed to accept counter-offer: ${err instanceof Error ? err.message : 'Unknown error'}`);
                  } finally {
                    setAcceptingCounter(false);
                  }
                }}
                sx={{
                  borderRadius: '10px',
                  textTransform: 'none',
                  fontWeight: 700,
                  px: 2.75,
                  boxShadow: '0 14px 30px rgba(132,18,255,0.25)',
                  '&:hover': { boxShadow: '0 18px 32px rgba(115,10,221,0.35)' },
                }}
              >
                {acceptingCounter ? 'Accepting…' : 'Accept Counter Offer'}
              </Button>
              <Button 
                variant="outlined" color="error"
                disabled={rejectingCounter}
                onClick={async () => {
                  if (!shipment?.id) return;
                  try {
                    setRejectingCounter(true);
                    const session = (await supabase.auth.getSession()).data.session;
                    const token = session?.access_token;
                    if (!token) throw new Error('Not signed in');
                    const reason = window.prompt('Optional: provide a reason for rejecting the counter-offer') || undefined;
                    const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';
                    const changeRequestId = (currentChangeRequests || []).find((cr: any) => cr?.status === 'pending' || cr?.status === 'countered')?.id || currentChangeRequests?.[0]?.id;
                    if (changeRequestId) {
                      await sanitizeChangeRequestProposalIfNeeded(changeRequestId);
                    }
                    const payload: any = {
                      ...(reason ? { p_reason: reason } : {}),
                      p_change_request_id: changeRequestId,
                      p_bid_id: counterBidId,
                    };
                    if (!payload.p_change_request_id || !payload.p_bid_id) {
                      throw new Error('Missing change request or counter-offer bid');
                    }
                    const branchOrgId = counterBidBranchOrgId;
                    if (!branchOrgId) {
                      throw new Error('Counter offer is missing branch context.');
                    }
                    payload.p_branch_org_id = branchOrgId;
                    const resp = await fetch(`${API_BASE_URL}/api/reject-counter-offer`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify(payload)
                    });
                    const json = await resp.json().catch(() => ({} as any));
                    if (!resp.ok || !json?.ok) throw new Error((json?.error && (json.error.message || json.error)) || 'Reject failed');
                    await Promise.all([fetchShipments(), shipment?.quote_id ? fetchQuoteDetails(shipment.quote_id) : Promise.resolve(null), fetchQuotes()]);
                  } catch (err) {
                    console.error('Error rejecting counter-offer:', err);
                    alert(`Failed to reject counter-offer: ${err instanceof Error ? err.message : 'Unknown error'}`);
                  } finally {
                    setRejectingCounter(false);
                  }
                }}
                sx={{
                  borderRadius: '10px',
                  textTransform: 'none',
                  fontWeight: 700,
                  px: 2.4,
                  borderColor: '#D94E45',
                  color: '#D94E45',
                  background: 'rgba(217, 78, 69, 0.04)',
                  '&:hover': { borderColor: '#c23f38', background: 'rgba(217, 78, 69, 0.12)' },
                }}
              >
                {rejectingCounter ? 'Rejecting…' : 'Reject'}
              </Button>
            </Box>

            {counterLineItemComparisons.length > 0 && (
              <Box
                sx={{
                  mt: 2,
                  border: '1px solid #ececf2',
                  borderRadius: '12px',
                  overflowX: 'auto',
                }}
              >
                <Box
                  component="table"
                  sx={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    '& th, & td': { borderBottom: '1px solid #f3f3f5', p: 1.5, textAlign: 'left' },
                    '& th': { backgroundColor: '#faf9fd', fontSize: '13px', textTransform: 'uppercase', letterSpacing: 0.5 },
                  }}
                >
                  <thead>
                    <tr>
                      <th>Line Item</th>
                      <th>Original</th>
                      <th>Counter</th>
                    </tr>
                  </thead>
                <tbody>
                  {counterLineItemComparisons.map((item) => {
                    const prevDesc = joinDescriptions(item.previous.description as string[]);
                    const currDesc = joinDescriptions(item.current.description as string[]);
                    const delta = (item.current.total ?? 0) - (item.previous.total ?? 0);
                    const deltaColor = delta > 0 ? '#0DAB71' : delta < 0 ? '#D94E45' : '#58517E';
                    const deltaLabel = delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${formatCurrency(Math.abs(delta))}`;
                    const hasDescChange = prevDesc !== currDesc;
                    return (
                      <tr key={item.id} style={{ backgroundColor: item.hasChanges ? '#fff' : '#fdfdff' }}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#170849' }}>{humanizeLabel(item.category || 'Service')}</div>
                          {currDesc && (
                            <div style={{ fontSize: '12px', color: '#5f596c', marginTop: 4 }}>
                              {currDesc}
                            </div>
                          )}
                          {hasDescChange && (
                            <div style={{ fontSize: '12px', color: '#00AAAB', marginTop: 4 }}>
                              Updated from: {prevDesc || '—'}
                            </div>
                          )}
                        </td>
                        <td>
                          <div>Total: {item.previous.total != null ? formatCurrency(item.previous.total) : '—'}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>{item.current.total != null ? formatCurrency(item.current.total) : '—'}</strong>
                            <span style={{ color: deltaColor, fontWeight: 700, fontSize: '12px' }}>{deltaLabel}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </Box>
              </Box>
            )}
          </Box>
        </div>
      )}

      {/* Reopen quote for unassigned shipment */}
      {shipment.status === 'pending_approval' && shipment.quote_id && (
        <div className="detail-card" style={{ marginBottom: '16px' }}>
          <Alert severity="warning" sx={{ my: 1 }}>
            This shipment is unassigned. You may reopen the original quote to request new estimates.
          </Alert>
          <Button variant="contained" color="primary" onClick={async () => {
            await reopenQuote(shipment.quote_id as any);
            alert('Quote reopened for new estimates.');
          }}>
            Reopen Quote for Estimates
          </Button>
        </div>
      )}

      {/* Request Change button removed per user request */}
      <div className="shipment-detail-header">
        <h1>{shipment.name}</h1>
        <div className="tracking-info">
          <span>Tracking no. <strong>{shipment.code}</strong></span>
          <CopyButton text={shipment.code} size="small" />
        </div>
        {/* Client reference */}
        {shipment.client_reference && (
          <div className="tracking-info">
            <span>Reference no. <strong>{shipment.client_reference}</strong></span>
            <CopyButton text={shipment.client_reference} size="small" />
          </div>
        )}
      </div>

      <div className="shipment-detail-body">
        <div className="shipment-detail-left">
          <div className="detail-card">
            <h2>Shipping Info</h2>
            <div className="origin-destination">
              <div className="location">
                <h3>Origin</h3>
                <p>{shipment.origin?.address_full || 'Address TBD'}</p>
                <p>Contact: {shipment.origin?.contact_name || 'Contact TBD'}</p>
                {shipment.origin?.contact_phone && <p>Phone: {shipment.origin.contact_phone}</p>}
              </div>
              <div className="location">
                <h3>Destination</h3>
                <p>{shipment.destination?.address_full || 'Address TBD'}</p>
                <p>Contact: {shipment.destination?.contact_name || 'Contact TBD'}</p>
                {shipment.destination?.contact_phone && <p>Phone: {shipment.destination.contact_phone}</p>}
              </div>
            </div>
            <div className="shipping-meta">
                <div>
                    <h3>No. of artworks</h3>
                    <p>{shipment.artworks.length}</p>
                </div>
                 <div>
                    <h3>Total Value</h3>
                    <p>{formatCurrency(shipment.artworks.reduce((sum, art) => sum + (art.declared_value || 0), 0))}</p>
                </div>
                 <div>
                    <h3>Transport</h3>
                    <p>{shipment.transport_method || 'TBD'}</p>
                </div>
            </div>
          </div>

          {showInvitedPartnersCard && (
            <div className="detail-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: 0 }}>{hasAcceptedBid ? 'Selected shipper' : 'Invited shippers'}</h2>
                {(() => {
                  const messageAllDisabled = quoteLoading || visibleInvitedPartners.length === 0;
                  const ctaLabel = visibleInvitedPartners.length === 0
                    ? 'Messaging locked (estimate accepted)'
                    : hasAcceptedBid
                      ? 'Message accepted shipper(s)'
                      : 'Message all invited';

                  if (ctaLabel === 'Message all invited') {
                    return (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleMessageAllInvited}
                        disabled={messageAllDisabled}
                        sx={{
                          background: messageAllDisabled ? 'rgba(23, 8, 73, 0.12)' : '#00aaab',
                          color: messageAllDisabled ? 'rgba(23, 8, 73, 0.45)' : '#ffffff',
                          textTransform: 'none',
                          fontWeight: 600,
                          borderRadius: '999px',
                          px: 2,
                          boxShadow: 'none',
                          '&:hover': messageAllDisabled
                            ? { background: 'rgba(23, 8, 73, 0.12)', boxShadow: 'none' }
                            : { background: '#008a8b', boxShadow: 'none' },
                          '&.Mui-disabled': {
                            background: 'rgba(23, 8, 73, 0.12)',
                            color: 'rgba(23, 8, 73, 0.45)',
                          },
                        }}
                      >
                        {ctaLabel}
                      </Button>
                    );
                  }

                  if (ctaLabel === 'Message accepted shipper(s)') {
                    return null;
                  }

                  return (
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: ctaLabel === 'Messaging locked (estimate accepted)'
                          ? 'rgba(23, 8, 73, 0.6)'
                          : '#170849',
                      }}
                    >
                      {ctaLabel}
                    </Typography>
                  );
                })()}
              </div>

              {quoteError && !quoteLoading && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  {quoteError}
                </Alert>
              )}

              {quoteLoading ? (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`invite-skeleton-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0, 170, 171, 0.16)',
                        background: '#ffffff',
                        boxShadow: '0 6px 18px rgba(10, 13, 18, 0.05)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          background: 'rgba(0, 170, 171, 0.1)'
                        }}
                      />
                      <div style={{ flex: 1, display: 'grid', gap: '8px' }}>
                        <div style={{ width: '45%', height: 12, borderRadius: 6, background: 'rgba(23, 8, 73, 0.08)' }} />
                        <div style={{ width: '60%', height: 10, borderRadius: 6, background: 'rgba(23, 8, 73, 0.05)' }} />
                      </div>
                      <div
                        style={{
                          width: 82,
                          height: 28,
                          borderRadius: 999,
                          background: 'rgba(0, 170, 171, 0.12)'
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                visibleInvitedPartners.length > 0 && (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {visibleInvitedPartners.map((invite) => {
                      const isAccepted = invite.bidStatus === 'accepted';
                      const statusLabel = !invite.hasBid
                        ? 'No estimate submitted'
                        : isAccepted
                          ? 'Accepted'
                          : 'Estimate submitted';
                      const chipColors = !invite.hasBid
                        ? { backgroundColor: 'rgba(132, 18, 255, 0.12)', color: '#58517E' }
                        : isAccepted
                          ? { backgroundColor: 'rgba(13, 171, 113, 0.18)', color: '#0dab71' }
                          : { backgroundColor: 'rgba(13, 171, 113, 0.12)', color: '#0dab71' };
                      const inviteMessageDisabled = hasAcceptedBid && !acceptedParticipantKeys.has(invite.participantKey);
                      const acceptedBid = acceptedBidDetailsMap.get(invite.participantKey) || null;
                      const expanded = acceptedBid ? Boolean(expandedAcceptedBids[acceptedBid.id]) : false;
                      const breakdownLabel = expanded ? 'Hide breakdown' : 'View breakdown';
                      const showInlineAmount = invite.hasBid && typeof invite.bidAmount === 'number' && !acceptedBid;

                      return (
                        <div
                          key={invite.inviteId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            padding: '12px',
                            borderRadius: '10px',
                            border: invite.hasBid ? '1px solid rgba(13, 171, 113, 0.24)' : '1px solid rgba(0, 170, 171, 0.16)',
                            background: '#ffffff',
                            boxShadow: '0 6px 18px rgba(10, 13, 18, 0.05)'
                          }}
                        >
                          <div style={{ position: 'relative' }}>
                          <ShipperAvatar
                            name={invite.partnerName || invite.name}
                            abbreviation={invite.abbreviation}
                            brandColor={invite.brandColor}
                            imageUrl={invite.imageUrl ?? undefined}
                            fallbackImageUrl={invite.fallbackImageUrl ?? undefined}
                            size={48}
                          />
                          </div>
                          <div style={{ flex: 1 }}>
                            {(() => {
                              const primaryName = invite.partnerName || invite.name;
                              const branchLabel = invite.branchName && invite.branchName !== primaryName
                                ? invite.branchName
                                : null;
                              return (
                                <>
                                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#170849', marginBottom: branchLabel ? '2px' : '4px' }}>
                                    {primaryName}
                                  </div>
                                  {branchLabel && (
                                    <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', marginBottom: invite.contactEmail ? '4px' : '6px' }}>
                                      {branchLabel}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                            {invite.contactEmail && (
                              <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', marginBottom: '6px' }}>{invite.contactEmail}</div>
                            )}
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <Chip
                                label={statusLabel}
                                size="small"
                                sx={{
                                  ...chipColors,
                                  fontWeight: 600,
                                  fontSize: '11px'
                                }}
                              />
                              {showInlineAmount && (
                                <span style={{ marginLeft: '12px', fontSize: '12px', color: '#170849' }}>
                                  {formatCurrency(invite.bidAmount)}
                                </span>
                              )}
                            </div>
                            <div style={{ marginTop: '10px' }}>
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => handleMessageInvitee(invite)}
                                disabled={inviteMessageDisabled}
                                sx={{
                                  textTransform: 'none',
                                  fontWeight: 600,
                                  borderRadius: '999px',
                                  background: inviteMessageDisabled ? 'rgba(23, 8, 73, 0.12)' : '#00aaab',
                                  color: inviteMessageDisabled ? 'rgba(23, 8, 73, 0.45)' : '#ffffff',
                                  px: 2.5,
                                  boxShadow: inviteMessageDisabled ? 'none' : '0 6px 16px rgba(0, 138, 139, 0.3)',
                                  '&:hover': inviteMessageDisabled
                                    ? { background: 'rgba(23, 8, 73, 0.12)', boxShadow: 'none' }
                                    : { background: '#008a8b', boxShadow: '0 6px 16px rgba(0, 138, 139, 0.4)' },
                                  '&.Mui-disabled': {
                                    background: 'rgba(23, 8, 73, 0.12)',
                                    color: 'rgba(23, 8, 73, 0.45)',
                                  },
                                }}
                              >
                                Message
                              </Button>
                            </div>
                          </div>
                          {acceptedBid && (
                            <div
                              style={{
                                width: '100%',
                                marginTop: '12px',
                                borderTop: '1px solid rgba(0, 0, 0, 0.06)',
                                paddingTop: '12px'
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '13px', color: 'rgba(23, 8, 73, 0.65)', fontWeight: 600 }}>
                                    Accepted estimate · {(acceptedBid.status || 'accepted').replace('_', ' ')}
                                  </span>
                                  <strong
                                    style={{
                                      fontSize: '18px',
                                      color: '#170849',
                                      fontFamily: 'Space Grotesk, monospace',
                                      letterSpacing: '0.3px'
                                    }}
                                  >
                                    {formatCurrency(acceptedBid.price || 0)}
                                  </strong>
                                </div>
                                <Button
                                  variant="text"
                                  endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                  onClick={() => toggleAcceptedBidDetails(acceptedBid.id)}
                                  sx={{
                                    color: 'var(--color-primary)',
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    letterSpacing: '0.3px',
                                    px: 1,
                                    borderRadius: '999px'
                                  }}
                                >
                                  {breakdownLabel}
                                </Button>
                              </div>
                              <AnimatePresence initial={false}>
                                {expanded && (
                                  <motion.div
                                    key={`${acceptedBid.id}-breakdown`}
                                    initial={{ opacity: 0, height: 0, scaleY: 0.95 }}
                                    animate={{ opacity: 1, height: 'auto', scaleY: 1 }}
                                    exit={{ opacity: 0, height: 0, scaleY: 0.95 }}
                                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                                    style={{ overflow: 'hidden', transformOrigin: 'top center' }}
                                  >
                                    <div
                                      style={{
                                        marginTop: '14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        padding: '16px',
                                        borderRadius: '14px',
                                        background: 'rgba(132, 18, 255, 0.04)',
                                        border: '1px solid rgba(132, 18, 255, 0.18)',
                                        boxShadow: '0 18px 32px rgba(23, 8, 73, 0.08)'
                                      }}
                                    >
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        <Chip
                                          label={acceptedBid.deliveryLabel}
                                          size="small"
                                          sx={{ background: 'rgba(132, 18, 255, 0.12)', color: '#170849', fontWeight: 600 }}
                                        />
                                        <Chip
                                          label={acceptedBid.co2Label}
                                          size="small"
                                          sx={{ background: 'rgba(13, 171, 113, 0.12)', color: '#0DAB71', fontWeight: 600 }}
                                        />
                                        <Chip
                                          label={acceptedBid.insuranceIncluded ? 'Insurance included' : 'Insurance optional'}
                                          size="small"
                                          sx={{ background: 'rgba(35, 120, 218, 0.12)', color: '#2378DA', fontWeight: 600 }}
                                        />
                                        {acceptedBid.specialServicesLabel && (
                                          <Chip
                                            label={acceptedBid.specialServicesLabel}
                                            size="small"
                                            sx={{ background: 'rgba(181, 135, 232, 0.16)', color: '#58517E', fontWeight: 600 }}
                                          />
                                        )}
                                      </div>
                                      <motion.div
                                        layout
                                        initial={false}
                                        style={{
                                          borderRadius: '18px',
                                          overflow: 'hidden',
                                          border: acceptedBid.breakdownLocked ? '1px dashed rgba(132, 18, 255, 0.4)' : 'none'
                                        }}
                                      >
                                        <BidLineItemsCard
                                          lineItems={acceptedBid.lineItems}
                                          bidTotal={acceptedBid.price}
                                          isLocked={acceptedBid.breakdownLocked}
                                          lockedReason={
                                            acceptedBid.breakdownLocked
                                              ? 'Shipper has not enabled itemized breakdown for this estimate.'
                                              : undefined
                                          }
                                        />
                                      </motion.div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          )}

          {/* Temporarily hide condition report card at stakeholder request.
          <div className="detail-card">
            <h2>Condition</h2>
            <p>{shipment.condition_report || 'No condition report available.'}</p>
          </div>
          */}

          <div className="detail-card" style={{ background: 'transparent', padding: 0 }}>
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

              {uploadError && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  {uploadError}
                </Alert>
              )}

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
                              onClick={() => handleDownloadDocument(doc)}
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

              {canUploadDocuments && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={async (event) => {
                      const files = event.target.files;
                      if (!files || files.length === 0) return;
                      const file = files[0];
                      await handleDocumentUpload(file);
                    }}
                  />
                  <Button
                    variant="contained"
                    size="medium"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
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
                  <Typography
                    variant="body2"
                    sx={{
                      color: '#6E6A86',
                      fontSize: 12,
                      fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
                    }}
                  >
                    Accepted formats: PDF, PNG, JPG.
                  </Typography>
                </Box>
              )}
            </Box>
          </div>
        </div>

        <div className="shipment-detail-right">
          <div className="detail-card">
            <div className="route-map-container">
              <RouteMap
                origin={shipment.origin?.address_full || shipment.origin?.name || ''}
                destination={shipment.destination?.address_full || shipment.destination?.name || ''}
                originCoordinates={originCoordinates}
                destinationCoordinates={destinationCoordinates}
                allowGeocoding={false}
              />
            </div>
          </div>
          <div className="detail-card">
            <h2>Route</h2>
            <ul className="tracking-history">
              {shipment.tracking_events.length === 0 ? (
                <li>No tracking events available.</li>
              ) : (
                shipment.tracking_events.map((event) => {
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
          </div>
        </div>
      </div>
       <div className="detail-card artworks-table">
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
                    {shipment.artworks.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>
                          No artworks in this shipment.
                        </td>
                      </tr>
                    ) : (
                      shipment.artworks.map((artwork) => {
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
        </div>

      {/* Cancel Shipment action (disabled if pending change) */}
      {shipment.status === 'checking' && (
        <div className="detail-card" style={{ marginTop: '12px' }}>
          <Button 
            variant="outlined" 
            color="error" 
            disabled={false}
            onClick={async () => {
              if (!window.confirm('Cancel this shipment? This will permanently mark it as cancelled.')) return;
              const reason = window.prompt('Optionally, enter a reason for cancellation:') || 'Cancelled by gallery';
              await ShipmentService.cancelShipment(shipment.id, reason);
              await fetchShipments();
            }}
          >
            Cancel Shipment
          </Button>
        </div>
      )}

      {/* Change Request Modal */}
      {changeModalOpen && (
        <ChangeRequestModal
          open={changeModalOpen}
          onClose={() => setChangeModalOpen(false)}
          submitting={submittingChangeRequest}
          onSubmit={async (values: ChangeRequestFormValues) => {
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
                  p_shipment_id: shipment.id,
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
              await fetchShipments();
            } catch (err) {
              console.error('Error creating change request:', err);
              alert(`Failed to create change request: ${err instanceof Error ? err.message : 'Unknown error'}`);
            } finally {
              setSubmittingChangeRequest(false);
              setChangeModalOpen(false);
            }
          }}
        />
      )}
    </>
  );
};

export default ShipmentDetail; 
