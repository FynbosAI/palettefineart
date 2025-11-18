import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  TextField,
  Typography,
  Box,
  Chip,
  Avatar,
  IconButton,
  Paper,
  InputAdornment,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Send as SendIcon,
  AttachFile as AttachIcon,
  LocationOn as LocationIcon,
  Schedule as ScheduleIcon,
  MonetizationOn as MoneyIcon,
  Minimize as MinimizeIcon,
  Circle as CircleIcon,
  PeopleAltOutlined as PeopleIcon,
  WarningAmberOutlined as WarningIcon,
} from '@mui/icons-material';
import { formatTargetDateRange } from '../lib/utils/dateUtils';
import logger from '../lib/utils/logger';
import useChatStore, { type ChatMessage } from '../store/chatStore';
import useSupabaseStore from '../store/useSupabaseStore';
import useMessagingUiStore from '../store/messagingUiStore';
import { useNavigate } from 'react-router-dom';
import useCurrency from '../hooks/useCurrency';
import { resolveOrganizationLogo } from '../lib/organizationLogos';

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

const formatMessageTime = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const parseIdentity = (identity: string | null | undefined) => {
  if (!identity || typeof identity !== 'string') {
    return { userId: null as string | null };
  }
  const [, ...rest] = identity.split(':');
  if (rest.length === 0) {
    return { userId: null as string | null };
  }
  return { userId: rest.join(':') };
};

