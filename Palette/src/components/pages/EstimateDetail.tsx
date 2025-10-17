import React, { useState, useEffect, useMemo } from 'react';
import { Button, Chip, Collapse, IconButton, Checkbox, FormControlLabel } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import EcoIcon from '@mui/icons-material/LocalFlorist';
import MessageIcon from '@mui/icons-material/Message';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SecurityIcon from '@mui/icons-material/Security';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import HomeIcon from '@mui/icons-material/Home';
import InventoryIcon from '@mui/icons-material/Inventory';
import DescriptionIcon from '@mui/icons-material/Description';
import NoteIcon from '@mui/icons-material/Note';
import { useNavigate } from 'react-router-dom';
import type { QuoteWithDetails, BidWithPartner } from '../../lib/supabase/quotes';
import { formatTargetDateRange } from '../../lib/utils/dateUtils';
import ShipperAvatar from '../ShipperAvatar';
import BidLineItemsCard from '../bids/BidLineItemsCard';
import CompareBidsModal, { type ComparableBid } from '../bids/CompareBidsModal';
import useSupabaseStore from '../../store/useSupabaseStore';
import logger from '../../lib/utils/logger';
import CopyButton from '../CopyButton';
import useMessagingUiStore from '../../store/messagingUiStore';
import useCurrency from '../../hooks/useCurrency';
import RouteMap from '../Map';
import CountdownClock from '../../../../shared/ui/CountdownClock';

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

interface EstimateDetailProps {
  estimate: QuoteWithDetails;
}

interface TransformedBid {
  id: string;
  partnerId?: string | null;
  branchOrgId?: string | null;
  participantKey: string;
  shipper: {
    name: string;
    abbreviation: string;
    avatar: string;
    rating: number;
    brandColor: string;
    imageUrl?: string | null;
    companyName?: string | null;
    branchName?: string | null;
    branchOrgId?: string | null;
  };
  price: number;
  co2Tonnes: number;
  deliveryTime: string;
  timestamp: string;
  status: string;
  notes?: string;
  insuranceIncluded: boolean;
  specialServices: string[];
  line_items?: Array<{
    id: string;
    category: string;
    description: string;
    quantity: number | null;
    unit_price: number;
    total_amount: number | null;
    is_optional: boolean | null;
    notes: string | null;
    sort_order: number | null;
  }>;
  showBreakdown: boolean;
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
  invitedAt?: string | null;
};

