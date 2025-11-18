import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  TextField,
  Typography,
  Avatar,
  Chip,
  IconButton,
  InputAdornment,
  Divider,
  Paper,
  Button,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  MoreVert as MoreIcon,
  Send as SendIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import { Skeleton } from '@mui/material';
import { motion } from 'motion/react';
import { slideInLeft } from '../../lib/motion';
import useChatStore, { type ChatThreadSummary, type ChatMessage } from '../../store/chatStore';
import useSupabaseStore from '../../store/useSupabaseStore';
import { resolveOrganizationLogo } from '../../lib/organizationLogos';
import { useLocation, useNavigate } from 'react-router-dom';
import type { QuoteWithDetails, ShipmentWithDetails } from '../../lib/supabase';

const formatRelativeTime = (timestamp: string | null) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const parseIdentity = (identity: string | null | undefined) => {
  if (!identity || typeof identity !== 'string') {
    return { identity: '', role: null as string | null, userId: null as string | null };
  }
  const [role, ...rest] = identity.split(':');
  if (rest.length === 0) {
    return { identity, role, userId: null };
  }
  return { identity, role, userId: rest.join(':') };
};

const normalizeUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const collectUniqueUrls = (...urls: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const results: string[] = [];

  urls.forEach((input) => {
    const normalized = normalizeUrl(input);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      results.push(normalized);
    }
  });

  return results;
};

const deriveLogoUrls = (
  names: Array<string | null | undefined>,
  remoteCandidates: Array<string | null | undefined> = []
): { primary: string | null; fallback: string | null } => {
  const remoteCandidate = remoteCandidates.map(normalizeUrl).find(Boolean) ?? null;
  const { primaryUrl, localUrl, remoteUrl } = resolveOrganizationLogo(names, remoteCandidate);
  const [primary = null, fallback = null] = collectUniqueUrls(primaryUrl, localUrl, remoteUrl, ...remoteCandidates);
  return { primary, fallback };
};

const buildInitials = (value: string | null | undefined) => {
  if (!value || typeof value !== 'string') {
    return 'U';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'U';
  }
  const parts = trimmed.split(/\s+/).slice(0, 2);
  const initials = parts.map((part) => part.charAt(0).toUpperCase()).join('');
  return initials || trimmed.charAt(0).toUpperCase();
};

type ParticipantSummary = {
  id: string;
  userId: string | null;
  identity: string | null;
  role: 'gallery' | 'shipper';
  name: string | null;
  organizationName: string | null;
  locationLabel: string | null;
  organizationLogoUrl: string | null;
  avatarUrl: string | null;
};

const extractParticipantLocation = (participant: any): string | null => {
  if (!participant || typeof participant !== 'object') {
    return null;
  }

  const readLabel = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  const branchLocation =
    readLabel(participant.branchLocation) ||
    readLabel(participant.branch_location) ||
    readLabel(participant.branchLocationLabel);
  const branchLabel = readLabel(participant.branchLabel) || readLabel(participant.branch_label);
  const branchName = readLabel(participant.branchName) || readLabel(participant.branch_name);
  const locationLabel = readLabel(participant.locationLabel) || readLabel(participant.location_label);
  const genericLocation = readLabel(participant.location);

  const city =
    readLabel(participant.branchCity) ||
    readLabel(participant.branch_city) ||
    readLabel(participant.city);
  const state = readLabel(participant.branchState) || readLabel(participant.state);
  const country = readLabel(participant.branchCountry) || readLabel(participant.country);

  const regionParts = [city, state].filter(Boolean) as string[];
  const region = regionParts.length > 0 ? regionParts.join(', ') : null;
  const regionWithCountry = [region, country].filter(Boolean).join(', ') || null;

  const street = readLabel(participant.addressLine1) || readLabel(participant.address);

  const candidates = [
    branchLocation,
    branchLabel,
    branchName,
    locationLabel,
    genericLocation,
    regionWithCountry,
    region,
    street,
  ].filter((value): value is string => Boolean(value));

  return candidates[0] ?? null;
};

