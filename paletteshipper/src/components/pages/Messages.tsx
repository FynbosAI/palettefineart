import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  TextField,
  Typography,
  Avatar,
  IconButton,
  InputAdornment,
  Divider,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Skeleton,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  MoreVert as MoreIcon,
  AttachFile as AttachIcon,
  Send as SendIcon,
  Phone as PhoneIcon,
  VideoCall as VideoIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import { motion } from 'motion/react';
import { slideInLeft } from '../../lib/motion';
import useChatStore, { type ChatThreadSummary, type ChatMessage } from '../../store/chatStore';
import useShipperStore from '../../store/useShipperStore';
import { useLocation, useNavigate } from 'react-router-dom';

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

type ParticipantSummary = {
  id: string;
  userId: string | null;
  identity: string | null;
  role: 'gallery' | 'shipper';
  name: string | null;
  organizationName: string | null;
  avatarText: string;
  locationLabel: string | null;
};

interface ThreadPresentation {
  partnerName: string;
  subtitle: string | null;
  shipmentLabel: string | null;
  route: string | null;
  avatarText: string;
  partnerColor: string;
  participants: ParticipantSummary[];
  galleryParticipant: ParticipantSummary | null;
  shipperParticipants: ParticipantSummary[];
}

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
  const inferredRole = participant.role === 'shipper' ? 'shipper' : 'gallery';
  const name: string | null =
    typeof participant.name === 'string'
      ? participant.name
      : typeof participant.full_name === 'string'
        ? participant.full_name
        : typeof participant.email === 'string'
          ? participant.email
          : null;

  const organisation =
    typeof participant.organizationName === 'string'
      ? participant.organizationName
      : typeof participant.company === 'string'
        ? participant.company
        : typeof participant.organization === 'string'
          ? participant.organization
          : null;

  const initialsSource = name || organisation || parsed.identity || `participant-${index}`;
  const avatarText = initialsSource
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word: string) => word.charAt(0))
    .join('')
    .toUpperCase();

  return {
    id: (typeof participant.id === 'string' && participant.id) || `participant-${index}`,
    userId:
      typeof participant.user_id === 'string'
        ? participant.user_id
        : typeof participant.id === 'string'
          ? participant.id
          : parsed.userId,
    identity,
    role: inferredRole,
    name,
    organizationName: organisation,
    avatarText,
    locationLabel: extractParticipantLocation(participant),
  };
};

const deriveThreadDisplay = (
  thread: ChatThreadSummary,
  currentUserId: string | null
): ThreadPresentation => {
  const metadata = (thread.metadata ?? {}) as Record<string, any>;
  const rawParticipants = Array.isArray(metadata.participants) ? metadata.participants : [];
  const participants = rawParticipants.map(toParticipantSummary);

  const galleryParticipant = participants.find((p) => p.role === 'gallery' && p.userId !== currentUserId) ?? null;
  const shipperParticipants = participants.filter((p) => p.role === 'shipper' && p.userId !== currentUserId);

  const shipmentLabel =
    (typeof metadata.shipmentReference === 'string' && metadata.shipmentReference) ||
    (typeof metadata.shipmentCode === 'string' && metadata.shipmentCode) ||
    (typeof metadata.quoteTitle === 'string' && metadata.quoteTitle) ||
    (typeof metadata.partnerName === 'string' && metadata.partnerName) ||
    (thread.shipmentId ? `Shipment ${thread.shipmentId.slice(0, 8)}` : null);

  const contactName =
    (typeof metadata.contactName === 'string' && metadata.contactName) ||
    galleryParticipant?.name ||
    (typeof metadata.partnerContact === 'string' && metadata.partnerContact) ||
    null;

  const organizationName =
    (typeof metadata.contactOrganization === 'string' && metadata.contactOrganization) ||
    galleryParticipant?.organizationName ||
    (typeof metadata.partnerCompany === 'string' && metadata.partnerCompany) ||
    null;

  const subtitleParts = [contactName, organizationName, shipmentLabel].filter(Boolean) as string[];

  const avatarSource = contactName || organizationName || shipmentLabel || 'Conversation';
  const avatarText = avatarSource
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word: string) => word.charAt(0))
    .join('')
    .toUpperCase();

  return {
    partnerName: shipmentLabel || 'Conversation',
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' • ') : null,
    shipmentLabel,
    route:
      (typeof metadata.quoteRoute === 'string' && metadata.quoteRoute) ||
      (typeof metadata.route === 'string' && metadata.route) ||
      null,
    avatarText,
    partnerColor: '#8412ff',
    participants,
    galleryParticipant,
    shipperParticipants,
  };
};