const EstimateDetail: React.FC<EstimateDetailProps> = ({ estimate }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'lowest' | 'eco'>('all');
  const [showAllBids, setShowAllBids] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const fetchQuoteDetails = useSupabaseStore(state => state.fetchQuoteDetails);
  const acceptBid = useSupabaseStore(state => state.acceptBid);
  const [selectedBidIds, setSelectedBidIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const openMessagingModal = useMessagingUiStore((state) => state.openForQuote);
  const { formatCurrency } = useCurrency();

  // Parse delivery specifics (prefer dedicated column with fallback to legacy requirements field)
  const requirements = (estimate.requirements as any) || {};
  const deliverySpecifics = (estimate as any).delivery_specifics || requirements.delivery_specifics || {};

  const invitedPartners = useMemo<InviteSummary[]>(() => {
    const bidsByParticipantKey = new Map<string, any>(
      (estimate.bids || []).map((bid: any) => {
        const branch = bid.branch_org || null;
        const branchOrgId = branch?.id || bid.branch_org_id || null;
        const partnerId = bid.logistics_partner_id || null;
        const participantKey = makeParticipantKey(partnerId, branchOrgId, bid.id);
        return [participantKey, bid];
      })
    );

    const dedupe = new Map<string, InviteSummary>();

    (estimate.invites || []).forEach((invite: any) => {
      const partner = invite.logistics_partner || {};
      const partnerId = invite.logistics_partner_id || partner.id || null;
      const branch = invite.branch_org || null;
      const branchOrgId = invite.branch_org_id || branch?.id || null;
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
        invitedAt: invite.invited_at || null,
      });
    });

    return Array.from(dedupe.values()).sort((a, b) => {
      if (a.hasBid === b.hasBid) {
        return (a.name || '').localeCompare(b.name || '');
      }
      return a.hasBid ? -1 : 1;
    });
  }, [estimate.invites, estimate.bids]);

  const transformBidData = (bid: BidWithPartner, index: number): TransformedBid => {
    // Parse estimated transit time from PostgreSQL interval
    let deliveryTime = 'TBD';
    if (bid.estimated_transit_time) {
      const timeStr = bid.estimated_transit_time.toString();
      // PostgreSQL interval format parsing
      if (timeStr.includes('day')) {
        const days = parseInt(timeStr);
        deliveryTime = `${days} ${days === 1 ? 'day' : 'days'}`;
      } else if (timeStr.includes('week')) {
        const weeks = parseInt(timeStr);
        deliveryTime = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
      } else if (timeStr.includes(':')) {
        // Handle time format like "03:00:00" (3 hours)
        deliveryTime = 'Same day';
      } else {
        deliveryTime = timeStr;
      }
    }

    const branch = bid.branch_org || null;
    const branchOrgId = branch?.id || bid.branch_org_id || null;
    const branchLabel = (branch?.branch_name || branch?.name || '').trim();
    const partner = bid.logistics_partner || ({} as any);
    const partnerName = partner?.name || 'Unknown Partner';
    const displayName = branchLabel || partnerName;
    const abbreviation = branchLabel
      ? deriveInitials(branchLabel)
      : (partner?.abbreviation || deriveInitials(partnerName));
    const rawBrandColor = typeof partner?.brand_color === 'string' ? partner.brand_color : '#666666';
    const safeColor = (rawBrandColor || '#666666').replace('#', '') || '666666';
    const imageUrl = branch?.img_url || partner?.organization?.img_url || null;
    const participantKey = makeParticipantKey(bid.logistics_partner_id || null, branchOrgId, bid.id);

    const transformedBid: TransformedBid = {
      id: bid.id,
      partnerId: bid.logistics_partner_id || null,
      branchOrgId,
      participantKey,
      shipper: {
        name: displayName,
        abbreviation,
        avatar: `https://placehold.co/40x40/${safeColor}/ffffff?text=${abbreviation}`,
        rating: partner?.rating || 0,
        brandColor: rawBrandColor || '#666666',
        imageUrl,
        companyName: partnerName,
        branchName: branchLabel || null,
        branchOrgId,
      },
      price: bid.amount,
      co2Tonnes: Math.round((bid.co2_estimate || 0) * 100) / 100, // Round to 2 decimal places
      deliveryTime,
      timestamp: bid.created_at,
      status: bid.status,
      notes: bid.notes || undefined,
      insuranceIncluded: bid.insurance_included || false,
      specialServices: bid.special_services || [],
      line_items: (bid as any).line_items || [],
      showBreakdown: Boolean((bid as any).show_breakdown ?? bid.show_breakdown)
    };

    console.log('🔄 EstimateDetail transformBidData:', {
      bidId: bid.id,
      logisticsPartner: bid.logistics_partner,
      organization: bid.logistics_partner?.organization,
      orgId: bid.logistics_partner?.org_id,
      branchOrg: branch,
      branchOrgId,
      finalImageUrl: transformedBid.shipper.imageUrl,
      rawBidData: bid
    });

    return transformedBid;
  };

  const transformedBids: TransformedBid[] = useMemo(() => {
    if (!Array.isArray(estimate.bids) || estimate.bids.length === 0) {
      return [];
    }

    return estimate.bids.map((bid, index) => transformBidData(bid, index));
  }, [estimate.bids]);

  const acceptedParticipantKeys = useMemo(() => {
    return new Set(
      transformedBids
        .filter((bid) => bid.status === 'accepted')
        .map((bid) => bid.participantKey)
    );
  }, [transformedBids]);

  const hasAcceptedBid = acceptedParticipantKeys.size > 0;

  const visibleInvitedPartners = useMemo(() => {
    if (acceptedParticipantKeys.size === 0) {
      return invitedPartners;
    }
    return invitedPartners.filter((invite) => acceptedParticipantKeys.has(invite.participantKey));
  }, [acceptedParticipantKeys, invitedPartners]);

  // Debug: Log bid statuses to verify they're coming from Supabase correctly
  logger.debug('EstimateDetail', `Loaded ${transformedBids.length} bids for estimate with status: ${estimate.status}`);

  const getSortedBids = () => {
    const sorted = [...transformedBids];
    
    // For completed estimates, always show accepted bid first, then rejected bids
    if (estimate.status === 'completed') {
      return sorted.sort((a, b) => {
        if (a.status === 'accepted' && b.status !== 'accepted') return -1;
        if (b.status === 'accepted' && a.status !== 'accepted') return 1;
        // If both are same status, sort by amount
        return a.price - b.price;
      });
    }
    
    // For active estimates, use the filter tabs
    switch (activeTab) {
      case 'lowest':
        return sorted.sort((a, b) => a.price - b.price);
      case 'eco':
        return sorted.sort((a, b) => {
          // Sort by CO2, with 0 values at the end
          if (a.co2Tonnes === 0 && b.co2Tonnes === 0) return 0;
          if (a.co2Tonnes === 0) return 1;
          if (b.co2Tonnes === 0) return -1;
          return a.co2Tonnes - b.co2Tonnes;
        });
      default:
        return sorted.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      // Handle invalid dates by putting them at the end
      if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;
      return dateB.getTime() - dateA.getTime();
    });
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    logger.debug('EstimateDetail', 'Accepting bid');

    const bid = transformedBids.find((item) => item.id === bidId);
    if (!bid) {
      console.error('Bid not found in transformed list', bidId);
      return;
    }

    if (!bid.branchOrgId) {
      const message = 'Cannot accept this bid until it is associated with a branch.';
      console.error(message, bid);
      alert(message);
      return;
    }

    try {
      const result = await acceptBid({
        p_quote_id: estimate.id,
        p_bid_id: bidId,
        p_branch_org_id: bid.branchOrgId,
      });

      if (result.error) {
        console.error('Failed to accept bid:', result.error);
        alert(`Failed to accept bid: ${result.error}`);
      } else {
        logger.success('EstimateDetail', 'Bid accepted successfully');
        await fetchQuoteDetails(estimate.id);
      }
    } catch (err) {
      console.error('Error accepting bid:', err);
      alert(`Error accepting bid: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMessageBidder = (bid: TransformedBid) => {
    logger.debug('EstimateDetail', 'Opening message with shipper');

    const matchingInvite = invitedPartners.find(invite => invite.participantKey === bid.participantKey)
      || (bid.partnerId ? invitedPartners.find(invite => invite.partnerId === bid.partnerId) : undefined);

    const fallbackParticipant: InviteSummary = matchingInvite || {
      id: bid.participantKey,
      participantKey: bid.participantKey,
      inviteId: matchingInvite?.inviteId || `bid-${bid.id}`,
      partnerId: bid.partnerId || null,
      branchOrgId: bid.branchOrgId || null,
      name: bid.shipper.name,
      branchName: bid.shipper.branchName,
      partnerName: bid.shipper.companyName || bid.shipper.name,
      abbreviation: bid.shipper.abbreviation,
      brandColor: matchingInvite?.brandColor || bid.shipper.brandColor || '#00aaab',
      imageUrl: matchingInvite?.imageUrl || bid.shipper.imageUrl || null,
      contactEmail: matchingInvite?.contactEmail || null,
      hasBid: true,
      bidAmount: bid.price,
      invitedAt: matchingInvite?.invitedAt || null,
    };

    const participantsForModal = invitedPartners.length > 0
      ? (matchingInvite ? invitedPartners : [...invitedPartners, fallbackParticipant])
      : [fallbackParticipant];

    const route = estimate.route || `${estimate.origin?.name || 'TBD'} → ${estimate.destination?.name || 'TBD'}`;
    const conversationTitle = estimate.client_reference ? `REF: ${estimate.client_reference}` : estimate.title;

    openMessagingModal({
      quoteId: estimate.id,
      quoteTitle: conversationTitle,
      quoteRoute: route,
      quoteValue: estimate.value || 0,
      targetDateStart: estimate.target_date_start,
      targetDateEnd: estimate.target_date_end,
      quoteType: estimate.type,
      bidderName: bid.shipper.name,
      bidderAbbreviation: bid.shipper.abbreviation,
      bidderColor: fallbackParticipant.brandColor,
      bidPrice: bid.price,
      participants: participantsForModal,
      highlightParticipantIds: [fallbackParticipant.participantKey],
      shipmentId: estimate.shipment_id || null,
      shipperBranchOrgId: fallbackParticipant.branchOrgId || null,
      galleryBranchOrgId: estimate.owner_org?.id || estimate.owner_org_id || null,
    }).catch((launchError) => {
      logger.error('EstimateDetail', 'Failed to open messaging modal for bid', launchError);
    });
  };

  const handleMessageInvitee = (invite: InviteSummary) => {
    if (hasAcceptedBid && !acceptedParticipantKeys.has(invite.participantKey)) {
      return;
    }

    const participantsForModal = visibleInvitedPartners.length > 0 ? visibleInvitedPartners : [invite];

    const route = estimate.route || `${estimate.origin?.name || 'TBD'} → ${estimate.destination?.name || 'TBD'}`;
    const conversationTitle = estimate.client_reference ? `REF: ${estimate.client_reference}` : estimate.title;
    const displayName = invite.partnerName && invite.partnerName !== invite.name
      ? `${invite.name} (${invite.partnerName})`
      : invite.name;

    openMessagingModal({
      quoteId: estimate.id,
      quoteTitle: conversationTitle,
      quoteRoute: route,
      quoteValue: estimate.value || 0,
      targetDateStart: estimate.target_date_start,
      targetDateEnd: estimate.target_date_end,
      quoteType: estimate.type,
      bidderName: displayName,
      bidderAbbreviation: invite.abbreviation,
      bidderColor: invite.brandColor,
      bidPrice: invite.bidAmount,
      participants: participantsForModal,
      highlightParticipantIds: [invite.id],
      shipmentId: estimate.shipment_id || null,
      shipperBranchOrgId: invite.branchOrgId || null,
      galleryBranchOrgId: estimate.owner_org?.id || estimate.owner_org_id || null,
    }).catch((launchError) => {
      logger.error('EstimateDetail', 'Failed to open messaging modal for invitee', launchError);
    });
  };

  const handleMessageAllInvited = () => {
    if (!visibleInvitedPartners.length) {
      return;
    }

    const route = estimate.route || `${estimate.origin?.name || 'TBD'} → ${estimate.destination?.name || 'TBD'}`;
    const conversationTitle = estimate.client_reference ? `REF: ${estimate.client_reference}` : estimate.title;

    openMessagingModal({
      quoteId: estimate.id,
      quoteTitle: conversationTitle,
      quoteRoute: route,
      quoteValue: estimate.value || 0,
      targetDateStart: estimate.target_date_start,
      targetDateEnd: estimate.target_date_end,
      quoteType: estimate.type,
      bidderName: visibleInvitedPartners.length > 1 ? 'Accepted partners' : visibleInvitedPartners[0].name,
      bidderAbbreviation: visibleInvitedPartners.length > 1 ? 'ALL' : visibleInvitedPartners[0].abbreviation,
      bidderColor: '#00aaab',
      participants: visibleInvitedPartners,
      highlightParticipantIds: visibleInvitedPartners.map((invite) => invite.id),
      shipmentId: estimate.shipment_id || null,
      shipperBranchOrgId: null,
      galleryBranchOrgId: estimate.owner_org?.id || estimate.owner_org_id || null,
      bulkRecipients: visibleInvitedPartners.map((invite) => ({
        id: invite.id,
        label: invite.name,
        shipmentId: estimate.shipment_id || null,
        shipperBranchOrgId: invite.branchOrgId || null,
        galleryBranchOrgId: estimate.owner_org?.id || estimate.owner_org_id || null,
      })),
    }).catch((launchError) => {
      logger.error('EstimateDetail', 'Failed to open messaging modal for all invitees', launchError);
    });
  };

  const route = estimate.route || `${estimate.origin?.name || 'TBD'} → ${estimate.destination?.name || 'TBD'}`;
  const biddingDeadline = (estimate as any).bidding_deadline ?? estimate.bidding_deadline ?? null;
  const manualClose = (estimate as any).auto_close_bidding === false;
  const originAddress = estimate.origin?.address_full || estimate.origin?.name || '';
  const destinationAddress = estimate.destination?.address_full || estimate.destination?.name || '';
  const bidsReceived = estimate.bids?.length || 0;
  const bestPrice = bidsReceived > 0 ? Math.min(...estimate.bids.map(bid => bid.amount)) : 0;

  // Track expanded bids (accordion)
  const [expandedBids, setExpandedBids] = useState<Record<string, boolean>>({});
  const toggleExpanded = (bidId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedBids(prev => ({ ...prev, [bidId]: !prev[bidId] }));
  };

  const toggleBidSelection = (bidId: string) => {
    setSelectedBidIds(prev => {
      if (prev.includes(bidId)) {
        return prev.filter(id => id !== bidId);
      }
      return [...prev, bidId];
    });
  };
  const clearBidSelection = () => setSelectedBidIds([]);

  useEffect(() => {
    if (!selectedBidIds.length) {
      return;
    }

    const validIds = selectedBidIds.filter(id => transformedBids.some(bid => bid.id === id));
    if (validIds.length !== selectedBidIds.length) {
      setSelectedBidIds(validIds);
    }
  }, [selectedBidIds, transformedBids]);

const selectedComparableBids: ComparableBid[] = transformedBids
  .filter(bid => selectedBidIds.includes(bid.id))
  .map(bid => ({
    id: bid.id,
    shipper: bid.shipper,
      price: bid.price,
      deliveryTime: bid.deliveryTime,
      co2Tonnes: bid.co2Tonnes,
      status: bid.status,
      isWinning: bid.status === 'accepted',
      line_items: bid.line_items
  }));

  const renderInvitedPartnersCard = () => {
    if (!visibleInvitedPartners.length) return null;

    return (
      <div
        style={{
          marginBottom: '32px',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid rgba(0, 170, 171, 0.18)',
          background: 'rgba(0, 170, 171, 0.08)',
          boxShadow: '0 12px 30px rgba(0, 27, 28, 0.08)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {hasAcceptedBid ? 'Selected partners' : 'Invited partners'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: '#170849' }}>
              {visibleInvitedPartners.length} partner{visibleInvitedPartners.length === 1 ? '' : 's'} {hasAcceptedBid ? 'selected for this estimate' : 'invited to bid'}
            </div>
          </div>
          {(() => {
            const messageAllDisabled = visibleInvitedPartners.length === 0;
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
                  px: 2.5,
                  boxShadow: 'none',
                  whiteSpace: 'nowrap',
                  '&:hover': messageAllDisabled
                    ? { background: 'rgba(23, 8, 73, 0.12)', boxShadow: 'none' }
                    : { background: '#008a8b', boxShadow: 'none' },
                  '&.Mui-disabled': {
                    background: 'rgba(23, 8, 73, 0.12)',
                    color: 'rgba(23, 8, 73, 0.45)',
                  },
                }}
              >
                {messageAllDisabled
                  ? 'Messaging locked (bid accepted)'
                  : hasAcceptedBid
                    ? 'Message accepted partner(s)'
                    : 'Message all invited'}
              </Button>
            );
          })()}
        </div>

        <div
          style={{
            display: 'grid',
            gap: '16px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
          }}
        >
          {visibleInvitedPartners.map(invite => (
            <div
              key={invite.inviteId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px',
                borderRadius: '12px',
                background: '#ffffff',
                border: invite.hasBid ? '1px solid rgba(13, 171, 113, 0.24)' : '1px solid rgba(0, 170, 171, 0.18)',
                boxShadow: '0 8px 24px rgba(0, 27, 28, 0.08)'
              }}
            >
              <div style={{ position: 'relative' }}>
                <ShipperAvatar
                  name={invite.name}
                  abbreviation={invite.abbreviation}
                  brandColor={invite.brandColor}
                  imageUrl={invite.imageUrl}
                  size={52}
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#170849', marginBottom: '4px' }}>{invite.name}</div>
                {invite.partnerName && invite.partnerName !== invite.name && (
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', marginBottom: invite.contactEmail ? '4px' : '6px' }}>
                    {invite.partnerName}
                  </div>
                )}
                {invite.contactEmail && (
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', marginBottom: '6px' }}>{invite.contactEmail}</div>
                )}
                <div>
                  <Chip
                    label={invite.hasBid ? 'Bid submitted' : 'Awaiting bid'}
                    size="small"
                    sx={{
                      backgroundColor: invite.hasBid ? 'rgba(13, 171, 113, 0.12)' : 'rgba(132, 18, 255, 0.12)',
                      color: invite.hasBid ? '#0dab71' : '#58517E',
                      fontWeight: 600,
                      fontSize: '11px'
                    }}
                  />
                  {invite.hasBid && typeof invite.bidAmount === 'number' && (
                    <span style={{ marginLeft: '12px', fontSize: '12px', color: '#170849', fontWeight: 600 }}>
                      {formatCurrency(invite.bidAmount)}
                    </span>
                  )}
                </div>
              </div>
              {(() => {
                const inviteMessageDisabled = hasAcceptedBid && !acceptedParticipantKeys.has(invite.participantKey);
                const inviteButtonStyles = inviteMessageDisabled
                  ? {
                      borderColor: 'rgba(23, 8, 73, 0.2)',
                      color: 'rgba(23, 8, 73, 0.4)',
                      background: 'rgba(23, 8, 73, 0.06)',
                      cursor: 'not-allowed'
                    }
                  : {
                      borderColor: 'rgba(0, 170, 171, 0.5)',
                      color: '#008a8b',
                      background: 'transparent'
                    };
                return (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => handleMessageInvitee(invite)}
                    disabled={inviteMessageDisabled}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                      ...inviteButtonStyles,
                      '&:hover': inviteMessageDisabled
                        ? { borderColor: inviteButtonStyles.borderColor, background: inviteButtonStyles.background }
                        : { borderColor: '#008a8b', background: 'rgba(0, 170, 171, 0.08)' }
                    }}
                  >
                Message
                  </Button>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBidSummary = () => {
    if (estimate.status !== 'active' || bidsReceived <= 0) {
      return null;
    }

    return (
      <div
        style={{
          padding: '16px',
          background: 'rgba(132, 18, 255, 0.05)',
          borderRadius: '8px',
          marginBottom: '24px'
        }}
      >
        <div style={{ fontSize: '14px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '8px' }}>
          {bidsReceived} bids received
        </div>
        {bestPrice > 0 && (
          <div style={{ fontSize: '20px', fontWeight: 500, color: '#170849' }}>
            Best Price: <span style={{ color: '#2378da' }}>{formatCurrency(bestPrice)}</span>
          </div>
        )}
      </div>
    );
  };

  const renderHeader = () => (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>{estimate.title}</h2>
        <div className={`tag ${estimate.status === 'active' ? 'green' : estimate.status === 'completed' ? 'blue' : 'yellow'}`}>
          {estimate.status}
        </div>
      </div>

      {renderInvitedPartnersCard()}

      <div className="tracking-info" style={{ marginBottom: '8px' }}>
        <span>Reference no. <strong>REF: {estimate.client_reference || estimate.title}</strong></span>
        <CopyButton text={estimate.client_reference || estimate.title} size="small" />
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '16px',
        marginBottom: '24px',
        background: '#FFFFFF',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #E9EAEB',
        boxShadow: '0 0 40px rgba(10, 13, 18, 0.06)'
      }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Route</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)' }}>{route}</div>
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Target Date</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)' }}>
            {formatTargetDateRange(estimate.target_date_start, estimate.target_date_end)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Value</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)' }}>
            {formatCurrency(estimate.value || 0)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Type</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)' }}>
            {estimate.type === 'auction' ? 'Auction' : 'Direct Quote'}
          </div>
        </div>
        {requirements.transport_method && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Transport Method</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)' }}>
              {requirements.transport_method}
            </div>
          </div>
        )}
        {requirements.insurance_type && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Insurance</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)' }}>
              {requirements.insurance_type}
            </div>
          </div>
        )}
        {deliverySpecifics.delivery_requirements && deliverySpecifics.delivery_requirements.length > 0 && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Delivery Requirements</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)' }}>
              {deliverySpecifics.delivery_requirements.slice(0, 2).join(', ')}
              {deliverySpecifics.delivery_requirements.length > 2 && (
                <span style={{ color: 'rgba(23, 8, 73, 0.7)', fontWeight: 500 }}>
                  {' '}+{deliverySpecifics.delivery_requirements.length - 2} more
                </span>
              )}
            </div>
          </div>
        )}
        {estimate.client_reference && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Reference no.</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.85)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'rgba(23, 8, 73, 0.7)', fontWeight: 500 }}>
                {estimate.client_reference}
              </span>
              <CopyButton text={estimate.client_reference} size="small" />
            </div>
          </div>
        )}
        {(biddingDeadline || manualClose) && (
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#170849', marginBottom: '6px' }}>Countdown</div>
            <CountdownClock
              deadline={biddingDeadline}
              manualClose={manualClose}
              size="small"
            />
            {!manualClose && biddingDeadline && (
              <div style={{ fontSize: '11px', color: 'rgba(23, 8, 73, 0.6)', marginTop: '4px' }}>
                Deadline: {new Date(biddingDeadline).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {(originAddress || destinationAddress) && (
        <div className="detail-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
          <div className="route-map-container">
            <RouteMap origin={originAddress} destination={destinationAddress} />
          </div>
        </div>
      )}

      {renderBidSummary()}
    </div>
  );

  // Component for rendering requirement lists
  const RequirementsList: React.FC<{ 
    title: string; 
    icon: React.ReactNode; 
    items: string[]; 
    emptyText?: string 
  }> = ({ title, icon, items, emptyText = 'None specified' }) => (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '12px',
        color: '--color-text-dark'
      }}>
        {icon}
        <h4 style={{ 
          margin: 0, 
          fontSize: '18px', 
          fontWeight: 600, 
          color: '#170849' 
        }}>
          {title}
        </h4>
      </div>
      {items && items.length > 0 ? (
        <ul style={{ 
          margin: 0, 
          paddingLeft: '28px',
          color: '#181D27'
        }}>
          {items.map((item, index) => (
            <li key={index} style={{ 
              marginBottom: '4px',
              fontSize: '14px',
              lineHeight: '1.4'
            }}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ 
          margin: 0, 
          fontSize: '14px', 
          color: 'rgba(23, 8, 73, 0.7)',
          fontStyle: 'italic',
          paddingLeft: '28px'
        }}>
          {emptyText}
        </p>
      )}
    </div>
  );

  return (
    <div className="estimate-detail" style={{ padding: '24px' }}>
      {renderHeader()}

      {bidsReceived > 0 && (
        <>
          {/* Show different header for completed vs active estimates */}
          {estimate.status === 'completed' ? (
            <div style={{ 
              padding: '16px',
              background: 'rgba(13, 171, 113, 0.05)',
              borderRadius: '12px',
              border: '1px solid rgba(13, 171, 113, 0.2)',
              marginBottom: '20px'
            }}>
              <h3 style={{ 
                margin: '0 0 8px 0', 
                fontSize: '16px', 
                fontWeight: 600, 
                color: 'var(--color-success)' 
              }}>
                Bidding Completed
              </h3>
              <p style={{ 
                margin: 0, 
                fontSize: '13px', 
                color: 'rgba(23, 8, 73, 0.7)' 
              }}>
                This quote is now closed. The winning bid is highlighted below.
              </p>
            </div>
          ) : (
            /* Filtering Tabs - Only show for active estimates */
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              {[
                { key: 'all', label: 'All Bids' },
                { key: 'lowest', label: 'Lowest Price' },
                { key: 'eco', label: 'Most Eco-Friendly' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '20px',
                    border: activeTab === tab.key ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: activeTab === tab.key ? 'rgba(132, 18, 255, 0.1)' : '#ffffff',
                    color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    letterSpacing: '0.2px',
                    boxShadow: activeTab === tab.key ? '0 2px 8px rgba(132, 18, 255, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.key) {
                      e.currentTarget.style.background = 'rgba(132, 18, 255, 0.05)';
                      e.currentTarget.style.borderColor = '#c4b5fd';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.key) {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {selectedBidIds.length >= 2 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                border: '1px solid rgba(132, 18, 255, 0.2)',
                background: 'rgba(132, 18, 255, 0.08)',
                borderRadius: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#170849' }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>
                  {selectedBidIds.length} bids selected
                </span>
                <Chip
                  label="Compare ready"
                  size="small"
                  sx={{
                    background: '#ffffff',
                    color: 'var(--color-primary)',
                    fontWeight: 600
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button
                  variant="text"
                  onClick={clearBidSelection}
                  sx={{ textTransform: 'none', fontWeight: 600, color: '#58517E' }}
                >
                  Clear
                </Button>
                <Button
                  variant="contained"
                  onClick={() => setCompareOpen(true)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    padding: '10px 28px',
                    borderRadius: '999px'
                  }}
                >
                  Compare {selectedBidIds.length}
                </Button>
              </div>
            </div>
          )}

          <div style={{ height: selectedBidIds.length >= 2 ? '16px' : '0' }} />

          {/* Bids */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {getSortedBids().slice(0, showAllBids ? transformedBids.length : 5).map((bid) => {
              const isWinningBid = bid.status === 'accepted';
              const isCompletedEstimate = estimate.status === 'completed';
              const isSelected = selectedBidIds.includes(bid.id);
              const lineItems = Array.isArray(bid.line_items)
                ? (bid.line_items as NonNullable<TransformedBid['line_items']>)
                : [];
              const optionalCount = lineItems.filter(item => item.is_optional).length;
              const lineItemsTotal = lineItems.reduce((sum, item) => {
                const quantity = Number(item.quantity ?? 1) || 1;
                const unit = Number(item.unit_price ?? 0) || 0;
                const fallbackTotal = quantity * unit;
                const raw = Number(item.total_amount ?? fallbackTotal);
                return sum + (Number.isFinite(raw) ? raw : fallbackTotal);
              }, 0);
              const displayBreakdownTotal = lineItemsTotal > 0 ? lineItemsTotal : bid.price;
              const breakdownLocked = estimate.status === 'active' && !bid.showBreakdown && lineItems.length === 0;
              const summaryLabel = lineItems.length
                ? `${lineItems.length} ${lineItems.length === 1 ? 'line item' : 'line items'}${optionalCount > 0 ? ` • ${optionalCount} optional` : ''}`
                : breakdownLocked
                  ? 'Shipper has hidden the breakdown for this active bid.'
                  : 'No line items shared yet.';
              const co2Label = bid.co2Tonnes > 0 ? `${bid.co2Tonnes} kg CO₂e` : 'CO₂ not provided';
              const deliveryLabel = bid.deliveryTime || 'Delivery TBD';
              const specialServicesLabel = bid.specialServices && bid.specialServices.length
                ? `${bid.specialServices.length} special service${bid.specialServices.length === 1 ? '' : 's'}`
                : null;
              const formattedPrice = formatCurrency(bid.price);
              const formattedBreakdownTotal = formatCurrency(displayBreakdownTotal);
              const lastUpdated = bid.timestamp ? new Date(bid.timestamp) : null;
              const lastUpdatedLabel = lastUpdated && !Number.isNaN(lastUpdated.getTime())
                ? lastUpdated.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : null;
              const statusStyles = (() => {
                switch (bid.status) {
                  case 'accepted':
                    return { background: 'rgba(13, 171, 113, 0.12)', color: '#0DAB71' };
                  case 'rejected':
                    return { background: 'rgba(217, 78, 69, 0.12)', color: '#D94E45' };
                  case 'pending':
                    return { background: 'rgba(132, 18, 255, 0.12)', color: '#8412FF' };
                  default:
                    return { background: 'rgba(24, 29, 39, 0.08)', color: '#58517E' };
                }
              })();
              const expanded = !!expandedBids[bid.id];
              const breakdownButtonLabel = expanded ? 'Hide breakdown' : 'View breakdown';
              const messageLabel = isCompletedEstimate ? 'Contact bidder' : 'Message bidder';
              const baseMessageStyles = isCompletedEstimate
                ? {
                    borderColor: '#58517E',
                    color: '#58517E',
                    hoverBorder: '#58517E',
                    hoverColor: '#58517E',
                    hoverBackground: 'rgba(88, 81, 126, 0.12)'
                  }
                : {
                    borderColor: '#00aaab',
                    color: '#00aaab',
                    hoverBorder: '#008a8b',
                    hoverColor: '#008a8b',
                    hoverBackground: 'rgba(0, 170, 171, 0.08)'
                  };
              const messageDisabled = hasAcceptedBid && bid.status !== 'accepted';
              const resolvedMessageStyles = messageDisabled
                ? {
                    borderColor: 'rgba(23, 8, 73, 0.2)',
                    color: 'rgba(23, 8, 73, 0.4)',
                    hoverBorder: 'rgba(23, 8, 73, 0.2)',
                    hoverColor: 'rgba(23, 8, 73, 0.4)',
                    hoverBackground: 'rgba(23, 8, 73, 0.06)'
                  }
                : baseMessageStyles;

              return (
                <article
                  key={bid.id}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    padding: '24px',
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid #E9EAEB',
                    boxShadow: isWinningBid ? '0 18px 36px rgba(13, 171, 113, 0.18)' : '0 8px 24px rgba(10, 13, 18, 0.08)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    opacity: isCompletedEstimate && bid.status === 'rejected' ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = isWinningBid
                      ? '0 20px 44px rgba(13, 171, 113, 0.24)'
                      : '0 16px 40px rgba(10, 13, 18, 0.12)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = isWinningBid
                      ? '0 18px 36px rgba(13, 171, 113, 0.18)'
                      : '0 8px 24px rgba(10, 13, 18, 0.08)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleBidSelection(bid.id)}
                          inputProps={{ 'aria-label': `Select bid from ${bid.shipper.name}` }}
                          sx={{ color: 'var(--color-primary)', '&.Mui-checked': { color: 'var(--color-primary)' } }}
                        />
                      )}
                      label="Compare"
                      sx={{
                        marginLeft: '-8px',
                        '.MuiFormControlLabel-label': {
                          fontSize: '13px',
                          color: '#58517E',
                          fontWeight: 600
                        }
                      }}
                    />
                  </div>
                  {isWinningBid && (
                    <Chip
                      icon={<StarIcon sx={{ fontSize: '16px !important' }} />}
                      label="Winning bid"
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: '#0DAB71',
                        color: '#FFFFFF',
                        fontWeight: 600,
                        boxShadow: '0 8px 20px rgba(13, 171, 113, 0.25)'
                      }}
                    />
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '20px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', minWidth: 0 }}>
                      <ShipperAvatar
                        name={bid.shipper.name}
                        abbreviation={bid.shipper.abbreviation}
                        brandColor={bid.shipper.brandColor}
                        imageUrl={bid.shipper.imageUrl}
                        size={56}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '16px', color: '#170849', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {bid.shipper.name}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {bid.shipper.rating > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#58517E' }}>
                              <StarIcon sx={{ width: '14px', height: '14px', color: '#E9932D' }} />
                              {bid.shipper.rating}/5 rating
                            </span>
                          )}
                          {lastUpdatedLabel && (
                            <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>
                              Received {lastUpdatedLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: '#170849', fontFamily: 'Space Grotesk, monospace' }}>
                        {formattedPrice}
                      </div>
                      <Chip
                        label={bid.status.replace('_', ' ')}
                        size="small"
                        sx={{ fontWeight: 600, fontSize: '12px', textTransform: 'capitalize', ...statusStyles }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <Chip
                      icon={<LocalShippingIcon sx={{ fontSize: '16px !important' }} />}
                      label={deliveryLabel}
                      size="small"
                      sx={{ background: 'rgba(132, 18, 255, 0.08)', color: '#170849', fontWeight: 600 }}
                    />
                    <Chip
                      icon={<EcoIcon sx={{ fontSize: '16px !important', color: '#0DAB71' }} />}
                      label={co2Label}
                      size="small"
                      sx={{ background: 'rgba(13, 171, 113, 0.12)', color: '#0DAB71', fontWeight: 600 }}
                    />
                    <Chip
                      icon={<SecurityIcon sx={{ fontSize: '16px !important' }} />}
                      label={bid.insuranceIncluded ? 'Insurance included' : 'Insurance optional'}
                      size="small"
                      sx={{ background: 'rgba(35, 120, 218, 0.12)', color: '#2378DA', fontWeight: 600 }}
                    />
                    {specialServicesLabel && (
                      <Chip
                        icon={<AssignmentTurnedInIcon sx={{ fontSize: '16px !important' }} />}
                        label={specialServicesLabel}
                        size="small"
                        sx={{ background: 'rgba(181, 135, 232, 0.16)', color: '#58517E', fontWeight: 600 }}
                      />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    <Button
                      variant="outlined"
                      size="medium"
                      startIcon={<MessageIcon sx={{ width: '18px', height: '18px' }} />}
                      onClick={() => handleMessageBidder(bid)}
                      disabled={messageDisabled}
                      sx={{
                        borderColor: resolvedMessageStyles.borderColor,
                        color: resolvedMessageStyles.color,
                        textTransform: 'none',
                        fontSize: '14px',
                        fontWeight: 600,
                        padding: '10px 20px',
                        borderRadius: '999px',
                        '&:hover': {
                          borderColor: resolvedMessageStyles.hoverBorder,
                          color: resolvedMessageStyles.hoverColor,
                          background: resolvedMessageStyles.hoverBackground
                        }
                      }}
                    >
                      {messageLabel}
                    </Button>
                    {bid.status === 'pending' && estimate.status === 'active' && (
                      <Button
                        variant="contained"
                        size="medium"
                        onClick={() => handleAcceptBid(bid.id)}
                        sx={{
                          background: 'var(--color-primary)',
                          color: '#ffffff',
                          textTransform: 'none',
                          fontSize: '14px',
                          fontWeight: 600,
                          padding: '10px 24px',
                          borderRadius: '999px',
                          '&:hover': {
                            background: 'var(--color-primary-dark)',
                            boxShadow: '0 8px 18px rgba(132, 18, 255, 0.35)'
                          }
                        }}
                      >
                        Accept bid
                      </Button>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: 'rgba(132, 18, 255, 0.06)'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', color: '#170849' }}>
                      <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.2px' }}>{summaryLabel}</span>
                    </div>
                    <Button
                      variant="text"
                      endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      onClick={() => toggleExpanded(bid.id)}
                      sx={{
                        color: 'var(--color-primary)',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '15px',
                        letterSpacing: '0.2px'
                      }}
                    >
                      {breakdownButtonLabel}
                    </Button>
                  </div>
                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                    <div style={{ marginTop: '8px' }}>
                      <BidLineItemsCard
                        lineItems={lineItems}
                        bidTotal={bid.price}
                        isLocked={breakdownLocked}
                        lockedReason={estimate.status === 'active' ? 'Shipper has not enabled itemized breakdown for this bid.' : undefined}
                      />
                    </div>
                  </Collapse>
                </article>
              );
            })}
          {transformedBids.length > 5 && (
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <Button
                  variant="text"
                  onClick={() => setShowAllBids(!showAllBids)}
                  sx={{
                    color: 'var(--color-primary)',
                    textTransform: 'none',
                    fontSize: '12px',
                    fontWeight: 500
                  }}
                >
                  {showAllBids 
                    ? 'Show fewer bids' 
                    : `View ${transformedBids.length - 5} more bids`
                  }
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {bidsReceived === 0 && (
        <div style={{
          padding: '48px',
          textAlign: 'center', 
          color: 'var(--color-text-muted)',
          background: '#f8f9fa',
          borderRadius: '12px'
        }}>
          No bids have been received for this quote yet.
        </div>
      )}

      <CompareBidsModal
        open={compareOpen}
        bids={selectedComparableBids}
        onClose={() => setCompareOpen(false)}
        onClearSelection={clearBidSelection}
      />

      {/* Draft State Actions */}
      {/* Additional Details Section - Moved to Bottom */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E9EAEB',
        marginTop: '24px',
        marginBottom: '24px',
        overflow: 'hidden',
        boxShadow: '0 0 40px rgba(10, 13, 18, 0.06)'
      }}>
        <div 
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            cursor: 'pointer',
            borderBottom: showMoreDetails ? '1px solid #E9EAEB' : 'none',
            background: showMoreDetails ? 'rgba(132, 18, 255, 0.02)' : '#FFFFFF',
            transition: 'all 0.2s ease'
          }}
          onClick={() => setShowMoreDetails(!showMoreDetails)}
          onMouseEnter={(e) => {
            if (!showMoreDetails) {
              e.currentTarget.style.background = 'rgba(132, 18, 255, 0.01)';
            }
          }}
          onMouseLeave={(e) => {
            if (!showMoreDetails) {
              e.currentTarget.style.background = '#FFFFFF';
            }
          }}
        >
          <h3 style={{ 
            margin: 0, 
            fontSize: '18px', 
            fontWeight: 500, 
            color: 'var(--color-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <DescriptionIcon sx={{ width: '20px', height: '20px', color: 'var(--color-primary)' }} />
            Additional Details
          </h3>
          <IconButton 
            size="small"
            sx={{ 
              color: 'var(--color-primary)',
              '&:hover': { 
                background: 'rgba(132, 18, 255, 0.08)' 
              }
            }}
          >
            {showMoreDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </div>
        
        <Collapse in={showMoreDetails}>
          <div style={{ padding: '24px' }}>
            {/* Description */}
            {estimate.description && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ 
                  margin: '0 0 12px 0', 
                  fontSize: '16px', 
                  fontWeight: 500, 
                  color: '#170849',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <DescriptionIcon sx={{ width: '16px', height: '16px', color: '#8412FF' }} />
                  Description
                </h4>
                <p style={{ 
                  margin: 0, 
                  fontSize: '14px', 
                  lineHeight: '1.4',
                  color: '#181D27',
                  background: 'rgba(224, 222, 226, 0.1)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(224, 222, 226, 0.3)'
                }}>
                  {estimate.description}
                </p>
              </div>
            )}

            {/* Notes */}
            {requirements.notes && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ 
                  margin: '0 0 12px 0', 
                  fontSize: '16px', 
                  fontWeight: 500, 
                  color: '#170849',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <NoteIcon sx={{ width: '16px', height: '16px', color: '#8412FF' }} />
                  Additional Notes
                </h4>
                <p style={{ 
                  margin: 0, 
                  fontSize: '14px', 
                  lineHeight: '1.4',
                  color: '#181D27',
                  background: 'rgba(224, 222, 226, 0.1)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(224, 222, 226, 0.3)',
                  whiteSpace: 'pre-wrap'
                }}>
                  {requirements.notes}
                </p>
              </div>
            )}

            {/* Delivery Requirements */}
            <RequirementsList
              title="Delivery Requirements"
              icon={<LocalShippingIcon sx={{ width: '16px', height: '16px', color: '#8412FF' }} />}
              items={deliverySpecifics.delivery_requirements || []}
            />

            {/* Packing Requirements */}
            {deliverySpecifics.packing_requirements && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  marginBottom: '12px'
                }}>
                  <InventoryIcon sx={{ width: '16px', height: '16px', color: '#8412FF' }} />
                  <h4 style={{ 
                    margin: 0, 
                    fontSize: '16px', 
                    fontWeight: 500, 
                    color: '#170849' 
                  }}>
                    Packing Requirements
                  </h4>
                </div>
                <p style={{ 
                  margin: 0, 
                  fontSize: '14px', 
                  lineHeight: '1.4',
                  color: '#181D27',
                  background: 'rgba(224, 222, 226, 0.1)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(224, 222, 226, 0.3)',
                  whiteSpace: 'pre-line'
                }}>
                  {deliverySpecifics.packing_requirements}
                </p>
              </div>
            )}

            {/* Access Requirements */}
            <RequirementsList
              title="Access Requirements"
              icon={<HomeIcon sx={{ width: '16px', height: '16px', color: '#8412FF' }} />}
              items={deliverySpecifics.access_requirements || []}
            />

            {/* Safety & Security Requirements */}
            <RequirementsList
              title="Safety & Security Requirements"
              icon={<SecurityIcon sx={{ width: '16px', height: '16px', color: '#8412FF' }} />}
              items={deliverySpecifics.safety_security_requirements || []}
            />

            {/* Condition Check Requirements */}
            <RequirementsList
              title="Condition Check Requirements"
              icon={<AssignmentTurnedInIcon sx={{ width: '16px', height: '16px', color: '#8412FF' }} />}
              items={deliverySpecifics.condition_check_requirements || []}
            />

            {/* Additional Requirements from requirements field */}
            {requirements && Object.keys(requirements).length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ 
                  margin: '0 0 12px 0', 
                  fontSize: '16px', 
                  fontWeight: 500, 
                  color: '#170849' 
                }}>
                  Additional Requirements
                </h4>
                <div style={{
                  background: 'rgba(224, 222, 226, 0.1)',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(224, 222, 226, 0.3)'
                }}>
                  {Object.entries(requirements)
                    .filter(([key]) => !['transport_method', 'insurance_type', 'delivery_specifics'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} style={{ marginBottom: '8px' }}>
                        <span style={{ 
                          fontSize: '12px', 
                          color: 'rgba(23, 8, 73, 0.7)',
                          textTransform: 'capitalize',
                          display: 'block',
                          marginBottom: '2px'
                        }}>
                          {key.replace(/_/g, ' ')}:
                        </span>
                        <span style={{ 
                          fontSize: '14px', 
                          color: '#181D27'
                        }}>
                          {Array.isArray(value) ? value.join(', ') : String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Collapse>
      </div>

      {estimate.status === 'draft' && (
        <Button
          variant="outlined"
          fullWidth
          onClick={() => navigate(`/estimates/${estimate.id}/edit`)}
          sx={{
            borderColor: 'var(--color-primary)',
            color: 'var(--color-primary)',
            textTransform: 'none',
            fontSize: '14px',
            fontWeight: 500,
            marginTop: '24px'
          }}
        >
          Edit Draft
        </Button>
      )}
      
    </div>
  );
};

export default EstimateDetail; 