const toParticipantSummary = (participant: any, index: number): ParticipantSummary => {
  const identity = typeof participant.identity === 'string' ? participant.identity : null;
  const parsed = parseIdentity(identity);
  const rawRole = typeof participant.role === 'string' ? participant.role : parsed.role;
  const normalizedRole: 'gallery' | 'shipper' = rawRole === 'shipper' ? 'shipper' : 'gallery';

  const name: string | null =
    typeof participant.name === 'string'
      ? participant.name
      : typeof participant.full_name === 'string'
        ? participant.full_name
        : typeof participant.email === 'string'
          ? participant.email
          : null;

  const organizationName =
    typeof participant.organizationName === 'string'
      ? participant.organizationName
      : typeof participant.company === 'string'
        ? participant.company
        : typeof participant.organization === 'string'
          ? participant.organization
          : null;

  const organizationLogoUrl =
    typeof participant.organizationLogoUrl === 'string'
      ? participant.organizationLogoUrl
      : typeof (participant as any).organization_logo_url === 'string'
        ? (participant as any).organization_logo_url
        : typeof (participant as any).logoUrl === 'string'
          ? (participant as any).logoUrl
          : null;

  const avatarUrl =
    typeof participant.avatarUrl === 'string'
      ? participant.avatarUrl
      : typeof (participant as any).profileImageUrl === 'string'
        ? (participant as any).profileImageUrl
        : typeof (participant as any).profile_image_url === 'string'
          ? (participant as any).profile_image_url
          : organizationLogoUrl;

  return {
    id: (typeof participant.id === 'string' && participant.id) || `participant-${index}`,
    userId:
      typeof participant.user_id === 'string'
        ? participant.user_id
        : typeof participant.id === 'string'
          ? participant.id
          : parsed.userId,
    identity,
    role: normalizedRole,
    name,
    organizationName,
    locationLabel: extractParticipantLocation(participant),
    organizationLogoUrl,
    avatarUrl: avatarUrl ?? null,
  };
};

interface DecoratedMessage {
  base: ChatMessage;
  isSelf: boolean;
  displayName: string;
  organizationName: string | null;
  locationLabel: string | null;
  avatarUrl: string | null;
  avatarInitials: string;
}

const deriveThreadDisplay = (
  thread: ChatThreadSummary,
  quotes: QuoteWithDetails[],
  shipments: ShipmentWithDetails[],
) => {
  const metadata = thread.metadata || {};
  const participants = Array.isArray((metadata as any).participants)
    ? (metadata as any).participants as Array<Record<string, any>>
    : [];

  const participantSummaries = participants.map((participant, index) =>
    toParticipantSummary(participant, index)
  );

  const shipperParticipants = participantSummaries.filter((participant) => participant.role === 'shipper');
  const galleryParticipants = participantSummaries.filter((participant) => participant.role === 'gallery');

  const primaryShipper = shipperParticipants[0] ?? null;
  const primaryGallery = galleryParticipants[0] ?? null;

  const quote = thread.quoteId ? quotes.find((item) => item.id === thread.quoteId) : null;
  const shipment = thread.shipmentId ? shipments.find((item) => item.id === thread.shipmentId) : null;

  const shipmentRoute = shipment
    ? `${shipment.origin?.name || shipment.origin?.address_full || 'Origin TBD'} → ${shipment.destination?.name || shipment.destination?.address_full || 'Destination TBD'}`
    : null;

  const partnerRoute = typeof metadata.quoteRoute === 'string'
    ? metadata.quoteRoute
    : shipmentRoute || quote?.route || null;

  const contextLabel = shipment
    ? `Shipment • ${shipment.client_reference || shipment.name || shipment.code || shipment.id.slice(0, 6)}`
    : quote
      ? `Estimate • ${quote.client_reference || quote.title || quote.id.slice(0, 6)}`
      : typeof metadata.quoteTitle === 'string'
        ? metadata.quoteTitle
        : 'Conversation';

  const partnerDisplayName = primaryShipper?.name
    ? primaryShipper.name
    : typeof metadata.partnerName === 'string'
      ? metadata.partnerName
      : 'Logistics Partner';

  const abbreviationSource = primaryShipper?.name || partnerDisplayName || contextLabel;
  const partnerAbbreviation = abbreviationSource
    .split(' ')
    .slice(0, 2)
    .map((word: string) => word.charAt(0))
    .join('')
    .toUpperCase();

  const organizationNames = [
    primaryShipper?.organizationName,
    partnerDisplayName,
    typeof metadata.partnerCompany === 'string' ? metadata.partnerCompany : null,
    typeof metadata.contactOrganization === 'string' ? metadata.contactOrganization : null,
  ];

  const remoteLogoCandidates = [
    typeof metadata.shipperLogoUrl === 'string' ? metadata.shipperLogoUrl : null,
    typeof metadata.partnerLogoUrl === 'string' ? metadata.partnerLogoUrl : null,
    primaryShipper?.organizationLogoUrl ?? null,
    primaryGallery?.organizationLogoUrl ?? null,
  ];

  const { primary: partnerLogoUrl, fallback: partnerLogoFallbackUrl } = deriveLogoUrls(
    organizationNames,
    remoteLogoCandidates
  );

  return {
    contextLabel,
    partnerName: partnerDisplayName,
    partnerRoute,
    partnerAbbreviation,
    partnerColor: '#8412ff',
    participants,
    participantSummaries,
    galleryParticipants,
    shipperParticipants,
    primaryGalleryParticipant: primaryGallery,
    primaryShipperParticipant: primaryShipper,
    partnerLogoUrl,
    partnerLogoFallbackUrl,
  };
};

const MessagesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');
  const [chatLoading, setChatLoading] = useState(false);
  const [lastOpenDurationMs, setLastOpenDurationMs] = useState<number | null>(null);

  const fetchThreads = useChatStore((state) => state.fetchThreads);
  const loadMoreThreads = useChatStore((state) => state.loadMoreThreads);
  const selectThread = useChatStore((state) => state.selectThread);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const clearError = useChatStore((state) => state.clearError);
  const openThreadForQuote = useChatStore((state) => state.openThreadForQuote);

  const loading = useChatStore((state) => state.loading);
  const fetchingMoreThreads = useChatStore((state) => state.fetchingMoreThreads);
  const error = useChatStore((state) => state.error);
  const threads = useChatStore((state) => state.threads);
  const threadsHasMore = useChatStore((state) => state.threadsHasMore);
  const activeThreadId = useChatStore((state) => state.activeThreadId);
  const messages = useChatStore((state) => state.messages);
  const currentUserId = useSupabaseStore((state) => state.user?.id ?? null);
  const quotes = useSupabaseStore((state) => state.quotes);
  const shipments = useSupabaseStore((state) => state.shipments);
  const selfProfileImageUrl = useSupabaseStore((state) => state.profileImageUrl ?? null);

  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedThreadId = searchParams.get('threadId');
  const requestedQuoteId = searchParams.get('quoteId');
  const [initialSelectionHandled, setInitialSelectionHandled] = useState(false);

  useEffect(() => {
    fetchThreads({ reset: true }).catch((err) => {
      console.error('Failed to load chat threads', err);
    });
  }, [fetchThreads]);

  useEffect(() => {
    if (initialSelectionHandled || loading) {
      return;
    }

    const applyInitialSelection = async () => {
      try {
        if (requestedThreadId) {
          await selectThread(requestedThreadId);
          return;
        }

        if (requestedQuoteId) {
          const resolvedThreadId = await openThreadForQuote({ quoteId: requestedQuoteId });
          await selectThread(resolvedThreadId);
          return;
        }
      } catch (err) {
        console.error('MessagesPage: failed to apply initial selection', err);
      } finally {
        setInitialSelectionHandled(true);
        if ((requestedThreadId || requestedQuoteId) && location.search) {
          navigate('/messages', { replace: true });
        }
      }
    };

    applyInitialSelection();
  }, [
    initialSelectionHandled,
    loading,
    requestedThreadId,
    requestedQuoteId,
    threads,
    activeThreadId,
    selectThread,
    openThreadForQuote,
    navigate,
    location.search,
  ]);

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      const display = deriveThreadDisplay(thread, quotes, shipments);
      const participantNames = (display.participants || [])
        .map((participant) => (typeof participant?.name === 'string' ? participant.name : ''))
        .join(' ');
      const haystack = `${display.contextLabel || ''} ${display.partnerName || ''} ${participantNames}`
        .toLowerCase();
      const matchesSearch = haystack.includes(searchTerm.toLowerCase());
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && thread.unreadCount > 0);
      return matchesSearch && matchesFilter;
    });
  }, [threads, searchTerm, filter, quotes, shipments]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const activeMessages: ChatMessage[] = activeThreadId ? messages[activeThreadId] || [] : [];

  const selectedDisplay = useMemo(() => {
    return activeThread ? deriveThreadDisplay(activeThread, quotes, shipments) : null;
  }, [activeThread, quotes, shipments]);

  const participantSummaries = selectedDisplay?.participantSummaries ?? [];

  const participantLookup = useMemo(() => {
    const byUserId = new Map<string, ParticipantSummary>();
    const byIdentity = new Map<string, ParticipantSummary>();

    participantSummaries.forEach((participant) => {
      if (participant.userId) {
        byUserId.set(participant.userId, participant);
      }
      if (participant.identity) {
        byIdentity.set(participant.identity, participant);
      }
    });

    return { byUserId, byIdentity };
  }, [participantSummaries]);

  const decoratedMessages: DecoratedMessage[] = useMemo(() => {
    return activeMessages.map((message) => {
      const isSelf = message.authorUserId === currentUserId;
      let participant: ParticipantSummary | undefined;

      if (message.authorUserId) {
        participant = participantLookup.byUserId.get(message.authorUserId) ?? undefined;
      }
      if (!participant && message.authorIdentity) {
        participant = participantLookup.byIdentity.get(message.authorIdentity) ?? undefined;
      }

      const parsedIdentity = parseIdentity(message.authorIdentity);

      let displayName = participant?.name || (isSelf ? 'You' : null);
      let organizationName = participant?.organizationName || null;
      let locationLabel = participant?.locationLabel || null;

      if (!displayName) {
        if (parsedIdentity.role === 'shipper') {
          displayName = 'Logistics Partner';
        } else if (parsedIdentity.role === 'gallery' || parsedIdentity.role === 'client') {
          displayName = 'Gallery Team';
        } else {
          displayName = 'Participant';
        }
      }

      if (!organizationName) {
        if (participant?.role === 'shipper' && selectedDisplay?.primaryShipperParticipant?.organizationName) {
          organizationName = selectedDisplay.primaryShipperParticipant.organizationName;
        } else if (
          participant?.role === 'gallery' && selectedDisplay?.primaryGalleryParticipant?.organizationName
        ) {
          organizationName = selectedDisplay.primaryGalleryParticipant.organizationName;
        }
      }

      if (!locationLabel) {
        if (participant?.role === 'shipper') {
          locationLabel = selectedDisplay?.shipperParticipants.find((item) => item.locationLabel)?.locationLabel ?? null;
        } else if (participant?.role === 'gallery') {
          locationLabel = selectedDisplay?.galleryParticipants.find((item) => item.locationLabel)?.locationLabel ?? null;
        }
      }

      if (isSelf) {
        if (!organizationName && selectedDisplay?.primaryGalleryParticipant?.organizationName) {
          organizationName = selectedDisplay.primaryGalleryParticipant.organizationName;
        }
        if (!locationLabel && selectedDisplay?.primaryGalleryParticipant?.locationLabel) {
          locationLabel = selectedDisplay.primaryGalleryParticipant.locationLabel;
        }
      }

      const logoNames = [
        participant?.organizationName,
        participant?.name,
        selectedDisplay?.partnerName,
        selectedDisplay?.contextLabel,
        selectedDisplay?.primaryShipperParticipant?.organizationName,
        selectedDisplay?.primaryGalleryParticipant?.organizationName,
      ];

      const logoRemotes = [
        participant?.organizationLogoUrl,
        participant?.avatarUrl,
        selectedDisplay?.partnerLogoUrl,
        selectedDisplay?.partnerLogoFallbackUrl,
      ];

      const { primary: participantLogoUrl } = deriveLogoUrls(logoNames, logoRemotes);

      let avatarUrl: string | null = isSelf ? selfProfileImageUrl : null;
      if (!avatarUrl && participant?.avatarUrl) {
        avatarUrl = participant.avatarUrl;
      }
      if (!avatarUrl) {
        avatarUrl = participantLogoUrl;
      }

      const avatarInitials = buildInitials(
        displayName || organizationName || (participant?.role === 'shipper' ? 'Partner' : 'Gallery')
      );

      return {
        base: message,
        isSelf,
        displayName,
        organizationName,
        locationLabel,
        avatarUrl,
        avatarInitials,
      };
    });
  }, [
    activeMessages,
    currentUserId,
    participantLookup,
    selectedDisplay,
    selfProfileImageUrl,
  ]);

  const handleSelectThread = async (threadId: string) => {
    const start = performance.now();
    try {
      setChatLoading(true);
      await selectThread(threadId);
      clearError();
    } catch (err: any) {
      console.error('Failed to open conversation', err);
    } finally {
      setLastOpenDurationMs(Math.round(performance.now() - start));
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (lastOpenDurationMs !== null) {
      console.log('[MessagesPage] click→open total', `${lastOpenDurationMs}ms`);
    }
  }, [lastOpenDurationMs]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeThreadId) return;
    try {
      await sendMessage(activeThreadId, newMessage.trim());
      setNewMessage('');
    } catch (err: any) {
      console.error('Failed to send message', err);
    }
  };

  return (
    <div className="main-wrap">
      <motion.div
        className="main-panel"
        initial="hidden"
        animate="show"
        variants={slideInLeft}
        style={{ willChange: 'transform' }}
      >
        <header className="header">
          <div className="header-row">
            <h1 className="header-title">Messages</h1>
            <IconButton sx={{ color: '#170849' }}>
              <FilterIcon />
            </IconButton>
            <IconButton sx={{ color: '#170849' }}>
              <MoreIcon />
            </IconButton>
          </div>
        </header>

        <div className="main-content" style={{ display: 'flex', height: 'calc(100vh - 140px)', gap: 0, padding: 0 }}>
          <Box
            sx={{
              width: 380,
              bgcolor: '#ffffff',
              borderRight: '1px solid #e9eaeb',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '12px 0 0 0'
            }}
          >
            <Box sx={{ p: '20px 24px 16px' }}>
              <TextField
                fullWidth
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#58517E', fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  sx: {
                    borderRadius: '10px',
                    bgcolor: '#f8f9fa',
                    '& fieldset': { border: '1px solid #e9eaeb' }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '&:hover fieldset': { borderColor: '#8412ff' },
                    '&.Mui-focused fieldset': { borderColor: '#8412ff' }
                  }
                }}
              />

              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread' },
                  { key: 'starred', label: 'Starred' }
                ].map((tab) => (
                  <Button
                    key={tab.key}
                    variant={filter === tab.key ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => setFilter(tab.key as any)}
                    sx={{
                      textTransform: 'none',
                      fontSize: '12px',
                      fontWeight: 500,
                      minWidth: 'auto',
                      px: 2,
                      py: 0.5,
                      borderRadius: '16px',
                      ...(filter === tab.key
                        ? {
                            bgcolor: '#8412ff',
                            '&:hover': { bgcolor: '#730add' }
                          }
                        : {
                            borderColor: '#e9eaeb',
                            color: '#58517E',
                            '&:hover': { borderColor: '#8412ff', color: '#8412ff' }
                          })
                    }}
                  >
                    {tab.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {error && (
              <Box sx={{ px: 3, pb: 1 }}>
                <Alert severity="error" onClose={() => clearError()}>{error}</Alert>
              </Box>
            )}

            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-track': { background: 'transparent' },
                '&::-webkit-scrollbar-thumb': {
                  background: '#e9eaeb',
                  borderRadius: '3px'
                }
              }}
            >
              {loading && (
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {!loading && filteredThreads.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center', color: '#58517E' }}>
                  <Typography variant="body2">No conversations yet.</Typography>
                </Box>
              )}

              {filteredThreads.map((thread, index) => {
                const display = deriveThreadDisplay(thread, quotes, shipments);
                const threadMessages = messages[thread.id] || [];
                const lastThreadMessage =
                  threadMessages.length > 0
                    ? threadMessages[threadMessages.length - 1]
                    : null;
                const lastMessagePreview = lastThreadMessage?.body || 'No messages yet';
                const lastMessageTime = lastThreadMessage
                  ? formatRelativeTime(lastThreadMessage.timestamp)
                  : formatRelativeTime(thread.lastMessageAt);

                const isSelected = activeThreadId === thread.id;

                return (
                  <Box key={thread.id}>
                    <Box
                      onClick={() => handleSelectThread(thread.id)}
                      sx={{
                        p: '16px 24px',
                        cursor: 'pointer',
                        bgcolor: isSelected ? 'rgba(132, 18, 255, 0.08)' : 'transparent',
                        borderLeft: isSelected ? '3px solid #8412ff' : '3px solid transparent',
                        '&:hover': {
                          bgcolor: isSelected
                            ? 'rgba(132, 18, 255, 0.12)'
                            : 'rgba(132, 18, 255, 0.04)'
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                        <Box sx={{ position: 'relative' }}>
                        <Avatar
                          src={(display.partnerLogoUrl ?? display.partnerLogoFallbackUrl) ?? undefined}
                          sx={{
                            bgcolor: display.partnerLogoUrl || display.partnerLogoFallbackUrl ? '#ffffff' : display.partnerColor,
                            width: 48,
                            height: 48,
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: display.partnerLogoUrl || display.partnerLogoFallbackUrl ? '#170849' : '#ffffff',
                            border: display.partnerLogoUrl || display.partnerLogoFallbackUrl ? '1px solid rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          {!display.partnerLogoUrl && !display.partnerLogoFallbackUrl && display.partnerAbbreviation}
                        </Avatar>
                        </Box>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{ fontWeight: 600, color: '#170849', fontSize: '14px' }}
                            >
                              {display.contextLabel || display.partnerName}
                            </Typography>
                            {display.partnerName && display.contextLabel && display.partnerName !== display.contextLabel && (
                              <Typography
                                variant="caption"
                                sx={{ color: '#58517E', fontSize: '11px', display: 'block' }}
                              >
                                {display.partnerName}
                              </Typography>
                            )}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {thread.unreadCount > 0 && (
                                <StarIcon sx={{ fontSize: 14, color: '#FFB800' }} />
                              )}
                              <Typography
                                variant="caption"
                                sx={{ color: '#58517E', fontSize: '11px', whiteSpace: 'nowrap' }}
                              >
                                {lastMessageTime}
                              </Typography>
                            </Box>
                          </Box>

                          {display.partnerRoute && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: '#8412ff',
                                fontSize: '11px',
                                fontWeight: 500,
                                display: 'block',
                                mb: 0.5
                              }}
                            >
                              {display.partnerRoute}
                            </Typography>
                          )}
                          {display.participants && display.participants.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                              {display.participants.map((participant) => {
                                const name = typeof participant?.name === 'string' ? participant.name : '';
                                if (!name) return null;
                                const abbreviation = name
                                  .split(' ')
                                  .slice(0, 2)
                                  .map((word: string) => word.charAt(0))
                                  .join('')
                                  .toUpperCase();
                                const isShipper = participant?.role === 'shipper';
                                return (
                                  <Chip
                                    key={`${thread.id}-${name}`}
                                    label={name}
                                    size="small"
                                    avatar={(
                                      <Avatar
                                        sx={{
                                          bgcolor: isShipper ? '#00aaab' : '#58517E',
                                          color: '#ffffff',
                                          width: 20,
                                          height: 20,
                                          fontSize: '10px',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {abbreviation}
                                      </Avatar>
                                    )}
                                    sx={{
                                      bgcolor: isShipper ? 'rgba(0, 170, 171, 0.12)' : 'rgba(132, 18, 255, 0.12)',
                                      color: isShipper ? '#008a8b' : '#58517E',
                                      fontWeight: 600,
                                      fontSize: '11px',
                                      borderRadius: '14px'
                                    }}
                                  />
                                );
                              })}
                            </Box>
                          )}

                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography
                              variant="body2"
                              sx={{
                                color: thread.unreadCount > 0 ? '#170849' : '#58517E',
                                fontSize: '13px',
                                fontWeight: thread.unreadCount > 0 ? 500 : 400,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '180px'
                              }}
                            >
                              {lastMessagePreview}
                            </Typography>
                            {thread.unreadCount > 0 && (
                              <Chip
                                label={thread.unreadCount}
                                size="small"
                                sx={{
                                  bgcolor: '#8412ff',
                                  color: 'white',
                                  fontSize: '10px',
                                  height: '18px',
                                  minWidth: '18px',
                                  '& .MuiChip-label': { px: 0.5 }
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                    {index < filteredThreads.length - 1 && (
                      <Divider sx={{ ml: '88px', mr: '24px' }} />
                    )}
                  </Box>
                );
              })}

              {threadsHasMore && (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={loadMoreThreads}
                    disabled={fetchingMoreThreads}
                    startIcon={fetchingMoreThreads ? <CircularProgress size={14} /> : undefined}
                    sx={{ textTransform: 'none', borderRadius: '12px' }}
                  >
                    {fetchingMoreThreads ? 'Loading…' : 'Load more conversations'}
                  </Button>
                </Box>
              )}
            </Box>
          </Box>

          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: '#ffffff',
              borderRadius: '0 12px 0 0'
            }}
          >
            {activeThread && selectedDisplay ? (
              <>
                <Box
                  sx={{
                    p: '20px 24px',
                    borderBottom: '1px solid #e9eaeb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar
                      src={(selectedDisplay.partnerLogoUrl ?? selectedDisplay.partnerLogoFallbackUrl) ?? undefined}
                      sx={{
                        bgcolor: selectedDisplay.partnerLogoUrl || selectedDisplay.partnerLogoFallbackUrl ? '#ffffff' : selectedDisplay.partnerColor,
                        width: 44,
                        height: 44,
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: selectedDisplay.partnerLogoUrl || selectedDisplay.partnerLogoFallbackUrl ? '#170849' : '#ffffff',
                        border: selectedDisplay.partnerLogoUrl || selectedDisplay.partnerLogoFallbackUrl ? '1px solid rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {!selectedDisplay.partnerLogoUrl && !selectedDisplay.partnerLogoFallbackUrl && selectedDisplay.partnerAbbreviation}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ color: '#170849', fontWeight: 600, fontSize: '16px' }}>
                        {selectedDisplay.contextLabel || selectedDisplay.partnerName}
                      </Typography>
                      {selectedDisplay.partnerName && selectedDisplay.contextLabel && selectedDisplay.partnerName !== selectedDisplay.contextLabel && (
                        <Typography variant="body2" sx={{ color: '#58517E', fontSize: '13px' }}>
                          {selectedDisplay.partnerName}
                        </Typography>
                      )}
                      {selectedDisplay.partnerRoute && (
                        <Typography variant="body2" sx={{ color: '#58517E', fontSize: '13px' }}>
                          {selectedDisplay.partnerRoute}
                        </Typography>
                      )}
                      {selectedDisplay.participants && selectedDisplay.participants.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {selectedDisplay.participants.map((participant) => {
                            const name = typeof participant?.name === 'string' ? participant.name : '';
                            if (!name) return null;
                            const abbreviation = name
                              .split(' ')
                              .slice(0, 2)
                              .map((word: string) => word.charAt(0))
                              .join('')
                              .toUpperCase();
                            const isShipper = participant?.role === 'shipper';
                            return (
                              <Chip
                                key={`active-${name}`}
                                label={name}
                                size="small"
                                avatar={(
                                  <Avatar
                                    sx={{
                                      bgcolor: isShipper ? '#00aaab' : '#58517E',
                                      color: '#ffffff',
                                      width: 20,
                                      height: 20,
                                      fontSize: '10px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {abbreviation}
                                  </Avatar>
                                )}
                                sx={{
                                  bgcolor: isShipper ? 'rgba(0, 170, 171, 0.12)' : 'rgba(132, 18, 255, 0.12)',
                                  color: isShipper ? '#008a8b' : '#58517E',
                                  fontWeight: 600,
                                  fontSize: '11px',
                                  borderRadius: '14px'
                                }}
                              />
                            );
                          })}
                        </Box>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton sx={{ color: '#58517E' }}>
                      <StarBorderIcon />
                    </IconButton>
                    <IconButton sx={{ color: '#58517E' }}>
                      <MoreIcon />
                    </IconButton>
                  </Box>
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    overflowY: 'auto',
                    px: 3,
                    py: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                background: 'linear-gradient(180deg, #f8f5ff 0%, #ffffff 100%)'
              }}
            >
              {chatLoading && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
                  {[
                    { id: 1, isUser: false },
                    { id: 2, isUser: false },
                    { id: 3, isUser: true },
                    { id: 4, isUser: false },
                    { id: 5, isUser: true },
                  ].map(({ id, isUser }) => (
                    <Box
                      key={id}
                      sx={{
                        display: 'flex',
                        justifyContent: isUser ? 'flex-end' : 'flex-start',
                        width: '100%',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: isUser ? 'row-reverse' : 'row',
                          alignItems: 'flex-start',
                          gap: 1.25,
                          maxWidth: '82%',
                        }}
                      >
                        <Skeleton variant="circular" width={44} height={44} sx={{ flexShrink: 0 }} />
                        <Box
                          sx={{
                            flex: 1,
                            bgcolor: isUser ? '#8412ff' : '#ffffff',
                            color: isUser ? '#fff' : '#170849',
                            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            border: isUser ? 'none' : '1px solid #f0ebff',
                            boxShadow: isUser
                              ? '0 10px 20px rgba(132, 18, 255, 0.18)'
                              : '0 10px 20px rgba(23, 8, 73, 0.08)',
                            p: 1.75,
                            minWidth: 220,
                          }}
                        >
                          <Skeleton
                            variant="rectangular"
                            height={14}
                            width="60%"
                            sx={{
                              borderRadius: 1,
                              bgcolor: isUser ? 'rgba(255,255,255,0.35)' : '#ebe6ff',
                              mb: 1,
                            }}
                          />
                          <Skeleton
                            variant="rectangular"
                            height={18}
                            width="80%"
                            sx={{
                              borderRadius: 1,
                              bgcolor: isUser ? 'rgba(255,255,255,0.55)' : '#f3efff',
                              mb: 0.5,
                            }}
                          />
                          <Skeleton
                            variant="rectangular"
                            height={16}
                            width="55%"
                            sx={{
                              borderRadius: 1,
                              bgcolor: isUser ? 'rgba(255,255,255,0.4)' : '#f7f3ff',
                              mb: 1,
                            }}
                          />
                          <Skeleton
                            variant="rectangular"
                            height={12}
                            width="26%"
                            sx={{
                              borderRadius: 1,
                              bgcolor: isUser ? 'rgba(255,255,255,0.3)' : '#f0eaff',
                            }}
                          />
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {!chatLoading && decoratedMessages.length === 0 && (
                <Typography variant="body2" sx={{ textAlign: 'center', color: '#58517E' }}>
                  No messages yet. Start the conversation below.
                </Typography>
              )}

                  {!chatLoading && decoratedMessages.map((message) => {
                    const isUser = message.isSelf;
                    return (
                      <Box
                        key={message.base.sid}
                        sx={{
                          display: 'flex',
                          justifyContent: isUser ? 'flex-end' : 'flex-start',
                          width: '100%',
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: isUser ? 'row-reverse' : 'row',
                            alignItems: 'flex-end',
                            gap: 1.25,
                            maxWidth: '80%',
                          }}
                        >
                          <Avatar
                            src={message.avatarUrl ?? undefined}
                            sx={{
                              width: 40,
                              height: 40,
                              bgcolor: message.avatarUrl
                                ? '#ffffff'
                                : isUser
                                  ? '#8412ff'
                                  : 'rgba(132, 18, 255, 0.1)',
                              color: message.avatarUrl ? '#170849' : isUser ? '#ffffff' : '#58517E',
                              border: message.avatarUrl ? '1px solid rgba(0,0,0,0.08)' : 'none',
                              boxShadow: message.avatarUrl ? '0 6px 14px rgba(23, 8, 73, 0.08)' : 'none',
                            }}
                          >
                            {!message.avatarUrl && message.avatarInitials}
                          </Avatar>
                          <Paper
                            elevation={0}
                            sx={{
                              maxWidth: '65%',
                              p: 2,
                              borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                              bgcolor: isUser ? '#8412ff' : '#ffffff',
                              color: isUser ? 'white' : '#170849',
                              border: isUser ? 'none' : '1px solid #f0ebff'
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                display: 'block',
                                fontWeight: 600,
                                opacity: isUser ? 0.85 : 0.75,
                                mb: 0.5,
                              }}
                            >
                              {message.displayName}
                              {message.organizationName ? ` • ${message.organizationName}` : ''}
                              {message.locationLabel ? ` • ${message.locationLabel}` : ''}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '14px',
                                lineHeight: 1.4,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                              }}
                            >
                              {message.base.body || '(no content)'}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                display: 'block',
                                mt: 0.5,
                                opacity: isUser ? 0.8 : 0.6,
                                fontSize: '10px',
                                textAlign: isUser ? 'right' : 'left'
                              }}
                            >
                              {formatTime(message.base.timestamp)}
                            </Typography>
                          </Paper>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                <Box
                  sx={{
                    p: '16px 24px 20px',
                    borderTop: '1px solid #e9eaeb'
                  }}
                >
                  <TextField
                    fullWidth
                    multiline
                    maxRows={3}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    variant="outlined"
                    size="small"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton
                              onClick={handleSendMessage}
                              disabled={!newMessage.trim()}
                              size="small"
                              sx={{
                                padding: '6px',
                                bgcolor: newMessage.trim() ? '#8412ff' : 'transparent',
                                color: newMessage.trim() ? 'white' : '#ccc',
                                '&:hover': {
                                  bgcolor: newMessage.trim() ? '#730add' : 'rgba(132, 18, 255, 0.08)'
                                },
                                '&:disabled': {
                                  bgcolor: 'transparent',
                                  color: '#ddd'
                                }
                              }}
                            >
                              <SendIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </InputAdornment>
                      ),
                      sx: {
                        borderRadius: '20px',
                        bgcolor: '#f8f9fa',
                        '& fieldset': { border: '1px solid #e9eaeb' }
                      }
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        paddingRight: '8px',
                        '&:hover fieldset': { borderColor: '#8412ff' },
                        '&.Mui-focused fieldset': { borderColor: '#8412ff' }
                      }
                    }}
                  />
                </Box>
              </>
            ) : (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  color: '#58517E'
                }}
              >
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {loading ? 'Loading conversations…' : 'Select a conversation'}
                </Typography>
                <Typography variant="body2">
                  {loading
                    ? 'Fetching the latest updates from Twilio.'
                    : 'Choose a conversation from the sidebar to start messaging'}
                </Typography>
              </Box>
            )}
          </Box>
        </div>
      </motion.div>
    </div>
  );
};

export default MessagesPage;