const getThreadCategory = (
  presentation: ThreadPresentation,
  currentUserId: string | null
): 'galleries' | 'shippers' => {
  const hasExternalGallery =
    presentation.galleryParticipant && presentation.galleryParticipant.userId !== currentUserId;
  if (hasExternalGallery) {
    return 'galleries';
  }

  const hasExternalShipper = presentation.shipperParticipants.some(
    (participant) => participant.userId !== currentUserId
  );

  return hasExternalShipper ? 'shippers' : 'galleries';
};

interface DecoratedMessage {
  base: ChatMessage;
  isSelf: boolean;
  displayName: string;
  organizationName: string | null;
  locationLabel: string | null;
}

const Messages: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');
  const autoSelectRef = useRef<string | null>(null);

  const fetchThreads = useChatStore((state) => state.fetchThreads);
  const selectThread = useChatStore((state) => state.selectThread);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const clearError = useChatStore((state) => state.clearError);
  const openThreadForQuote = useChatStore((state) => state.openThreadForQuote);

  const loading = useChatStore((state) => state.loading);
  const error = useChatStore((state) => state.error);
  const threads = useChatStore((state) => state.threads);
  const threadCount = threads.length;
  const activeThreadId = useChatStore((state) => state.activeThreadId);
  const messages = useChatStore((state) => state.messages);
  const warmupInFlight = useChatStore((state) => state.warmupInFlight);
  const chatApiAvailable = useChatStore((state) => state.chatApiAvailable);

  const user = useShipperStore((state) => state.user);
  const organization = useShipperStore((state) => state.organization);
  const currentUserId = user?.id ?? null;

  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedThreadId = searchParams.get('threadId');
  const requestedQuoteId = searchParams.get('quoteId');
  const [initialSelectionHandled, setInitialSelectionHandled] = useState(false);

  const isSidebarLoading = loading && threadCount === 0;
  const isThreadInitializing =
    warmupInFlight || (!initialSelectionHandled && (loading || threadCount > 0) && !activeThreadId);

  useEffect(() => {
    if (loading || threadCount > 0) {
      return;
    }

    fetchThreads().catch((err) => {
      console.error('[ShipperMessages] Failed to load chat threads', err);
    });
  }, [fetchThreads, loading, threadCount]);

  useEffect(() => {
    if (threadCount === 0) {
      autoSelectRef.current = null;
    }
  }, [threadCount]);

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

        if (!activeThreadId && threadCount > 0) {
          const defaultThreadId = threads[0].id;
          if (autoSelectRef.current !== defaultThreadId) {
            autoSelectRef.current = defaultThreadId;
            await selectThread(defaultThreadId);
          }
        }
      } catch (err) {
        console.error('[ShipperMessages] Failed to apply initial selection', err);
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
    threadCount,
    activeThreadId,
    selectThread,
    openThreadForQuote,
    navigate,
    location.search,
  ]);

  useEffect(() => {
    if (!initialSelectionHandled) {
      return;
    }

    if (!activeThreadId && threadCount > 0) {
      const defaultThreadId = threads[0].id;
      if (autoSelectRef.current === defaultThreadId) {
        return;
      }

      autoSelectRef.current = defaultThreadId;

      selectThread(defaultThreadId).catch((err) => {
        console.error('[ShipperMessages] Failed to select initial thread', err);
      });
    }
  }, [
    threads,
    threadCount,
    activeThreadId,
    selectThread,
    initialSelectionHandled,
  ]);

  const threadPresentations = useMemo(() => {
    return threads.map((thread) => ({
      thread,
      presentation: deriveThreadDisplay(thread, currentUserId),
    }));
  }, [threads, currentUserId]);

  const groupedThreads = useMemo(() => {
    return threadPresentations.reduce(
      (acc, item) => {
        const groupKey = getThreadCategory(item.presentation, currentUserId);
        acc[groupKey].push(item);
        return acc;
      },
      {
        galleries: [] as Array<{ thread: ChatThreadSummary; presentation: ThreadPresentation }>,
        shippers: [] as Array<{ thread: ChatThreadSummary; presentation: ThreadPresentation }>,
      }
    );
  }, [threadPresentations, currentUserId]);

  const filteredGroup = (
    items: Array<{ thread: ChatThreadSummary; presentation: ThreadPresentation }>
  ) => {
    return items.filter(({ thread, presentation }) => {
      const matchesSearch =
        !searchTerm ||
        presentation.partnerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (presentation.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && thread.unreadCount > 0) ||
        (filter === 'starred' && Boolean((thread.metadata as any)?.isStarred));

      return matchesSearch && matchesFilter;
    });
  };

  const filteredGroups = {
    galleries: filteredGroup(groupedThreads.galleries),
    shippers: filteredGroup(groupedThreads.shippers),
  };

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const activePresentation = useMemo(() => {
    if (!activeThread) return null;
    return deriveThreadDisplay(activeThread, currentUserId);
  }, [activeThread, currentUserId]);

  const activeMessages: ChatMessage[] = activeThreadId ? messages[activeThreadId] || [] : [];

  const participantLookup = useMemo(() => {
    if (!activePresentation) {
      return {
        byUserId: new Map<string, ParticipantSummary>(),
        byIdentity: new Map<string, ParticipantSummary>(),
      };
    }

    const byUserId = new Map<string, ParticipantSummary>();
    const byIdentity = new Map<string, ParticipantSummary>();

    activePresentation.participants.forEach((participant) => {
      if (participant.userId) {
        byUserId.set(participant.userId, participant);
      }
      if (participant.identity) {
        byIdentity.set(participant.identity, participant);
      }
    });

    return { byUserId, byIdentity };
  }, [activePresentation]);

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

      let displayName = participant?.name || (isSelf ? 'You' : null);
      let organizationName = participant?.organizationName || null;
      let locationLabel = participant?.locationLabel || null;

      if (!displayName) {
        const parsed = parseIdentity(message.authorIdentity);
        if (parsed.role === 'shipper') {
          displayName = 'Logistics Partner';
        } else if (parsed.role === 'gallery' || parsed.role === 'client') {
          displayName = 'Gallery Team';
        } else {
          displayName = 'Participant';
        }
      }

      if (isSelf && !organizationName) {
        organizationName = organization?.name ?? 'Your team';
      }

      if (!organizationName && activePresentation?.galleryParticipant) {
        organizationName = activePresentation.galleryParticipant.organizationName;
      }

      if (isSelf && !locationLabel) {
        const branchName = organization?.branch_name ?? null;
        locationLabel = branchName ? branchName : null;
      }

      if (!locationLabel && participant?.role === 'gallery' && activePresentation?.galleryParticipant) {
        locationLabel = activePresentation.galleryParticipant.locationLabel;
      }

      if (!locationLabel && participant?.role === 'shipper' && activePresentation?.shipperParticipants.length) {
        const peerWithLocation = activePresentation.shipperParticipants.find(
          (item) => item.locationLabel
        );
        locationLabel = peerWithLocation?.locationLabel ?? null;
      }

      return {
        base: message,
        isSelf,
        displayName,
        organizationName,
        locationLabel,
      };
    });
  }, [activeMessages, currentUserId, participantLookup, organization, activePresentation]);

  const handleSelectThread = async (threadId: string) => {
    try {
      await selectThread(threadId);
      clearError();
    } catch (err: any) {
      console.error('[ShipperMessages] Failed to open conversation', err);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeThreadId) return;
    try {
      await sendMessage(activeThreadId, newMessage.trim());
      setNewMessage('');
    } catch (err: any) {
      console.error('[ShipperMessages] Failed to send message', err);
    }
  };

  const renderThreadGroup = (
    title: string,
    items: Array<{ thread: ChatThreadSummary; presentation: ThreadPresentation }>,
    emptyLabel: string
  ) => (
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: '#58517E',
          fontWeight: 600,
          px: '24px',
          pb: 1,
        }}
      >
        {title}
      </Typography>

      {items.length === 0 ? (
        <Box sx={{ py: 2.5, px: '24px' }}>
          <Typography variant="body2" sx={{ color: '#8B87A2', fontStyle: 'italic' }}>
            {emptyLabel}
          </Typography>
        </Box>
      ) : (
        items.map(({ thread, presentation }, index) => {
          const threadMessages = messages[thread.id] || [];
          const lastThreadMessage =
            threadMessages.length > 0 ? threadMessages[threadMessages.length - 1] : null;
          const lastMessagePreview = lastThreadMessage?.body || (thread.metadata as any)?.lastMessage || 'No messages yet';
          const lastMessageTime = lastThreadMessage
            ? formatRelativeTime(lastThreadMessage.timestamp)
            : formatRelativeTime(thread.lastMessageAt);

          const isSelected = activeThreadId === thread.id;

          return (
            <React.Fragment key={thread.id}>
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
                      : 'rgba(132, 18, 255, 0.04)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Avatar
                    sx={{
                      bgcolor: presentation.partnerColor,
                      width: 48,
                      height: 48,
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: 'white',
                    }}
                  >
                    {presentation.avatarText}
                  </Avatar>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, color: '#170849', fontSize: '14px' }}
                      >
                        {presentation.partnerName}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: '#58517E', fontSize: '11px', whiteSpace: 'nowrap' }}
                      >
                        {lastMessageTime}
                      </Typography>
                    </Box>

                    {presentation.subtitle && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: '#8412ff',
                          fontSize: '11px',
                          fontWeight: 500,
                          display: 'block',
                          mb: 0.5,
                        }}
                      >
                        {presentation.subtitle}
                      </Typography>
                    )}

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: thread.unreadCount > 0 ? '#170849' : '#58517E',
                          fontSize: '13px',
                          fontWeight: thread.unreadCount > 0 ? 500 : 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '180px',
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
                            '& .MuiChip-label': { px: 0.5 },
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
              {index < items.length - 1 && <Divider sx={{ ml: '88px', mr: '24px' }} />}
            </React.Fragment>
          );
        })
      )}
    </Box>
  );

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

        <div
          className="main-content"
          style={{ display: 'flex', height: 'calc(100vh - 140px)', gap: 0, padding: 0 }}
        >
          <Box
            sx={{
              width: 380,
              bgcolor: '#ffffff',
              borderRight: '1px solid #e9eaeb',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '12px 0 0 0',
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
                    '& fieldset': { border: '1px solid #e9eaeb' },
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '&:hover fieldset': { borderColor: '#8412ff' },
                    '&.Mui-focused fieldset': { borderColor: '#8412ff' },
                  },
                }}
              />

              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread' },
                  { key: 'starred', label: 'Starred' },
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
                            '&:hover': { bgcolor: '#730add' },
                          }
                        : {
                            borderColor: '#e9eaeb',
                            color: '#58517E',
                            '&:hover': { borderColor: '#8412ff', color: '#8412ff' },
                          }),
                    }}
                  >
                    {tab.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {error && (
              <Box sx={{ px: 3 }}>
                <Alert severity="error" onClose={() => clearError()}>
                  {error}
                </Alert>
              </Box>
            )}

            {!chatApiAvailable && (
              <Box sx={{ px: 3, pt: error ? 1.5 : 0, pb: 1 }}>
                <Alert severity="info">
                  Messaging sync is currently offline. You can still view cached conversations.
                </Alert>
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
                  borderRadius: '3px',
                },
                px: !isSidebarLoading && (filteredGroups.galleries.length || filteredGroups.shippers.length) ? 0 : 3,
              }}
            >
              {isSidebarLoading ? (
                <Box sx={{ pt: 1, pb: 3, px: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Box key={`thread-skeleton-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Skeleton variant="circular" width={44} height={44} />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton
                          height={14}
                          sx={{ mb: 0.5, width: index % 2 === 0 ? '70%' : '60%' }}
                        />
                        <Skeleton height={12} sx={{ width: index % 2 === 0 ? '55%' : '65%' }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              ) : filteredGroups.galleries.length === 0 && filteredGroups.shippers.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center', color: '#58517E' }}>
                  <Typography variant="body2">No conversations yet.</Typography>
                </Box>
              ) : (
                <>
                  {renderThreadGroup(
                    'Gallery Conversations',
                    filteredGroups.galleries,
                    'No gallery conversations'
                  )}
                  {renderThreadGroup(
                    'Partner Conversations',
                    filteredGroups.shippers,
                    'No shipper conversations'
                  )}
                </>
              )}
            </Box>
          </Box>

          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: '#ffffff',
              borderRadius: '0 12px 0 0',
            }}
          >
            {activeThread && activePresentation ? (
              <>
                <Box
                  sx={{
                    p: '20px 24px',
                    borderBottom: '1px solid #e9eaeb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar
                      sx={{
                        bgcolor: activePresentation.partnerColor,
                        width: 44,
                        height: 44,
                        fontSize: '14px',
                        fontWeight: 'bold',
                      }}
                    >
                      {activePresentation.avatarText}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ color: '#170849', fontWeight: 600, fontSize: '16px' }}>
                        {activePresentation.partnerName}
                      </Typography>
                      {activePresentation.subtitle && (
                        <Typography variant="body2" sx={{ color: '#58517E', fontSize: '13px' }}>
                          {activePresentation.subtitle}
                        </Typography>
                      )}
                      {activePresentation.route && (
                        <Typography variant="caption" sx={{ color: '#8B87A2', fontSize: '12px' }}>
                          {activePresentation.route}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton sx={{ color: '#58517E' }}>
                      <StarBorderIcon />
                    </IconButton>
                    <IconButton sx={{ color: '#58517E' }}>
                      <PhoneIcon />
                    </IconButton>
                    <IconButton sx={{ color: '#58517E' }}>
                      <VideoIcon />
                    </IconButton>
                  </Box>
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    overflowY: 'auto',
                    p: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': { background: '#e9eaeb', borderRadius: '3px' },
                  }}
                >
                  {decoratedMessages.map((message) => {
                    const isUser = message.isSelf;
                    return (
                      <Box
                        key={message.base.sid}
                        sx={{
                          display: 'flex',
                          justifyContent: isUser ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <Paper
                          elevation={0}
                          sx={{
                            bgcolor: isUser ? '#8412ff' : '#f8f5ff',
                            color: isUser ? 'white' : '#170849',
                            px: 2,
                            py: 1.5,
                            maxWidth: '60%',
                            borderRadius: '16px',
                            borderBottomRightRadius: isUser ? '4px' : '16px',
                            borderBottomLeftRadius: isUser ? '16px' : '4px',
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              fontWeight: 600,
                              opacity: 0.8,
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
                              wordBreak: 'break-word',
                            }}
                          >
                            {message.base.body || '(no content)'}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              mt: 0.5,
                              opacity: isUser ? 0.85 : 0.6,
                              fontSize: '10px',
                              textAlign: isUser ? 'right' : 'left',
                            }}
                          >
                            {formatTime(message.base.timestamp)}
                          </Typography>
                        </Paper>
                      </Box>
                    );
                  })}

                  {decoratedMessages.length === 0 && (
                    <Box sx={{ textAlign: 'center', mt: 6 }}>
                      <Typography variant="body2" sx={{ color: '#8B87A2' }}>
                        No messages yet. Start the conversation below.
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Box
                  sx={{
                    p: '16px 24px 20px',
                    borderTop: '1px solid #e9eaeb',
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
                              size="small"
                              sx={{
                                color: '#8412ff',
                                padding: '6px',
                                '&:hover': { bgcolor: 'rgba(132, 18, 255, 0.08)' },
                              }}
                            >
                              <AttachIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              onClick={handleSendMessage}
                              disabled={!newMessage.trim()}
                              size="small"
                              sx={{
                                padding: '6px',
                                bgcolor: newMessage.trim() ? '#8412ff' : 'transparent',
                                color: newMessage.trim() ? 'white' : '#ccc',
                                '&:hover': {
                                  bgcolor: newMessage.trim() ? '#730add' : 'rgba(132, 18, 255, 0.08)',
                                },
                                '&:disabled': {
                                  bgcolor: 'transparent',
                                  color: '#ddd',
                                },
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
                        '& fieldset': { border: '1px solid #e9eaeb' },
                      },
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        paddingRight: '8px',
                        '&:hover fieldset': { borderColor: '#8412ff' },
                        '&.Mui-focused fieldset': { borderColor: '#8412ff' },
                      },
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
                  gap: 2,
                  color: '#58517E',
                  textAlign: 'center',
                  px: 4,
                }}
              >
                {isThreadInitializing ? (
                  <>
                    <CircularProgress sx={{ color: '#8412ff' }} />
                    <Typography variant="h6">Preparing your conversations…</Typography>
                    <Typography variant="body2" sx={{ maxWidth: 320 }}>
                      We’re syncing your latest messages so they’re ready the moment you open a thread.
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="h6">Select a conversation</Typography>
                    <Typography variant="body2">
                      Choose a conversation from the sidebar to start messaging.
                    </Typography>
                  </>
                )}
              </Box>
            )}
          </Box>
        </div>
      </motion.div>
    </div>
  );
};

export default Messages;