const buildInitials = (value: string | null | undefined) => {
  if (!value) {
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

  urls.forEach((url) => {
    const normalized = normalizeUrl(url);
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
  const remote = remoteCandidates.map(normalizeUrl).find(Boolean) ?? null;
  const { primaryUrl, localUrl, remoteUrl } = resolveOrganizationLogo(names, remote);
  const [primary = null, fallback = null] = collectUniqueUrls(primaryUrl, localUrl, remoteUrl, ...remoteCandidates);
  return { primary, fallback };
};

const MessagingModal: React.FC = () => {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const modalOpen = useMessagingUiStore((state) => state.modalOpen);
  const launching = useMessagingUiStore((state) => state.launching);
  const context = useMessagingUiStore((state) => state.context);
  const threadId = useMessagingUiStore((state) => state.threadId);
  const modalError = useMessagingUiStore((state) => state.error);
  const closeModal = useMessagingUiStore((state) => state.closeModal);
  const clearModalError = useMessagingUiStore((state) => state.clearError);
  const bulkRecipients = useMessagingUiStore((state) => state.bulkRecipients);
  const bulkThreadErrors = useMessagingUiStore((state) => state.bulkThreadErrors);
  const bulkThreads = useMessagingUiStore((state) => state.bulkThreads);
  const activeBulkRecipientId = useMessagingUiStore((state) => state.activeBulkRecipientId);
  const setActiveBulkRecipient = useMessagingUiStore((state) => state.setActiveBulkRecipient);
  const bulkSending = useMessagingUiStore((state) => state.bulkSending);
  const sendBulkMessage = useMessagingUiStore((state) => state.sendBulkMessage);

  const selectThread = useChatStore((state) => state.selectThread);
  const sendChatMessage = useChatStore((state) => state.sendMessage);
  const messageMap = useChatStore((state) => state.messages);
  const threads = useChatStore((state) => state.threads);
  const chatLoading = useChatStore((state) => state.loading);
  const chatError = useChatStore((state) => state.error);
  const clearChatError = useChatStore((state) => state.clearError);
  const { formatCurrency } = useCurrency();

  const navigate = useNavigate();
  const currentUserId = useSupabaseStore((state) => state.user?.id ?? null);
  const selfProfileImageUrl = useSupabaseStore((state) => state.profileImageUrl ?? null);

  const participantList = useMemo(
    () =>
      (context?.participants || []).map((participant) => {
        const fallbackAbbreviation = participant.name
          .split(' ')
          .slice(0, 2)
          .map((word) => word.charAt(0))
          .join('')
          .toUpperCase();

        return {
          ...participant,
          abbreviation: participant.abbreviation || fallbackAbbreviation,
          brandColor: participant.brandColor || '#00aaab',
        };
      }),
    [context?.participants]
  );

  const highlightedSet = useMemo(
    () => new Set((context?.highlightParticipantIds || []).filter(Boolean)),
    [context?.highlightParticipantIds]
  );

  useEffect(() => {
    if (!modalOpen) {
      setMessage('');
      clearChatError();
      clearModalError();
      return;
    }

    if (context?.quoteId) {
      logger.debug('MessagingModal', 'Modal opened', { quoteId: context.quoteId });
    } else {
      logger.debug('MessagingModal', 'Modal opened');
    }
  }, [modalOpen, clearChatError, clearModalError, context?.quoteId]);

  const conversationMessages: ChatMessage[] = useMemo(
    () => (threadId ? messageMap[threadId] || [] : []),
    [messageMap, threadId]
  );
  const isBulkMode = (bulkRecipients?.length ?? 0) > 0;
  const isBroadcastView = isBulkMode && !activeBulkRecipientId;
  const bulkErrorSet = useMemo(() => new Set(Object.keys(bulkThreadErrors || {})), [bulkThreadErrors]);
  const hasBroadcastTargets = (bulkRecipients?.length ?? 0) > 0;
  const combinedError = modalError || chatError;
  const trimmedMessage = message.trim();
  const sendDisabled = Boolean(combinedError)
    ? true
    : isBulkMode
      ? bulkSending || !hasBroadcastTargets || !trimmedMessage
      : bulkSending || !threadId || !trimmedMessage;

  useEffect(() => {
    if (modalOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages, modalOpen]);

  const handleSendMessage = async () => {
    const body = message.trim();
    if (!body) return;

    try {
      if (isBulkMode) {
        await sendBulkMessage(body);
      } else {
        if (!threadId) return;
        await sendChatMessage(threadId, body);
      }
      setMessage('');
    } catch (error) {
      logger.error('MessagingModal', 'Failed to send message', error);
    }
  };

  const handleOpenMessagesPage = async () => {
    if (!threadId) return;

    try {
      await selectThread(threadId);
      closeModal();
      navigate(`/messages?threadId=${threadId}`);
    } catch (error) {
      logger.error('MessagingModal', 'Failed to open Messages page', error);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const formatLastMessage = () => {
    if (!conversationMessages.length) return 'No messages yet';
    const last = conversationMessages[conversationMessages.length - 1];
    return formatRelativeTime(last.timestamp);
  };

  const isLoadingConversation = isBulkMode
    ? launching || chatLoading
    : launching || chatLoading || !threadId;

  const activeThreadRecord = threadId ? threads.find((thread) => thread.id === threadId) : null;
  const threadMetadata = (activeThreadRecord?.metadata ?? {}) as Record<string, any>;
  const threadLogoNames = [
    context?.bidderName ?? null,
    typeof threadMetadata.partnerCompany === 'string' ? threadMetadata.partnerCompany : null,
    typeof threadMetadata.shipperCompany === 'string' ? threadMetadata.shipperCompany : null,
  ];
  const threadLogoCandidates = [
    threadMetadata.shipperLogoUrl as string | undefined,
    threadMetadata.partnerLogoUrl as string | undefined,
  ];
  const { primary: threadLogoUrl, fallback: threadLogoFallbackUrl } = deriveLogoUrls(
    threadLogoNames,
    threadLogoCandidates
  );

  if (!modalOpen || !context) {
    return null;
  }

  const {
    bidderName,
    bidderAbbreviation,
    bidderColor,
    bidPrice,
    quoteTitle,
    quoteRoute,
    quoteValue,
    targetDateStart,
    targetDateEnd,
  } = context;

  return (
    <Dialog
      open={modalOpen}
      onClose={closeModal}
      TransitionProps={{
        timeout: 300,
      }}
      PaperProps={{
        sx: {
          position: 'fixed',
          bottom: 24,
          right: 24,
          top: 'auto',
          left: 'auto',
          width: 420,
          height: 600,
          maxWidth: 'none',
          maxHeight: 'none',
          margin: 0,
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(10, 13, 18, 0.15), 0 0 0 1px rgba(132, 18, 255, 0.1)',
          overflow: 'hidden',
          transform: modalOpen ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 9999,
        },
      }}
      BackdropProps={{
        sx: {
          backgroundColor: 'transparent',
        },
      }}
      componentsProps={{
        backdrop: {
          onClick: (e) => {
            if ((e.target as HTMLElement).classList.contains('MuiBackdrop-root')) {
              closeModal();
            }
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e9eaeb',
          background: 'var(--color-chrome)',
          color: 'var(--color-text)',
          padding: '16px 20px',
          borderRadius: '16px 16px 0 0',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ position: 'relative' }}>
            <Avatar
              src={(threadLogoUrl ?? threadLogoFallbackUrl) ?? undefined}
              sx={{
                bgcolor: threadLogoUrl || threadLogoFallbackUrl ? '#ffffff' : (bidderColor || '#8412ff'),
                width: 40,
                height: 40,
                fontSize: '14px',
                fontWeight: 'bold',
                color: threadLogoUrl || threadLogoFallbackUrl ? '#170849' : '#ffffff',
                border: threadLogoUrl || threadLogoFallbackUrl ? '1px solid rgba(0, 0, 0, 0.08)' : '2px solid rgba(23, 8, 73, 0.15)',
                boxShadow: threadLogoUrl || threadLogoFallbackUrl ? '0 8px 18px rgba(23, 8, 73, 0.12)' : 'none',
              }}
            >
              {!threadLogoUrl && !threadLogoFallbackUrl && bidderAbbreviation}
            </Avatar>
            <Box
              sx={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                width: 10,
                height: 10,
                bgcolor: '#00aaab',
                borderRadius: '50%',
                border: '2px solid white',
              }}
            />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '16px' }}>
              {bidderName}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(23, 8, 73, 0.7)', fontSize: '13px' }}>
              {quoteTitle}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            onClick={closeModal}
            size="small"
            sx={{
              color: 'var(--color-text)',
              '&:hover': {
                bgcolor: 'rgba(23, 8, 73, 0.08)',
              },
            }}
            aria-label="Minimize"
          >
            <MinimizeIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            onClick={closeModal}
            size="small"
            sx={{
              color: 'var(--color-text)',
              '&:hover': {
                bgcolor: 'rgba(23, 8, 73, 0.08)',
              },
            }}
            aria-label="Close"
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </DialogTitle>

      <Box
        sx={{
          p: '12px 20px',
          bgcolor: '#f8f9fa',
          borderBottom: '1px solid #e9eaeb',
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LocationIcon sx={{ fontSize: 14, color: '#8412ff' }} />
            <Typography variant="caption" sx={{ color: '#170849', fontSize: '12px', fontWeight: 500 }}>
              {quoteRoute}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <MoneyIcon sx={{ fontSize: 14, color: '#8412ff' }} />
            <Typography variant="caption" sx={{ color: '#170849', fontSize: '12px', fontWeight: 500 }}>
              {formatCurrency(Number(quoteValue) || 0)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ScheduleIcon sx={{ fontSize: 14, color: '#8412ff' }} />
            <Typography variant="caption" sx={{ color: '#170849', fontSize: '12px', fontWeight: 500 }}>
              {formatTargetDateRange(targetDateStart, targetDateEnd)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
            <CircleIcon sx={{ fontSize: 10, color: '#8412ff' }} />
            <Typography variant="caption" sx={{ color: '#58517E', fontSize: '12px', fontWeight: 500 }}>
              {formatLastMessage()}
            </Typography>
          </Box>
          {bidPrice && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <Chip
                label={formatCurrency(bidPrice)}
                size="small"
                sx={{
                  bgcolor: '#00aaab',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '11px',
                  height: '20px',
                }}
              />
            </Box>
          )}
        </Box>
        {participantList.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
            {participantList.map((participant) => {
              const key = participant.id || participant.name;
              const isHighlighted = highlightedSet.has(participant.id || participant.name);
              const isShipper = (participant as any)?.role === 'shipper';
              const label = participant.hasBid ? `${participant.name} • Estimate submitted` : participant.name;
              const chipBg = isHighlighted
                ? 'rgba(0, 170, 171, 0.18)'
                : isShipper
                  ? 'rgba(0, 170, 171, 0.12)'
                  : 'rgba(132, 18, 255, 0.1)';
              const avatarBg = isHighlighted ? '#008a8b' : isShipper ? '#00aaab' : '#58517E';
              const labelColor = isHighlighted ? '#008a8b' : isShipper ? '#008a8b' : '#58517E';

              return (
                <Chip
                  key={key}
                  label={label}
                  size="small"
                  avatar={(
                    <Avatar
                      sx={{
                        bgcolor: avatarBg,
                        color: '#ffffff',
                        width: 22,
                        height: 22,
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {participant.abbreviation}
                    </Avatar>
                  )}
                  sx={{
                    bgcolor: chipBg,
                    color: labelColor,
                    fontWeight: 600,
                    fontSize: '11px',
                    borderRadius: '14px',
                  }}
                />
              );
            })}
      </Box>
    )}
  </Box>

  {isBulkMode && (
    <Box
      sx={{
        px: '20px',
        py: 1.5,
        borderBottom: '1px solid #e9eaeb',
        bgcolor: '#ffffff',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <PeopleIcon sx={{ fontSize: 18, color: '#8412ff' }} />
        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 600, color: '#170849' }}>
          Broadcasting to {bulkRecipients.length} branch{bulkRecipients.length === 1 ? '' : 'es'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        <Button
          key="broadcast-all"
          variant={isBroadcastView ? 'contained' : 'outlined'}
          size="small"
          onClick={() => {
            void setActiveBulkRecipient(null);
          }}
          sx={{
            textTransform: 'none',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: '999px',
            px: 1.5,
            py: 0.5,
            ...(isBroadcastView
              ? {
                  bgcolor: '#8412ff',
                  color: '#ffffff',
                  '&:hover': { bgcolor: '#730add' },
                }
              : {
                  borderColor: '#e1e1f0',
                  color: '#58517E',
                  '&:hover': { borderColor: '#8412ff', color: '#8412ff' },
                }),
          }}
        >
          All branches
        </Button>
        {bulkRecipients.map((recipient) => {
          const isActive = activeBulkRecipientId === recipient.id;
          const hasError = bulkErrorSet.has(recipient.id);
          const hasThread = Boolean(bulkThreads[recipient.id]);
          return (
            <Button
              key={recipient.id}
              variant={isActive ? 'contained' : 'outlined'}
              size="small"
              disabled={!hasThread}
              onClick={() => {
                void setActiveBulkRecipient(recipient.id);
              }}
              sx={{
                textTransform: 'none',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: '999px',
                px: 1.5,
                py: 0.5,
                ...(isActive
                  ? {
                      bgcolor: '#8412ff',
                      color: '#ffffff',
                      '&:hover': { bgcolor: '#730add' },
                    }
                  : {
                      borderColor: hasError ? '#D94E45' : '#e9eaeb',
                      color: hasError ? '#D94E45' : '#58517E',
                      '&:hover': { borderColor: '#8412ff', color: '#8412ff' },
                    }),
                '&.Mui-disabled': {
                  borderColor: '#e9eaeb',
                  color: '#b0afb6',
                  cursor: 'not-allowed',
                },
              }}
            >
              {recipient.label}
              {hasError && <WarningIcon sx={{ fontSize: 16, ml: 0.5 }} />}
            </Button>
          );
        })}
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: '#58517E' }}>
        Messages sent here reach every branch. Choose one above if you want to review its history.
      </Typography>
      {bulkErrorSet.size > 0 && (
        <Typography variant="caption" sx={{ color: '#D94E45', display: 'block', mt: 0.75 }}>
          Some branches did not connect. Try selecting them again or refreshing before retrying.
        </Typography>
      )}
    </Box>
  )}

  <DialogContent
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: 0,
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            bgcolor: '#ffffff',
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#e9eaeb',
              borderRadius: '3px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: '#d0d1d2',
            },
          }}
        >
          {combinedError ? (
            <Alert severity="error" sx={{ fontSize: '13px' }}>
              {combinedError}
            </Alert>
          ) : isLoadingConversation ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#58517E',
                gap: 1,
                py: 4,
              }}
            >
              <CircularProgress size={24} sx={{ color: '#8412ff' }} />
              <Typography variant="body2">Connecting to conversation…</Typography>
            </Box>
          ) : isBulkMode && !threadId ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#58517E',
                gap: 1,
                py: 4,
                textAlign: 'center',
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                Broadcasting to all invited branches
              </Typography>
              <Typography variant="body2">
                Send your update now, or pick a branch above when you need to inspect its thread.
              </Typography>
            </Box>
          ) : conversationMessages.length === 0 ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#58517E',
                gap: 1,
                py: 4,
                textAlign: 'center',
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {isBulkMode ? 'No messages in this branch yet' : 'Start the conversation'}
              </Typography>
              <Typography variant="body2">
                {isBulkMode
                  ? 'Send a broadcast message to kick things off for this branch.'
                  : `Say hello to ${bidderName} and share the estimate details.`}
              </Typography>
            </Box>
          ) : (
            conversationMessages.map((msg) => {
              const isUser = msg.authorUserId === currentUserId;

              const participantLogoNames = [
                context?.bidderName ?? null,
                typeof threadMetadata.partnerCompany === 'string' ? threadMetadata.partnerCompany : null,
              ];
              const participantLogoCandidates = [
                threadLogoUrl,
                threadLogoFallbackUrl,
                threadMetadata.shipperLogoUrl as string | undefined,
                threadMetadata.partnerLogoUrl as string | undefined,
              ];
              const { primary: participantLogo } = deriveLogoUrls(
                participantLogoNames,
                participantLogoCandidates
              );

              const avatarInitials = buildInitials(isUser ? 'You' : bidderName);
              const avatarUrl = isUser ? selfProfileImageUrl ?? participantLogo : participantLogo;

              return (
                <Box
                  key={msg.sid}
                  sx={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    mb: 1,
                    width: '100%',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      alignItems: 'flex-end',
                      gap: 1,
                      maxWidth: '85%',
                    }}
                  >
                    <Avatar
                      src={avatarUrl ?? undefined}
                      sx={{
                        width: 34,
                        height: 34,
                        bgcolor: avatarUrl
                          ? '#ffffff'
                          : isUser
                            ? '#8412ff'
                            : 'rgba(132, 18, 255, 0.12)',
                        color: avatarUrl ? '#170849' : isUser ? '#ffffff' : '#170849',
                        border: avatarUrl ? '1px solid rgba(0, 0, 0, 0.08)' : 'none',
                        fontSize: 13,
                      }}
                    >
                      {!avatarUrl && avatarInitials}
                    </Avatar>
                    <Paper
                      elevation={0}
                      sx={{
                        p: '12px 16px',
                        maxWidth: '75%',
                        bgcolor: isUser ? '#8412ff' : '#f8f9fa',
                        color: isUser ? 'white' : '#170849',
                        borderRadius: '16px',
                        borderBottomRightRadius: isUser ? '6px' : '16px',
                        borderBottomLeftRadius: isUser ? '16px' : '6px',
                        boxShadow: isUser
                          ? '0 2px 8px rgba(132, 18, 255, 0.15)'
                          : '0 2px 8px rgba(0, 0, 0, 0.05)',
                        border: isUser ? 'none' : '1px solid #f0f0f0',
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {msg.body ?? '(no content)'}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          mt: 0.5,
                          opacity: isUser ? 0.8 : 0.6,
                          fontSize: '10px',
                          fontWeight: 400,
                          textAlign: isUser ? 'right' : 'left',
                        }}
                      >
                        {formatMessageTime(msg.timestamp)}
                      </Typography>
                    </Paper>
                  </Box>
                </Box>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </Box>

        <Box
          sx={{
            p: '16px 20px 20px',
            borderTop: '1px solid #e9eaeb',
            bgcolor: '#ffffff',
            borderRadius: '0 0 16px 16px',
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              isBulkMode ? 'Send a message to all selected branches…' : 'Type a message…'
            }
            variant="outlined"
            size="small"
            disabled={
              Boolean(combinedError)
                ? true
                : isBulkMode
                  ? bulkSending || !hasBroadcastTargets
                  : bulkSending || !threadId
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.5 }}>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton
                      size="small"
                      sx={{
                        color: 'var(--color-primary)',
                        padding: '6px',
                        '&:hover': {
                          bgcolor: 'rgba(132, 18, 255, 0.08)',
                        },
                      }}
                      aria-label="Attach file"
                      disabled={
                        Boolean(combinedError)
                          ? true
                          : isBulkMode
                            ? bulkSending || !hasBroadcastTargets
                            : bulkSending || !threadId
                      }
                    >
                      <AttachIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      onClick={handleSendMessage}
                      disabled={sendDisabled}
                      size="small"
                      sx={{
                        padding: '6px',
                        bgcolor: sendDisabled ? 'transparent' : 'var(--color-primary)',
                        color: sendDisabled ? '#ccc' : 'white',
                        '&:hover': {
                          bgcolor: sendDisabled
                            ? 'rgba(132, 18, 255, 0.08)'
                            : 'var(--color-primary-dark)',
                        },
                        '&:disabled': {
                          bgcolor: 'transparent',
                          color: '#ddd',
                        },
                      }}
                      aria-label="Send message"
                    >
                      {isBulkMode && bulkSending ? (
                        <CircularProgress size={18} sx={{ color: 'var(--color-primary)' }} />
                      ) : (
                        <SendIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Box>
                </InputAdornment>
              ),
              sx: {
                borderRadius: '20px',
                bgcolor: '#f8f9fa',
                fontSize: '14px',
                '& fieldset': {
                  border: '1px solid var(--color-border)',
                },
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                paddingRight: '8px',
                '&:hover fieldset': {
                  borderColor: 'var(--color-primary)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'var(--color-primary)',
                  borderWidth: '1px',
                },
              },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
            <Button
              variant="text"
              size="small"
              onClick={handleOpenMessagesPage}
              sx={{
                fontWeight: 600,
                color: 'var(--color-primary)',
                textTransform: 'none',
              }}
              disabled={!threadId}
            >
              Open full conversation
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default MessagingModal;
