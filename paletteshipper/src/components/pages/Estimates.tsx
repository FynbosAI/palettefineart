import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Button,
  CircularProgress,
  Alert,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuotes, useAuth, useLoadingState, useBids, useBranchNetwork } from '../../hooks/useStoreSelectors';
import useMessagingUiStore from '../../store/messagingUiStore';
import useChatStore from '../../store/chatStore';
import { motion } from 'motion/react';
import { easeStandard, slideInLeft } from '../../lib/motion';
import { computeDeadlineState } from '../../lib/deadline';
import useCurrency from '../../hooks/useCurrency';
import { downloadCsv } from '../../../../shared/export/csv';
import CountdownClock from '../../../../shared/ui/CountdownClock';
import { findOrganizationLogoUrl } from '../../lib/organizationLogos';

type FilterKey = 'all' | 'available' | 'bidded' | 'lost';

const TEN_DAYS_IN_MS = 10 * 24 * 60 * 60 * 1000;

const Estimates = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [supplementalQuoteDetails, setSupplementalQuoteDetails] = useState<Record<string, any>>({});
  const { formatCurrency } = useCurrency();
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  
  // Get data from new store
  const { availableQuotes, fetchAvailableQuotes } = useQuotes();
  const { logisticsPartner, user, organization } = useAuth();
  const { loading, error } = useLoadingState();
  const { myBids, fetchMyBids, withdrawBid: withdrawBidAction } = useBids();
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const openMessagingModal = useMessagingUiStore((state) => state.openForQuote);
  const openPeerThread = useChatStore((state) => state.openPeerThread);
  const { branchNetwork, branchNetworkLoading, fetchBranchNetwork } = useBranchNetwork();
  const [peerDialogOpen, setPeerDialogOpen] = useState(false);
  const [peerDialogQuote, setPeerDialogQuote] = useState<any | null>(null);
  const [peerMessagingBranchId, setPeerMessagingBranchId] = useState<string | null>(null);
  const location = useLocation();

  // Local vertical entrance variants (mirrors Shipments pattern)
  const slideInTop = {
    hidden: { opacity: 0, y: -24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeStandard } },
  } as const;

  // Cards should also come from the top (drop into place)
  const slideInDown = {
    hidden: { opacity: 0, y: -24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeStandard } },
  } as const;

  const cardStagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
  } as const;

  // Gate animations so they only run once per page mount
  const hasAnimatedRef = useRef(false);
  const motionInitial = hasAnimatedRef.current ? false : 'hidden';

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  // Debug logging
  useEffect(() => {
    console.log('📍 Estimates Page - Current state:', {
      user: user?.email,
      organization: organization,
      logisticsPartner: logisticsPartner,
      availableQuotesCount: availableQuotes.length,
      availableQuotes: availableQuotes,
      loading: loading,
      error: error
    });
    
    // Enhanced debugging for organization data in quotes
    if (availableQuotes.length > 0) {
      const firstQuote = availableQuotes[0];
      console.log('🔍 Estimates Page - Detailed first quote analysis:', {
        id: firstQuote.id,
        title: firstQuote.title,
        owner_org_id: firstQuote.owner_org_id,
        owner_org: firstQuote.owner_org,
        hasOwnerOrg: !!firstQuote.owner_org,
        ownerOrgName: firstQuote.owner_org?.name,
        allQuoteKeys: Object.keys(firstQuote)
      });
    }
  }, [user, organization, logisticsPartner, availableQuotes, loading, error]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search') || '';
    setSearchTerm((prev) => (prev === searchParam ? prev : searchParam));
  }, [location.search]);

  // Fetch quotes and bids on mount
  useEffect(() => {
    console.log('🔄 Estimates Page - useEffect triggered', {
      hasLogisticsPartner: !!logisticsPartner,
      logisticsPartnerId: logisticsPartner?.id
    });
    
    if (logisticsPartner?.id) {
      console.log('📦 Estimates Page - Fetching quotes and bids for partner:', logisticsPartner.id);
      fetchAvailableQuotes();
      fetchMyBids();
    } else {
      console.log('⚠️ Estimates Page - No logistics partner ID, skipping fetch');
    }
  }, [logisticsPartner, fetchAvailableQuotes, fetchMyBids]);

  const { combinedQuotes, supplementalRejectedIds } = useMemo(() => {
    const cutoff = now - TEN_DAYS_IN_MS;
    const existingIds = new Set<string>(availableQuotes.map((quote: any) => quote.id));
    const supplementalIds = new Set<string>();

    const supplementalRejectedQuotes = myBids.reduce<any[]>((acc, bid) => {
      if (bid?.is_draft) return acc;
      if (bid?.status !== 'rejected') return acc;

      const timestampString = bid.rejected_at || bid.updated_at || bid.submitted_at || bid.created_at;
      if (!timestampString) return acc;

      const decisionTime = new Date(timestampString).getTime();
      if (Number.isNaN(decisionTime) || decisionTime < cutoff) return acc;

      const quote = bid.quote;
      if (!quote || !quote.id || existingIds.has(quote.id)) return acc;

      existingIds.add(quote.id);
      supplementalIds.add(quote.id);

      const hydrated = supplementalQuoteDetails[quote.id];
      const normalizedQuote = {
        ...(hydrated || quote),
        origin: (hydrated?.origin || quote.origin) ?? undefined,
        destination: (hydrated?.destination || quote.destination) ?? undefined,
        quote_artworks: hydrated?.quote_artworks || quote.quote_artworks || [],
        owner_org: hydrated?.owner_org || quote.owner_org || quote.ownerOrg || undefined,
      };

      acc.push(normalizedQuote);
      return acc;
    }, []);

    if (supplementalRejectedQuotes.length === 0) {
      return { combinedQuotes: availableQuotes, supplementalRejectedIds: supplementalIds };
    }

    supplementalRejectedQuotes.sort((a, b) => {
      const toTime = (value: string | null | undefined) => (value ? new Date(value).getTime() : 0);
      const aTime = toTime(a.updated_at || a.created_at);
      const bTime = toTime(b.updated_at || b.created_at);
      return bTime - aTime;
    });

    return {
      combinedQuotes: [...availableQuotes, ...supplementalRejectedQuotes],
      supplementalRejectedIds: supplementalIds,
    };
  }, [availableQuotes, myBids, supplementalQuoteDetails, now]);

  useEffect(() => {
    setSelectedQuoteIds((prev) =>
      prev.filter((id) => combinedQuotes.some((quote) => quote.id === id))
    );
  }, [combinedQuotes]);

  useEffect(() => {
    if (supplementalRejectedIds.size === 0) {
      setSupplementalQuoteDetails((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }

    setSupplementalQuoteDetails((prev) => {
      const entries = Object.entries(prev).filter(([id]) => supplementalRejectedIds.has(id));
      if (entries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(entries);
    });
  }, [supplementalRejectedIds]);

  useEffect(() => {
    const missingIds = Array.from(supplementalRejectedIds).filter((id) => !supplementalQuoteDetails[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { QuoteService } = await import('../../services/QuoteService');
        const results = await Promise.all(
          missingIds.map(async (id) => {
            try {
              const response = await QuoteService.getQuoteDetails(id);
              return { id, data: response.data };
            } catch (error) {
              console.error('⚠️ Estimates - Failed to hydrate quote details', { id, error });
              return { id, data: null };
            }
          })
        );

        if (cancelled) return;

        setSupplementalQuoteDetails((prev) => {
          const next = { ...prev };
          let changed = false;
          results.forEach(({ id, data }) => {
            if (data) {
              next[id] = {
                ...data,
                quote_artworks: data.quote_artworks || [],
                origin: data.origin || undefined,
                destination: data.destination || undefined,
                owner_org: data.owner_org || undefined,
              };
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      } catch (error) {
        console.error('⚠️ Estimates - Error hydrating supplemental quotes', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supplementalRejectedIds, supplementalQuoteDetails]);

  const messageButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '999px',
    padding: '8px 18px',
    color: '#00aaab',
    borderColor: '#00aaab',
    '&:hover': {
      borderColor: '#008a8b',
      color: '#008a8b',
      backgroundColor: 'rgba(0, 170, 171, 0.08)'
    },
    '& .MuiSvgIcon-root': {
      color: 'currentColor'
    }
  } as const;

  const peerMessageButtonSx = {
    ...messageButtonSx,
    color: '#1f2937',
    borderColor: '#1f2937',
    '&:hover': {
      borderColor: '#111827',
      color: '#111827',
      backgroundColor: 'rgba(17, 24, 39, 0.08)',
    },
  } as const;

  const peerBranchOptions = useMemo(() => {
    return branchNetwork.filter((branch: any) => branch.branchOrgId !== organization?.id);
  }, [branchNetwork, organization?.id]);

  useEffect(() => {
    if (peerDialogOpen) {
      fetchBranchNetwork();
    }
  }, [peerDialogOpen, fetchBranchNetwork]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };


  const parseSpecialRequirements = (requirements: any): string[] => {
    if (!requirements) return [];
    
    // If it's already an array, return it
    if (Array.isArray(requirements)) return requirements;
    
    // If it's a JSON object, try to extract common requirement fields
    if (typeof requirements === 'object') {
      const reqs: string[] = [];
      if (requirements.climate_control) reqs.push('climate_control');
      if (requirements.high_security) reqs.push('high_security');
      if (requirements.white_glove) reqs.push('white_glove');
      if (requirements.oversized) reqs.push('oversized');
      if (requirements.insurance_required) reqs.push('insurance_required');
      if (requirements.special_handling) reqs.push('special_handling');
      return reqs;
    }
    
    return [];
  };

  // Find if user has bid on this quote
  const findMyBidForQuote = (quoteId: string) => {
    return myBids.find(bid => bid.quote_id === quoteId);
  };

  // Check if user has submitted a bid (not draft)
  const hasSubmittedBid = (quoteId: string) => {
    const bid = findMyBidForQuote(quoteId);
    if (!bid || bid.is_draft) return false;
    return bid.status === 'pending' || bid.status === 'needs_confirmation';
  };

  // Check if user has any non-draft bid on this quote
  const hasAnyBid = (quoteId: string) => {
    const bid = findMyBidForQuote(quoteId);
    return !!(bid && !bid.is_draft && bid.status !== 'withdrawn');
  };

  // Determine outcome for a quote based on bid status
  const getBidOutcome = (quoteId: string): 'won' | 'lost' | 'withdrawn' | null => {
    // If the quote itself was cancelled, prioritize showing as not selected
    const quote = combinedQuotes.find(q => q.id === quoteId) || findMyBidForQuote(quoteId)?.quote;
    if (quote?.status === 'cancelled') return 'lost';

    const bid = findMyBidForQuote(quoteId);
    if (!bid || bid.is_draft) return null;
    if (bid.status === 'accepted') return 'won';
    if (bid.status === 'rejected') return 'lost';
    if (bid.status === 'withdrawn') return 'withdrawn';
    return null;
  };

  // Can withdraw if the bid is submitted but not yet accepted/rejected/withdrawn
  const canWithdrawBid = (bid: any | undefined) => {
    if (!bid || bid.is_draft) return false;
    return ['pending', 'needs_confirmation', 'submitted'].includes(bid.status);
  };

  // Has a submitted bid that hasn't been accepted/rejected/withdrawn yet
  const isBidPendingForQuote = (quoteId: string) => {
    const bid = findMyBidForQuote(quoteId);
    if (!bid || bid.is_draft) return false;
    return ['pending', 'needs_confirmation', 'submitted'].includes(bid.status);
  };

  const handleWithdraw = async (quoteId: string) => {
    const bid = findMyBidForQuote(quoteId);
    if (!bid || !canWithdrawBid(bid)) return;
    const confirmed = window.confirm('Withdraw your estimate? This cannot be undone.');
    if (!confirmed) return;
    try {
      setWithdrawingId(quoteId);
      const { error } = await withdrawBidAction(bid.id);
      if (error) throw error;
    } catch (err: any) {
      alert('Failed to withdraw estimate: ' + (err?.message || String(err)));
    } finally {
      setWithdrawingId(null);
    }
  };

  const handleOpenConversation = (request: any) => {
    if (!request?.id) return;

    openMessagingModal({
      quoteId: request.id,
      quoteTitle: request.title,
      galleryName: request.galleryCompanyName ?? request.gallery,
      galleryBranchName: request.galleryBranchName ?? request.gallery,
      routeLabel: `${request.origin} → ${request.destination}`,
      targetDateLabel: request.targetDate ? `Target: ${request.targetDate}` : undefined,
      quoteValueLabel:
        typeof request.totalValue === 'number' && request.totalValue > 0
          ? `Value ${formatCurrency(request.totalValue)}`
          : undefined,
      shipmentId: request.shipmentId ?? null,
      shipperBranchOrgId: organization?.id ?? null,
      galleryBranchOrgId: request.galleryOrgId ?? null,
    }).catch((launchError) => {
      console.error('[Estimates] failed to open messaging modal', launchError);
    });
  };

  const handleOpenPeerDialog = (request: any) => {
    if (!organization?.id) {
      alert('Select your active branch before messaging a partner shipper.');
      return;
    }
    setPeerDialogQuote(request);
    setPeerDialogOpen(true);
  };

  const handleClosePeerDialog = () => {
    if (peerMessagingBranchId) {
      return;
    }
    setPeerDialogOpen(false);
    setPeerDialogQuote(null);
  };

  const handleStartPeerConversation = async (branchOrgId: string) => {
    if (!peerDialogQuote) return;
    try {
      setPeerMessagingBranchId(branchOrgId);
      const threadId = await openPeerThread({
        peerShipperOrgId: branchOrgId,
        quoteId: peerDialogQuote.id,
        shipmentId: peerDialogQuote.shipmentId ?? null,
      });
      setPeerMessagingBranchId(null);
      setPeerDialogOpen(false);
      setPeerDialogQuote(null);
      navigate(`/messages?threadId=${threadId}`);
    } catch (error: any) {
      console.error('[Estimates] failed to open peer conversation', error);
      alert(error?.message || 'Unable to start conversation. Please try again.');
      setPeerMessagingBranchId(null);
    }
  };

  const peerMessagingDialog = (
    <Dialog open={peerDialogOpen} onClose={handleClosePeerDialog} fullWidth maxWidth="sm">
      <DialogTitle>Contact a partner shipper</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2 }}
      >
        {branchNetworkLoading && (
          <Box sx={{ py: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Loading branches…</Typography>
          </Box>
        )}
        {!branchNetworkLoading && peerBranchOptions.length === 0 ? (
          <Alert severity="info">No partner branches available yet. Check back soon.</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {peerBranchOptions.map((branch: any) => (
              <Box
                key={branch.branchOrgId}
                sx={{
                  border: '1px solid rgba(0, 170, 171, 0.18)',
                  borderRadius: '14px',
                  padding: '16px',
                  background: 'rgba(0, 170, 171, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f2233' }}>
                      {branch.displayName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#58517E' }}>
                      {branch.companyName || 'Logistics Partner'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '12px', color: '#6366F1' }}>
                    <span>{branch.members.length} member{branch.members.length === 1 ? '' : 's'}</span>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Typography variant="body2" sx={{ color: '#170849' }}>
                    {branch.location?.address_full ||
                      branch.location?.name ||
                      'Location details unavailable'}
                  </Typography>
                  {branch.contact && (
                    <Typography variant="body2" sx={{ color: '#58517E' }}>
                      Contact: {branch.contact.name} {branch.contact.email ? `• ${branch.contact.email}` : ''}
                      {branch.contact.phone ? ` • ${branch.contact.phone}` : ''}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={
                      peerMessagingBranchId === branch.branchOrgId ? (
                        <CircularProgress size={14} sx={{ color: '#008a8b' }} />
                      ) : (
                        <MessageOutlinedIcon sx={{ fontSize: 16 }} />
                      )
                    }
                    disabled={peerMessagingBranchId !== null}
                    sx={{
                      textTransform: 'none',
                      borderRadius: '999px',
                      borderColor: '#008a8b',
                      color: '#008a8b',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 18px',
                      '&:hover': {
                        borderColor: '#006d6e',
                        color: '#006d6e',
                        backgroundColor: 'rgba(0, 170, 171, 0.08)',
                      },
                    }}
                    onClick={() => handleStartPeerConversation(branch.branchOrgId)}
                  >
                    Message
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClosePeerDialog} disabled={peerMessagingBranchId !== null} sx={{ textTransform: 'none' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

  // Transform and filter requests based on filter and search
  const filteredRequests = useMemo(() => {
    return combinedQuotes
      .filter(quote => {
        const outcome = getBidOutcome(quote.id);
        const isSupplementalRejected = supplementalRejectedIds.has(quote.id);

        const matchesFilter =
          (filter === 'all' && !isSupplementalRejected) ||
          (filter === 'available' && !isSupplementalRejected && outcome !== 'won' && outcome !== 'lost') ||
          (filter === 'bidded' && isBidPendingForQuote(quote.id)) ||
          (filter === 'lost' && outcome === 'lost');

        const matchesSearch =
          quote.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          quote.origin?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          quote.destination?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          quote.owner_org?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;

        return matchesFilter && matchesSearch;
      })
      .map(quote => {
        const ownerOrg = quote.owner_org || null;
        const galleryBranchName = ownerOrg?.branch_name || ownerOrg?.name || quote.owner_org_id || 'Unknown Gallery';
        const galleryCompanyName = ownerOrg?.company?.name || ownerOrg?.name || quote.owner_org_id || 'Unknown Gallery';
        const galleryName = galleryBranchName;
        if (galleryName === 'Unknown Gallery') {
          console.log('⚠️ Estimates - Gallery name resolution failed for quote:', {
            quoteId: quote.id,
            title: quote.title,
            owner_org_id: quote.owner_org_id,
            owner_org: quote.owner_org,
            hasOwnerOrg: !!quote.owner_org,
            ownerOrgName: quote.owner_org?.name
          });
        }

        const manualClose = quote.auto_close_bidding === false;
        const deadlineState = computeDeadlineState(quote.bidding_deadline, { manualClose, now });
        const galleryLogoName = ownerOrg?.company?.name || ownerOrg?.name || null;
        const galleryLogoLocalUrl = findOrganizationLogoUrl(galleryLogoName);
        const galleryLogoRemoteUrl = ownerOrg?.img_url || null;

        return ({
          id: quote.id,
          title: quote.title,
          type: quote.type || 'requested',
          status: quote.status,
          gallery: galleryName,
          galleryBranchName,
          galleryCompanyName,
          galleryLogoName,
          galleryOrgId: quote.owner_org?.id || quote.owner_org_id || null,
          galleryLogoUrl: galleryLogoLocalUrl ?? galleryLogoRemoteUrl,
          galleryLogoLocalUrl,
          galleryLogoRemoteUrl,
          origin: quote.origin?.name || 'TBD',
          destination: quote.destination?.name || 'TBD',
          targetDate: quote.target_date ? formatDate(quote.target_date) :
                      (quote.target_date_start && quote.target_date_end ?
                       `${formatDate(quote.target_date_start)} - ${formatDate(quote.target_date_end)}` :
                       'Flexible'),
          artworkCount: quote.quote_artworks?.length || 0,
          totalValue: quote.value || 0,
          specialRequirements: parseSpecialRequirements(quote.requirements),
          timeLeft: deadlineState.label,
          currentBids: 0,
          bidding_deadline: quote.bidding_deadline,
          deadlineState,
          autoCloseBidding: quote.auto_close_bidding !== false,
          requirements: quote.requirements,
          delivery_specifics: quote.delivery_specifics,
          notes: quote.notes,
          client_reference: quote.client_reference,
          shipmentId: quote.shipment_id || null
        });
      });
  }, [combinedQuotes, supplementalRejectedIds, filter, searchTerm, now, myBids]);

  const visibleQuoteIds = useMemo(
    () => filteredRequests.map((request) => request.id),
    [filteredRequests]
  );

  const selectedQuotes = useMemo(
    () => combinedQuotes.filter((quote) => selectedQuoteIds.includes(quote.id)),
    [combinedQuotes, selectedQuoteIds]
  );

  const allVisibleSelected =
    filteredRequests.length > 0 &&
    visibleQuoteIds.every((id) => selectedQuoteIds.includes(id));

  const someVisibleSelected =
    filteredRequests.length > 0 &&
    visibleQuoteIds.some((id) => selectedQuoteIds.includes(id));

  const toggleQuoteSelection = (quoteId: string, explicitlyChecked?: boolean) => {
    setSelectedQuoteIds((prev) => {
      const next = new Set(prev);
      const shouldSelect =
        typeof explicitlyChecked === 'boolean'
          ? explicitlyChecked
          : !next.has(quoteId);
      if (shouldSelect) {
        next.add(quoteId);
      } else {
        next.delete(quoteId);
      }
      return Array.from(next);
    });
  };

  const handleToggleSelectAllVisible = (checked: boolean) => {
    setSelectedQuoteIds((prev) => {
      const next = new Set(prev);
      visibleQuoteIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return Array.from(next);
    });
  };

  const handleClearSelection = () => {
    setSelectedQuoteIds([]);
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

  const handleExportSelectedQuotes = () => {
    if (selectedQuotes.length === 0) {
      return;
    }

    const headers = [
      'Quote Title',
      'Gallery',
      'Origin',
      'Destination',
      'Status',
      'Estimate Deadline',
      'Total Value',
      'Artwork Count'
    ];

    const rows = selectedQuotes.map((quote) => {
      const origin = quote.origin?.name ?? '';
      const destination = quote.destination?.name ?? '';
      const gallery = quote.owner_org?.name ?? quote.owner_org_id ?? '';
      const totalValue =
        typeof quote.value === 'number'
          ? formatCurrency(quote.value)
          : quote.value ?? '';
      const artworkCount = Array.isArray(quote.quote_artworks)
        ? quote.quote_artworks.length
        : '';
      return [
        quote.title ?? '',
        gallery,
        origin,
        destination,
        quote.status ?? '',
        formatDateForCsv(quote.bidding_deadline as string | null | undefined),
        totalValue,
        artworkCount
      ];
    });

    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`shipper-estimates-${today}.csv`, headers, rows);
  };

  /* REMOVED MOCK DATA - NOW USING REAL DATA FROM STORE
  const mockQuoteRequests: QuoteRequest[] = [
  */
  
  // Calculate artwork count for quotes
  const getArtworkCount = (quote: any) => {
    return quote.quote_artworks?.length || 0;
  };
  
  // Calculate current bids count
  const getBidsCount = (quote: any) => {
    // This would come from the bids relationship but isn't currently exposed in the query
    return 0;

  };

  const getStatusTag = (request: any) => {
    if (request.type === 'direct') return 'tag blue';
    if (request.deadlineState?.isExpired) return 'tag red';
    if (request.deadlineState?.urgency === 'critical' || request.deadlineState?.urgency === 'warning') {
      return 'tag red';
    }
    return 'tag green';
  };

  const getStatusText = (request: any) => {
    if (request.type === 'direct') return 'Direct Request';
    if (!request.autoCloseBidding) return 'Manual close';
    if (request.deadlineState?.isExpired) return 'Closed';
    if (request.deadlineState?.urgency === 'critical') return 'Ends soon';
    if (request.deadlineState?.urgency === 'warning') return 'Closing Soon';
    return 'Open Estimate';
  };

  const getSpecialRequirementIcon = (requirement: string) => {
    switch (requirement) {
      case 'climate_control': return <AcUnitIcon sx={{ fontSize: 16 }} />;
      case 'high_security': return <SecurityIcon sx={{ fontSize: 16 }} />;
      case 'oversized': return <LocalShippingIcon sx={{ fontSize: 16 }} />;
      default: return null;
    }
  };

  const getSpecialRequirementText = (requirement: string) => {
    switch (requirement) {
      case 'climate_control': return 'Climate Control';
      case 'high_security': return 'High Security';
      case 'white_glove': return 'White Glove';
      case 'oversized': return 'Oversized Items';
      case 'insurance_required': return 'Insurance Required';
      default: return requirement.replace('_', ' ');
    }
  };

  // Avoid full‑page spinner flicker when background fetches toggle global loading
  // Only show spinner on initial load with no existing data
  if (loading && availableQuotes.length === 0) {
    return (
      <>
        <div className="main-wrap">
          <div className="main-panel">
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
              <CircularProgress />
            </div>
          </div>
        </div>
    {peerMessagingDialog}
    </>
  );
  }

  if (error) {
    return (
      <div className="main-wrap">
        <div className="main-panel">
          <Alert severity="error" style={{ margin: '20px' }}>
            {error}
          </Alert>
        </div>
      </div>
    );
  }

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Received' },
    { key: 'available', label: 'Available' },
    { key: 'bidded', label: 'Submitted' },
    { key: 'lost', label: 'Declined' }
  ];

  return (
    <>
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <motion.div
            className="header-row"
            initial={motionInitial as any}
            animate="show"
            variants={slideInLeft}
            style={{ willChange: 'transform' }}
            onAnimationComplete={() => { hasAnimatedRef.current = true; }}
          >
            <h1 className="header-title">Available Quote Requests</h1>
            <div style={{ fontSize: '14px', color: '#58517E' }}>
              {filteredRequests.length} requests available
            </div>
          </motion.div>
        </header>
        
        <div className="main-content" style={{ flexDirection: 'column', gap: '24px' }}>
          {/* Filters and Search */}
          <motion.div
            initial={motionInitial as any}
            animate="show"
            variants={slideInTop}
            style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', willChange: 'transform' }}
            onAnimationComplete={() => { hasAnimatedRef.current = true; }}
          >
            <input
              type="text"
              placeholder="Search by title, route, or gallery..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid #e9eaeb',
                fontSize: '14px',
                minWidth: '250px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              {filterOptions.map((filterOption) => (
                <button
                  key={filterOption.key}
                  onClick={() => setFilter(filterOption.key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: filter === filterOption.key ? '2px solid #8412ff' : '1px solid #e9eaeb',
                    background: filter === filterOption.key ? 'rgba(132, 18, 255, 0.1)' : '#ffffff',
                    color: filter === filterOption.key ? '#8412ff' : '#58517E',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  {filterOption.label}
                </button>
              ))}
            </div>
          </motion.div>

          {filteredRequests.length > 0 ? (
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
                    '.MuiFormControlLabel-label': { fontSize: '14px', color: '#58517E' }
                  }}
                />
                <Button
                  variant="text"
                  onClick={handleClearSelection}
                  disabled={selectedQuoteIds.length === 0}
                  sx={{ textTransform: 'none', fontWeight: 500 }}
                >
                  Clear selection
                </Button>
                <div style={{ fontSize: '13px', color: '#58517E' }}>
                  {selectedQuoteIds.length} selected
                </div>
              </div>
              <Button
                variant="contained"
                onClick={handleExportSelectedQuotes}
                disabled={selectedQuoteIds.length === 0}
                sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
              >
                Export selected
              </Button>
            </div>
          ) : null}

          {/* Quote Request Cards Grid */}
          <motion.div
            initial={motionInitial as any}
            animate="show"
            variants={cardStagger}
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', 
              gap: '24px',
              willChange: 'transform'
            }}
            onAnimationComplete={() => { hasAnimatedRef.current = true; }}
          >
            {filteredRequests.map((request) => {
              const hasLogo = Boolean(request.galleryLogoUrl);
              const fallbackLetter = request.gallery?.[0]?.toUpperCase() || 'G';

              return (
              <motion.div
                key={request.id}
                className="shipment-card selectable"
                style={{ cursor: 'pointer', willChange: 'transform' }}
                variants={slideInDown}
              >
                <div className="head">
                  <Checkbox
                    size="small"
                    checked={selectedQuoteIds.includes(request.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleQuoteSelection(request.id, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    sx={{ padding: 0 }}
                    inputProps={{ 'aria-label': `Select quote ${request.title}` }}
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
                    {request.galleryLogoUrl ? (
                      <img
                        src={request.galleryLogoUrl}
                        alt={request.gallery || 'Organization logo'}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(event) => {
                          const target = event.currentTarget;
                          const isLocalAttempt =
                            Boolean(request.galleryLogoLocalUrl) && target.src.includes(request.galleryLogoLocalUrl);

                          if (isLocalAttempt && request.galleryLogoRemoteUrl && target.src !== request.galleryLogoRemoteUrl) {
                            target.src = request.galleryLogoRemoteUrl;
                            return;
                          }

                          target.style.display = 'none';
                          const fallback = target.parentElement?.querySelector('[data-thumb-fallback]') as HTMLElement | null;
                          if (fallback) {
                            fallback.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div
                      data-thumb-fallback
                      style={{
                        display: hasLogo ? 'none' : 'flex',
                        width: '100%',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#170849',
                        fontWeight: 700,
                        fontSize: '18px'
                      }}
                    >
                      {fallbackLetter}
                    </div>
                  </div>
                  <div className="title">
                    <small>{request.gallery}</small>
                    <strong>{request.title}</strong>
                  </div>
                  <div className={getStatusTag(request)}>
                    {getStatusText(request)}
                  </div>
                </div>
                
                <div className="shipment-card-body">
                  {/* Top status banner removed per updated behavior */}
                  {/* Route Information */}
                  <div className="route-line">
                    <div className="point"></div>
                    <div className="line"></div>
                    <div className="pin"></div>
                  </div>
                  <div className="locations">
                    <span>{request.origin}</span>
                    <span>{request.destination}</span>
                  </div>

                  <div className="details">
                    <div className="detail-item">
                      <span>Target Arrival Date</span>
                      <strong>{request.targetDate}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Artworks</span>
                      <strong>{request.artworkCount} pieces</strong>
                    </div>
                    <div className="detail-item">
                      <span>Total Value</span>
                      <strong>{formatCurrency(request.totalValue)}</strong>
                    </div>
                  </div>

                  {/* Special Requirements */}
                  {request.specialRequirements && request.specialRequirements.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'rgba(23, 8, 73, 0.6)', 
                        marginBottom: '6px',
                        fontWeight: 500
                      }}>
                        Special Requirements
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        gap: '6px',
                        flexWrap: 'wrap'
                      }}>
                        {request.specialRequirements.map((req, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: 'rgba(132, 18, 255, 0.1)',
                              color: '#8412ff',
                              fontSize: '11px',
                              fontWeight: 500
                            }}
                          >
                            {getSpecialRequirementIcon(req)}
                            <span>{getSpecialRequirementText(req)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Auction Information or Win State */}
                  {request.type !== 'direct' && (() => {
                    const outcome = getBidOutcome(request.id);
                    const myBid = findMyBidForQuote(request.id);
                    if (outcome === 'won') {
                      return (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '16px',
                          padding: '12px',
                          background: 'rgba(13, 171, 113, 0.08)',
                          border: '1px solid rgba(13, 171, 113, 0.35)',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0DAB71' }}>You won this bid</span>
                            {myBid && (
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#0DAB71' }}>
                                {formatCurrency(myBid.amount)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                              onClick={() => handleOpenPeerDialog(request)}
                              sx={peerMessageButtonSx}
                              disabled={peerMessagingBranchId !== null}
                            >
                              Shipper
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                              onClick={() => handleOpenConversation(request)}
                              sx={messageButtonSx}
                            >
                              Client
                            </Button>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => navigate(`/estimates/${request.id}/bid`)}
                              sx={{
                                backgroundColor: '#0DAB71',
                                '&:hover': { backgroundColor: '#0a8f5d' },
                                textTransform: 'none',
                                fontSize: '12px',
                                fontWeight: 500,
                                padding: '6px 16px'
                              }}
                            >
                              View shipment
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    if (outcome === 'lost') {
                      return (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '16px',
                            padding: '12px',
                            background: 'rgba(255, 68, 68, 0.08)',
                            border: '1px solid rgba(255, 68, 68, 0.35)',
                            borderRadius: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#FF4444' }}>
                              Not selected
                            </span>
                            {myBid?.amount ? (
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#FF6969' }}>
                                Your estimate {formatCurrency(myBid.amount)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    }
                    const manualClose = !request.autoCloseBidding;
                    const isDeadlineExpired = request.autoCloseBidding && request.deadlineState?.isExpired;
                    const deadlineUrgency = request.deadlineState?.urgency;
                    const countdownAccentColor = manualClose
                      ? 'rgba(23, 8, 73, 0.7)'
                      : isDeadlineExpired
                        ? '#D94E45'
                        : deadlineUrgency === 'critical'
                          ? '#D94E45'
                          : deadlineUrgency === 'warning'
                            ? '#E9932D'
                            : '#8412ff';
                    const buttonLabel = (() => {
                      if (myBid?.status === 'pending' || myBid?.status === 'needs_confirmation') {
                        return 'Update estimate';
                      }
                      if (myBid) {
                        return 'View estimate';
                      }
                      return 'Prepare estimate';
                    })();
                    const bidRowContent = (() => {
                      const hasBid = hasSubmittedBid(request.id);

                      if (myBid && myBid.status === 'needs_confirmation') {
                        return {
                          label: 'Estimate requires confirmation',
                          labelColor: '#e11d48',
                          fontWeight: 600,
                          withdrawable: canWithdrawBid(myBid),
                          inlineActions: true,
                        } as const;
                      }

                      if (hasBid && myBid) {
                        return {
                          label: `Your estimate: ${formatCurrency(myBid.amount)}`,
                          labelColor: '#22c55e',
                          fontWeight: 600,
                          fontSize: '16px',
                          withdrawable: canWithdrawBid(myBid),
                          inlineActions: true,
                        } as const;
                      }

                      if (myBid && myBid.is_draft) {
                        return {
                          label: `Draft estimate: ${formatCurrency(myBid.amount)}`,
                          labelColor: '#f59e0b',
                          fontWeight: 500,
                          fontSize: '12px',
                          withdrawable: false,
                          inlineActions: false,
                        } as const;
                      }

                      return null;
                    })();
                    const hasInlineActions = Boolean(bidRowContent?.inlineActions);
                    const ctaLabel = isDeadlineExpired ? 'Closed' : buttonLabel;

                    return (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          marginTop: '16px',
                          padding: '12px',
                          background:
                            getStatusTag(request) === 'tag red'
                              ? 'rgba(217, 78, 69, 0.05)'
                              : 'rgba(132, 18, 255, 0.05)',
                          borderRadius: '8px',
                          border:
                            getStatusTag(request) === 'tag red'
                              ? '1px solid rgba(217, 78, 69, 0.2)'
                              : '1px solid rgba(132, 18, 255, 0.2)'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {manualClose || isDeadlineExpired ? (
                                <span
                                  style={{
                                    fontSize: '12px',
                                    color: countdownAccentColor,
                                    fontWeight: 600
                                  }}
                                >
                                  {manualClose ? request.deadlineState?.label || 'Manual close' : 'Estimate submissions closed'}
                                </span>
                              ) : (
                                <CountdownClock
                                  deadline={request.bidding_deadline}
                                  manualClose={manualClose}
                                  size="small"
                                  showLabel={false}
                                />
                              )}
                            </div>
                            {isDeadlineExpired && (
                              <span style={{ fontSize: '12px', color: '#D94E45', fontWeight: 600 }}>
                                Deadline passed — bidding closed
                              </span>
                            )}
                            {manualClose && !isDeadlineExpired && (
                              <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.65)', fontWeight: 500 }}>
                                Gallery will close this manually
                              </span>
                            )}
                          </div>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                            onClick={() => handleOpenPeerDialog(request)}
                            sx={peerMessageButtonSx}
                            disabled={peerMessagingBranchId !== null}
                          >
                            Shipper
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                            onClick={() => handleOpenConversation(request)}
                            sx={messageButtonSx}
                          >
                            Client
                          </Button>
                        </div>

                        {hasInlineActions && bidRowContent ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                              fontSize: '12px',
                              flexWrap: 'wrap'
                            }}
                          >
                            <span
                              style={{
                                color: bidRowContent.labelColor,
                                fontWeight: bidRowContent.fontWeight,
                                fontSize: bidRowContent.fontSize ?? '12px'
                              }}
                            >
                              {bidRowContent.label}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => navigate(`/estimates/${request.id}/bid`)}
                                disabled={Boolean(isDeadlineExpired)}
                                sx={{
                                  backgroundColor:
                                    getStatusTag(request) === 'tag red' ? '#D94E45' : '#8412ff',
                                  '&:hover': {
                                    backgroundColor:
                                      getStatusTag(request) === 'tag red' ? '#c23e35' : '#730ADD'
                                  },
                                  '&.Mui-disabled': {
                                    backgroundColor: 'rgba(23, 8, 73, 0.12)',
                                    color: 'rgba(23, 8, 73, 0.45)'
                                  },
                                  textTransform: 'none',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  padding: '2px 12px',
                                  minWidth: 0,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {ctaLabel}
                              </Button>
                              {bidRowContent.withdrawable && myBid && (
                                <Button
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  onClick={() => handleWithdraw(request.id)}
                                  disabled={withdrawingId === request.id}
                                  sx={{
                                    textTransform: 'none',
                                    minWidth: 0,
                                    whiteSpace: 'nowrap',
                                    padding: '2px 12px'
                                  }}
                                >
                                  {withdrawingId === request.id ? (
                                    <CircularProgress size={12} sx={{ color: '#D94E45' }} />
                                  ) : (
                                    'Withdraw'
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {bidRowContent && (
                              <span
                                style={{
                                  color: bidRowContent.labelColor,
                                  fontWeight: bidRowContent.fontWeight,
                                  fontSize: bidRowContent.fontSize ?? '12px'
                                }}
                              >
                                {bidRowContent.label}
                              </span>
                            )}
                            <Button
                              variant="contained"
                              size="small"
                              fullWidth
                              onClick={() => navigate(`/estimates/${request.id}/bid`)}
                              disabled={Boolean(isDeadlineExpired)}
                              sx={{
                                backgroundColor:
                                  getStatusTag(request) === 'tag red' ? '#D94E45' : '#8412ff',
                                '&:hover': {
                                  backgroundColor:
                                    getStatusTag(request) === 'tag red' ? '#c23e35' : '#730ADD'
                                },
                                '&.Mui-disabled': {
                                  backgroundColor: 'rgba(23, 8, 73, 0.12)',
                                  color: 'rgba(23, 8, 73, 0.45)'
                                },
                                textTransform: 'none',
                                fontSize: '12px',
                                fontWeight: 600,
                                padding: '8px 16px'
                              }}
                            >
                              {ctaLabel}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  {/* Direct Request Action or Win State */}
                  {request.type === 'direct' && (() => {
                    const outcome = getBidOutcome(request.id);
                    const myBid = findMyBidForQuote(request.id);
                    if (outcome === 'won') {
                      return (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '16px',
                          padding: '12px',
                          background: 'rgba(13, 171, 113, 0.08)',
                          border: '1px solid rgba(13, 171, 113, 0.35)',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0DAB71' }}>You won this bid</span>
                            {myBid && (
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#0DAB71' }}>
                                {formatCurrency(myBid.amount)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                              onClick={() => handleOpenPeerDialog(request)}
                              sx={peerMessageButtonSx}
                              disabled={peerMessagingBranchId !== null}
                            >
                              Shipper
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                              onClick={() => handleOpenConversation(request)}
                              sx={messageButtonSx}
                            >
                              Client
                            </Button>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => navigate(`/estimates/${request.id}/bid`)}
                              sx={{
                                backgroundColor: '#0DAB71',
                                '&:hover': { backgroundColor: '#0a8f5d' },
                                textTransform: 'none',
                                fontSize: '12px',
                                fontWeight: 500,
                                padding: '6px 16px'
                              }}
                            >
                              View shipment
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    if (outcome === 'lost') {
                      return (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '16px',
                            padding: '12px',
                            background: 'rgba(255, 68, 68, 0.08)',
                            border: '1px solid rgba(255, 68, 68, 0.35)',
                            borderRadius: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#FF4444' }}>
                              Not selected
                            </span>
                            {myBid?.amount ? (
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#FF6969' }}>
                                Your estimate {formatCurrency(myBid.amount)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    }
                    const buttonLabel = myBid?.status === 'pending' ? 'Update estimate' : 'View Details';
                    const bidRowContent = (() => {
                      const hasBid = hasSubmittedBid(request.id);

                      if (myBid && myBid.status === 'needs_confirmation') {
                        return {
                          label: 'Estimate requires confirmation',
                          labelColor: '#e11d48',
                          fontWeight: 600,
                          withdrawable: canWithdrawBid(myBid),
                          inlineActions: true,
                        } as const;
                      }

                      if (hasBid && myBid) {
                        return {
                          label: `Your estimate: ${formatCurrency(myBid.amount)}`,
                          labelColor: '#22c55e',
                          fontWeight: 600,
                          withdrawable: canWithdrawBid(myBid),
                          inlineActions: true,
                        } as const;
                      }

                      if (myBid && myBid.is_draft) {
                        return {
                          label: `Draft estimate: ${formatCurrency(myBid.amount)}`,
                          labelColor: '#f59e0b',
                          fontWeight: 500,
                          withdrawable: false,
                          inlineActions: false,
                        } as const;
                      }

                      return {
                        label: 'No competing estimates',
                        labelColor: 'rgba(23, 8, 73, 0.7)',
                        fontWeight: 500,
                        withdrawable: false,
                        inlineActions: false,
                      } as const;
                    })();
                    const hasInlineActions = bidRowContent.inlineActions;

                    return (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          marginTop: '16px',
                          padding: '12px',
                          background: 'rgba(0, 102, 204, 0.05)',
                          borderRadius: '8px',
                          border: '1px solid rgba(0, 102, 204, 0.2)'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            flexWrap: 'wrap'
                          }}
                        >
                          <span
                            style={{
                              fontSize: '12px',
                              color: '#0066cc',
                              fontWeight: 600
                            }}
                          >
                            Direct invitation to quote
                          </span>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                            onClick={() => handleOpenPeerDialog(request)}
                            sx={peerMessageButtonSx}
                            disabled={peerMessagingBranchId !== null}
                          >
                            Shipper
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                            onClick={() => handleOpenConversation(request)}
                            sx={messageButtonSx}
                          >
                            Client
                          </Button>
                        </div>

                        {hasInlineActions ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                              fontSize: '12px',
                              flexWrap: 'wrap'
                            }}
                          >
                            <span style={{ color: bidRowContent.labelColor, fontWeight: bidRowContent.fontWeight }}>
                              {bidRowContent.label}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => navigate(`/estimates/${request.id}/bid`)}
                                sx={{
                                  backgroundColor: '#0066cc',
                                  '&:hover': { backgroundColor: '#0052a3' },
                                  '&.Mui-disabled': {
                                    backgroundColor: 'rgba(23, 8, 73, 0.12)',
                                    color: 'rgba(23, 8, 73, 0.45)'
                                  },
                                  textTransform: 'none',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  padding: '2px 12px',
                                  minWidth: 0,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {buttonLabel}
                              </Button>
                              {bidRowContent.withdrawable && myBid && (
                                <Button
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  onClick={() => handleWithdraw(request.id)}
                                  disabled={withdrawingId === request.id}
                                  sx={{
                                    textTransform: 'none',
                                    minWidth: 0,
                                    whiteSpace: 'nowrap',
                                    padding: '2px 12px'
                                  }}
                                >
                                  {withdrawingId === request.id ? (
                                    <CircularProgress size={12} sx={{ color: '#D94E45' }} />
                                  ) : (
                                    'Withdraw'
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ color: bidRowContent.labelColor, fontWeight: bidRowContent.fontWeight }}>
                              {bidRowContent.label}
                            </span>
                            <Button
                              variant="contained"
                              size="small"
                              fullWidth
                              onClick={() => navigate(`/estimates/${request.id}/bid`)}
                              sx={{
                                backgroundColor: '#0066cc',
                                '&:hover': { backgroundColor: '#0052a3' },
                                '&.Mui-disabled': {
                                  backgroundColor: 'rgba(23, 8, 73, 0.12)',
                                  color: 'rgba(23, 8, 73, 0.45)'
                                },
                                textTransform: 'none',
                                fontSize: '12px',
                                fontWeight: 600,
                                padding: '8px 16px'
                              }}
                            >
                              {buttonLabel}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            );
            })}
          </motion.div>

          {filteredRequests.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: '48px', 
              color: '#58517E',
              fontSize: '16px'
            }}>
              No quote requests found matching your criteria.
            </div>
          )}
        </div>
      </div>
    </div>
    {peerMessagingDialog}
    </>
  );
};

export default Estimates; 
