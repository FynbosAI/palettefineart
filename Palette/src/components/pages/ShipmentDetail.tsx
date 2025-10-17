import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShipmentWithDetails } from '../../lib/supabase';
import RouteMap from '../Map';
import CopyButton from '../CopyButton';
import { Alert, Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ChangeRequestModal, { ChangeRequestFormValues } from '../ChangeRequestModal';
import { supabase } from '../../lib/supabase';
import useSupabaseStore from '../../store/useSupabaseStore';
import useMessagingUiStore from '../../store/messagingUiStore';
import { QuoteService, ShipmentService } from '../../lib/supabase';
import ShipperAvatar from '../ShipperAvatar';
import type { QuoteWithDetails } from '../../lib/supabase';
import logger from '../../lib/utils/logger';
import { AnimatePresence, motion } from 'motion/react';
import useCurrency from '../../hooks/useCurrency';

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
  contactEmail?: string | null;
  hasBid: boolean;
  bidAmount?: number;
  bidStatus?: string | null;
  invitedAt?: string | null;
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

  const [counterOfferAmount, setCounterOfferAmount] = useState<number | null>(null);
  const [counterOfferNotes, setCounterOfferNotes] = useState<string | null>(null);
  const [counterBidId, setCounterBidId] = useState<string | null>(null);
  const [acceptingCounter, setAcceptingCounter] = useState(false);
  const [rejectingCounter, setRejectingCounter] = useState(false);

  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);

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
        setQuoteError('Unable to load invited partners.');
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

    const counterBid = quoteDetails.bids?.find((b: any) =>
      b?.status === 'counter_offer' || (b?.status === 'needs_confirmation' && Boolean(b?.needs_confirmation_at))
    );

    if (counterBid) {
      setCounterOfferAmount(counterBid.amount || null);
      setCounterOfferNotes(counterBid.notes || null);
      setCounterBidId(counterBid.id || null);
    } else {
      setCounterOfferAmount(null);
      setCounterOfferNotes(null);
      setCounterBidId(null);
    }
  }, [quoteDetails]);
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
      const partnerId = invite.logistics_partner_id || partner.id || null;
      const branch = invite.branch_org || null;
      const branchOrgId = branch?.id || invite.branch_org_id || null;
      const participantKey = makeParticipantKey(partnerId, branchOrgId, invite.id);
      const bidForPartner = bidsByParticipantKey.get(participantKey);

      const branchLabel = (branch?.branch_name || branch?.name || '').trim();
      const partnerName = partner.name || 'Logistics Partner';
      const displayName = branchLabel || partnerName;
      const abbreviation = branchLabel
        ? deriveInitials(branchLabel)
        : (partner.abbreviation || deriveInitials(partnerName));
      const imageUrl = branch?.img_url || partner.organization?.img_url || null;

      dedupe.set(participantKey, {
        id: participantKey,
        participantKey,
        inviteId: invite.id,
        partnerId,
        branchOrgId: branchOrgId || null,
        name: displayName,
        branchName: branchLabel || null,
        partnerName,
        abbreviation,
        brandColor: partner.brand_color || '#00aaab',
        imageUrl,
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

  const handleMessageInvitee = useCallback((invite: InviteSummary) => {
    if (hasAcceptedBid && !acceptedParticipantKeys.has(invite.participantKey)) {
      return;
    }

    const participantsForModal = visibleInvitedPartners.length > 0 ? visibleInvitedPartners : [invite];
    launchMessagingModal(participantsForModal, [invite.id], {
      name: invite.name,
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
      name: visibleInvitedPartners.length > 1 ? 'Accepted partners' : visibleInvitedPartners[0].name,
      abbreviation: visibleInvitedPartners.length > 1 ? 'ALL' : visibleInvitedPartners[0].abbreviation,
      brandColor: '#00aaab',
    });
  }, [visibleInvitedPartners, launchMessagingModal]);

  const showInvitedPartnersCard = Boolean(shipment?.quote_id) && (quoteLoading || visibleInvitedPartners.length > 0 || quoteError);

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
        <div className="detail-card" style={{ marginBottom: '16px' }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Pending Change:</strong> A change request has been submitted and is awaiting shipper response.
          </Alert>
          {(() => {
            const req = currentChangeRequests[0] || {} as any;
            const proposal = (req.proposal || {}) as any;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
                {req.proposed_ship_date && (
                  <div><small style={{ color: '#58517E' }}>Proposed ship date</small><div><strong>{req.proposed_ship_date}</strong></div></div>
                )}
                {req.proposed_delivery_date && (
                  <div><small style={{ color: '#58517E' }}>Proposed delivery date</small><div><strong>{req.proposed_delivery_date}</strong></div></div>
                )}
                {proposal.origin_location && (
                  <div>
                    <small style={{ color: '#58517E' }}>Proposed origin</small>
                    <div><strong>{proposal.origin_location.name || '—'}</strong></div>
                    <div style={{ color: '#58517E' }}>{proposal.origin_location.address_full || ''}</div>
                  </div>
                )}
                {proposal.destination_location && (
                  <div>
                    <small style={{ color: '#58517E' }}>Proposed destination</small>
                    <div><strong>{proposal.destination_location.name || '—'}</strong></div>
                    <div style={{ color: '#58517E' }}>{proposal.destination_location.address_full || ''}</div>
                  </div>
                )}
                {req.notes && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <small style={{ color: '#58517E' }}>Notes</small>
                    <div>{req.notes}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Counter-offer banner with actions */}
      {counterOfferAmount !== null && (
        <div className="detail-card" style={{ marginBottom: '16px' }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Counter Offer:</strong> New price proposed: <strong>{formatCurrency(counterOfferAmount ?? 0)}</strong>
            {counterOfferNotes ? <span> — {counterOfferNotes}</span> : null}
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
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
            >
              {acceptingCounter ? 'Accepting…' : 'Accept Counter-Offer'}
            </Button>
            <Button 
              variant="outlined" color="secondary"
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
            >
              {rejectingCounter ? 'Rejecting…' : 'Reject Counter-Offer'}
            </Button>
          </Box>
        </div>
      )}

      {/* Reopen quote for unassigned shipment */}
      {shipment.status === 'pending_approval' && shipment.quote_id && (
        <div className="detail-card" style={{ marginBottom: '16px' }}>
          <Alert severity="warning" sx={{ my: 1 }}>
            This shipment is unassigned. You may reopen the original quote to request new bids.
          </Alert>
          <Button variant="contained" color="primary" onClick={async () => {
            await reopenQuote(shipment.quote_id as any);
            alert('Quote reopened for new bids.');
          }}>
            Reopen Quote for Bidding
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
                <h2 style={{ margin: 0 }}>{hasAcceptedBid ? 'Selected partner' : 'Invited partners'}</h2>
                {(() => {
                  const messageAllDisabled = quoteLoading || visibleInvitedPartners.length === 0;
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
                      {visibleInvitedPartners.length === 0
                        ? 'Messaging locked (bid accepted)'
                        : hasAcceptedBid
                          ? 'Message accepted partner(s)'
                          : 'Message all invited'}
                </Button>
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
                          background: 'rgba(0, 170, 171, 0.1)'
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
                        ? 'Did not bid'
                        : isAccepted
                          ? 'Accepted'
                          : 'Bid submitted';
                      const chipColors = !invite.hasBid
                        ? { backgroundColor: 'rgba(132, 18, 255, 0.12)', color: '#58517E' }
                        : isAccepted
                          ? { backgroundColor: 'rgba(13, 171, 113, 0.18)', color: '#0dab71' }
                          : { backgroundColor: 'rgba(13, 171, 113, 0.12)', color: '#0dab71' };
                      const inviteMessageDisabled = hasAcceptedBid && !acceptedParticipantKeys.has(invite.participantKey);

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
                              name={invite.name}
                              abbreviation={invite.abbreviation}
                              brandColor={invite.brandColor}
                              imageUrl={invite.imageUrl}
                              size={48}
                            />
                            {invite.hasBid && (
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: -6,
                                  right: -6,
                                  background: '#0dab71',
                                  color: '#ffffff',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: '999px',
                                  boxShadow: '0 2px 6px rgba(13, 171, 113, 0.3)'
                                }}
                              >
                                Bid in
                              </span>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: '#170849', marginBottom: '4px' }}>{invite.name}</div>
                            {invite.partnerName && invite.partnerName !== invite.name && (
                              <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', marginBottom: invite.contactEmail ? '4px' : '6px' }}>
                                {invite.partnerName}
                              </div>
                            )}
                            {invite.contactEmail && (
                              <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', marginBottom: '6px' }}>{invite.contactEmail}</div>
                            )}
                            <div style={{ marginTop: '6px' }}>
                              <Chip
                                label={statusLabel}
                                size="small"
                                sx={{
                                  ...chipColors,
                                  fontWeight: 600,
                                  fontSize: '11px'
                                }}
                              />
                              {invite.hasBid && typeof invite.bidAmount === 'number' && (
                                <span style={{ marginLeft: '12px', fontSize: '12px', color: '#170849' }}>
                                  {formatCurrency(invite.bidAmount)}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleMessageInvitee(invite)}
                            disabled={inviteMessageDisabled}
                            sx={{
                              textTransform: 'none',
                              fontWeight: 600,
                              borderRadius: '999px',
                              borderColor: inviteMessageDisabled ? 'rgba(23, 8, 73, 0.2)' : 'rgba(0, 170, 171, 0.5)',
                              color: inviteMessageDisabled ? 'rgba(23, 8, 73, 0.4)' : '#008a8b',
                              background: inviteMessageDisabled ? 'rgba(23, 8, 73, 0.06)' : 'transparent',
                              '&:hover': inviteMessageDisabled
                                ? { borderColor: 'rgba(23, 8, 73, 0.2)', background: 'rgba(23, 8, 73, 0.06)' }
                                : { borderColor: '#008a8b', background: 'rgba(0, 170, 171, 0.08)' },
                              '&.Mui-disabled': {
                                borderColor: 'rgba(23, 8, 73, 0.2)',
                                color: 'rgba(23, 8, 73, 0.4)',
                                background: 'rgba(23, 8, 73, 0.06)',
                              },
                            }}
                          >
                            Message
                          </Button>
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
                origin={shipment.origin?.address_full || ''} 
                destination={shipment.destination?.address_full || ''} 
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
                      shipment.artworks.map((artwork) => (
                        <tr key={artwork.id}>
                            <td>{artwork.name}</td>
                            <td>{artwork.artist_name || 'Unknown'}</td>
                            <td>{artwork.year_completed || 'Unknown'}</td>
                            <td>{formatCurrency(artwork.declared_value)}</td>
                            <td>{artwork.medium || 'Unknown'}</td>
                            <td><button>Notes</button></td>
                        </tr>
                      ))
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
