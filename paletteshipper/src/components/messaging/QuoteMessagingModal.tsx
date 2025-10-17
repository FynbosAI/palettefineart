import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  TextField,
  Typography,
  Alert,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import SendIcon from '@mui/icons-material/Send';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EventIcon from '@mui/icons-material/Event';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import useMessagingUiStore from '../../store/messagingUiStore';
import useChatStore, { type ChatMessage } from '../../store/chatStore';
import useShipperStore from '../../store/useShipperStore';

const SHIPPER_TEAL = '#00aaab';
const SHIPPER_TEAL_DARK = '#008a8b';
const TEAL_SOFT = 'rgba(0, 170, 171, 0.16)';
const NAVY_TEXT = '#0f2233';
const SLATE_TEXT = '#58517E';

const formatRelativeTime = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const buildInitials = (name?: string | null) => {
  if (!name) return '';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
};

const QuoteMessagingModal: React.FC = () => {
  const modalOpen = useMessagingUiStore((state) => state.modalOpen);
  const launching = useMessagingUiStore((state) => state.launching);
  const context = useMessagingUiStore((state) => state.context);
  const threadId = useMessagingUiStore((state) => state.threadId);
  const error = useMessagingUiStore((state) => state.error);
  const closeModal = useMessagingUiStore((state) => state.closeModal);
  const clearError = useMessagingUiStore((state) => state.clearError);
  const bulkRecipients = useMessagingUiStore((state) => state.bulkRecipients);
  const bulkThreadErrors = useMessagingUiStore((state) => state.bulkThreadErrors);
  const bulkThreads = useMessagingUiStore((state) => state.bulkThreads);
  const activeBulkRecipientId = useMessagingUiStore((state) => state.activeBulkRecipientId);
  const setActiveBulkRecipient = useMessagingUiStore((state) => state.setActiveBulkRecipient);
  const bulkSending = useMessagingUiStore((state) => state.bulkSending);
  const sendBulkMessage = useMessagingUiStore((state) => state.sendBulkMessage);

  const [draftMessage, setDraftMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useChatStore((state) => state.messages);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const chatLoading = useChatStore((state) => state.loading);

  const currentUser = useShipperStore((state) => state.user);
  const conversationMessages: ChatMessage[] = useMemo(() => {
    if (!threadId) return [];
    return messages[threadId] ?? [];
  }, [messages, threadId]);

  const isBulkMode = (bulkRecipients?.length ?? 0) > 0;
  const isBroadcastView = isBulkMode && !activeBulkRecipientId;
  const bulkErrorSet = useMemo(() => new Set(Object.keys(bulkThreadErrors || {})), [bulkThreadErrors]);

  useEffect(() => {
    if (modalOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages, modalOpen]);

  useEffect(() => {
    if (!modalOpen) {
      if (draftMessage) {
        setDraftMessage('');
      }
      if (error) {
        clearError();
      }
    }
  }, [modalOpen, draftMessage, error, clearError]);

  const handleClose = () => {
    closeModal();
  };

  const handleSend = async () => {
    const body = draftMessage.trim();
    if (!body) return;

    try {
      if (isBulkMode) {
        await sendBulkMessage(body);
      } else {
        if (!threadId) return;
        await sendMessage(threadId, body);
      }
      setDraftMessage('');
    } catch (sendError) {
      console.error('[QuoteMessagingModal] Failed to send message', sendError);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const hasThread = Boolean(threadId);
  const hasMessages = conversationMessages.length > 0;
  const isLoadingConversation = isBulkMode
    ? launching || chatLoading
    : launching || chatLoading || !hasThread;

  const branchName = context?.galleryBranchName ?? context?.galleryName ?? 'Gallery team';
  const companyName = context?.galleryCompanyName ?? context?.galleryName ?? null;
  const galleryInitials = buildInitials(branchName);

  const summaryItems = useMemo(() => {
    const items: Array<{ key: string; icon: React.ReactNode; label: string; bg: string; color: string; iconColor: string }> = [];
    if (context?.routeLabel) {
      items.push({
        key: 'route',
        icon: <LocationOnIcon sx={{ fontSize: 18 }} />,
        label: context.routeLabel,
        bg: 'rgba(0, 170, 171, 0.12)',
        color: NAVY_TEXT,
        iconColor: SHIPPER_TEAL_DARK,
      });
    }
    if (context?.targetDateLabel) {
      items.push({
        key: 'date',
        icon: <EventIcon sx={{ fontSize: 18 }} />,
        label: context.targetDateLabel,
        bg: 'rgba(0, 170, 171, 0.08)',
        color: NAVY_TEXT,
        iconColor: SHIPPER_TEAL_DARK,
      });
    }
    if (context?.quoteValueLabel) {
      items.push({
        key: 'value',
        icon: <AttachMoneyIcon sx={{ fontSize: 18 }} />,
        label: context.quoteValueLabel,
        bg: 'rgba(15, 34, 51, 0.08)',
        color: NAVY_TEXT,
        iconColor: NAVY_TEXT,
      });
    }
    return items;
  }, [context?.routeLabel, context?.targetDateLabel, context?.quoteValueLabel]);

  const lastMessageLabel = useMemo(() => {
    if (!hasMessages) {
      return 'No messages yet';
    }
    const last = conversationMessages[conversationMessages.length - 1];
    return `Last update ${formatRelativeTime(last.timestamp)}`;
  }, [conversationMessages, hasMessages]);

  return (
    <Dialog
      open={modalOpen}
      onClose={handleClose}
      PaperProps={{
        sx: {
          position: 'fixed',
          bottom: 24,
          right: 24,
          top: 'auto',
          left: 'auto',
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          height: 600,
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
          onClick: (event: React.MouseEvent<HTMLDivElement>) => {
            if ((event.target as HTMLElement).classList.contains('MuiBackdrop-root')) {
              handleClose();
            }
          },
        },
      }}
    >
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 2,
          background: 'linear-gradient(135deg, #008a8b 0%, #00b7b8 55%, #2dd3d5 100%)',
          color: '#e6ffff',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              bgcolor: 'rgba(255,255,255,0.2)',
              width: 44,
              height: 44,
              fontWeight: 700,
              border: '2px solid rgba(255,255,255,0.3)'
            }}
          >
            {galleryInitials || <MessageOutlinedIcon />}
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>
              {branchName}
            </Typography>
            {companyName && companyName !== branchName && (
              <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                {companyName}
              </Typography>
            )}
            {context?.quoteTitle && (
              <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', mt: 0.25 }}>
                {context.quoteTitle}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            onClick={handleClose}
            sx={{
              color: '#ffffff',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
            }}
            aria-label="Minimize"
          >
            <MinimizeIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={handleClose}
            sx={{
              color: '#ffffff',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
            }}
            aria-label="Close"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid rgba(0, 42, 51, 0.08)',
          backgroundColor: '#f3fbfb',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {summaryItems.map((item) => (
            <Chip
              key={`summary-${item.key}`}
              icon={item.icon}
              label={item.label}
              sx={{
                backgroundColor: item.bg,
                color: item.color,
                borderRadius: '12px',
                fontWeight: 600,
                '& .MuiChip-icon': { color: item.iconColor },
              }}
            />
          ))}

          {context?.galleryName && (
            <Chip
              key="summary-gallery"
              icon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
              label={context.galleryName}
              sx={{
                backgroundColor: 'rgba(15, 34, 51, 0.08)',
                color: NAVY_TEXT,
                borderRadius: '12px',
                fontWeight: 600,
                '& .MuiChip-icon': { color: NAVY_TEXT },
              }}
            />
          )}

          {summaryItems.length === 0 && !context?.galleryName && (
            <Typography sx={{ fontSize: 12, color: SLATE_TEXT, fontWeight: 500 }}>
              Conversation linked to quote details. No additional metadata available.
            </Typography>
          )}
        </Box>
      </Box>

      {isBulkMode && (
        <Box
          sx={{
            px: 3,
            py: 1.75,
            borderBottom: '1px solid rgba(0, 42, 51, 0.08)',
            backgroundColor: '#ffffff',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <PeopleAltOutlinedIcon sx={{ fontSize: 20, color: SHIPPER_TEAL_DARK }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: NAVY_TEXT }}>
              Broadcasting to {bulkRecipients.length} branch{bulkRecipients.length === 1 ? '' : 'es'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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
                px: 1.75,
                py: 0.5,
                ...(isBroadcastView
                  ? {
                      bgcolor: SHIPPER_TEAL,
                      color: '#ffffff',
                      '&:hover': { bgcolor: SHIPPER_TEAL_DARK },
                    }
                  : {
                      borderColor: 'rgba(0, 170, 171, 0.35)',
                      color: SHIPPER_TEAL_DARK,
                      '&:hover': { borderColor: SHIPPER_TEAL, color: SHIPPER_TEAL_DARK, backgroundColor: TEAL_SOFT },
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
                    px: 1.75,
                    py: 0.5,
                    ...(isActive
                      ? {
                          bgcolor: SHIPPER_TEAL,
                          color: '#ffffff',
                          '&:hover': { bgcolor: SHIPPER_TEAL_DARK },
                        }
                      : {
                          borderColor: hasError ? '#D94E45' : 'rgba(0, 170, 171, 0.35)',
                          color: hasError ? '#D94E45' : SHIPPER_TEAL_DARK,
                          '&:hover': { borderColor: hasError ? '#D94E45' : SHIPPER_TEAL, color: hasError ? '#c7433c' : SHIPPER_TEAL_DARK, backgroundColor: TEAL_SOFT },
                        }),
                    '&.Mui-disabled': {
                      borderColor: 'rgba(0, 0, 0, 0.08)',
                      color: 'rgba(99, 102, 106, 0.6)',
                      cursor: 'not-allowed',
                    },
                  }}
                >
                  {recipient.label}
                  {hasError && <WarningAmberOutlinedIcon sx={{ fontSize: 16, ml: 0.5 }} />}
                </Button>
              );
            })}
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: SLATE_TEXT }}>
            Messages sent in broadcast view reach every branch. Select a branch above to audit a specific thread.
          </Typography>
          {bulkErrorSet.size > 0 && (
            <Typography variant="caption" sx={{ color: '#D94E45', display: 'block', mt: 0.75 }}>
              Some branches did not connect. Select them again or refresh before retrying.
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
              {error}
            </Alert>
          )}

          {isLoadingConversation ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress sx={{ color: SHIPPER_TEAL_DARK }} />
            </Box>
          ) : isBulkMode && !threadId ? (
            <Box sx={{ textAlign: 'center', color: SLATE_TEXT, mt: 4 }}>
              <MessageOutlinedIcon sx={{ fontSize: 40, opacity: 0.35, mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: NAVY_TEXT }}>
                Broadcasting to all invited branches.
              </Typography>
              <Typography variant="body2">
                Send your update now, or choose a branch above to inspect its thread.
              </Typography>
            </Box>
          ) : conversationMessages.length === 0 ? (
            <Box sx={{ textAlign: 'center', color: 'rgba(15, 34, 51, 0.6)', mt: 6 }}>
              <MessageOutlinedIcon sx={{ fontSize: 40, opacity: 0.35, mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: NAVY_TEXT }}>
                No messages yet
              </Typography>
              <Typography variant="body2">
                Start the conversation with the gallery team.
              </Typography>
            </Box>
          ) : (
            conversationMessages.map((message) => {
              const isSelf = Boolean(currentUser?.id && message.authorUserId === currentUser.id);
              return (
                <Box
                  key={message.sid}
                  sx={{
                    display: 'flex',
                    justifyContent: isSelf ? 'flex-end' : 'flex-start',
                    mb: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      maxWidth: '75%',
                      bgcolor: isSelf ? SHIPPER_TEAL : 'rgba(0, 170, 171, 0.08)',
                      color: isSelf ? '#ffffff' : NAVY_TEXT,
                      px: 2,
                      py: 1,
                      borderRadius: isSelf ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
                      border: isSelf ? 'none' : '1px solid rgba(0, 170, 171, 0.14)',
                      boxShadow: isSelf
                        ? '0 14px 30px rgba(0, 136, 138, 0.28)'
                        : '0 10px 22px rgba(12, 58, 63, 0.08)',
                    }}
                  >
                    <Typography sx={{ fontSize: 14, lineHeight: 1.45 }}>
                      {message.body || ''}
                    </Typography>
                    <Typography sx={{ fontSize: 11, opacity: 0.65, mt: 0.5 }}>
                      {formatRelativeTime(message.timestamp)}
                    </Typography>
                  </Box>
                </Box>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </Box>
        <Divider sx={{ borderColor: 'rgba(0, 42, 51, 0.08)' }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 2 }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder={
              isBulkMode ? 'Send a message to all selected branches' : 'Type a message'
            }
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isBulkMode ? bulkSending : isLoadingConversation}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '14px',
                backgroundColor: '#f2fbfb',
                fontSize: 14,
                padding: '8px 12px',
                '& fieldset': {
                  borderColor: 'rgba(0, 170, 171, 0.32)',
                },
                '&:hover fieldset': {
                  borderColor: SHIPPER_TEAL,
                },
                '&.Mui-focused fieldset': {
                  borderColor: SHIPPER_TEAL,
                  borderWidth: 1.5,
                },
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={(isBulkMode ? bulkSending : isLoadingConversation) || !draftMessage.trim()}
            sx={{
              minWidth: 52,
              height: 52,
              borderRadius: '16px',
              backgroundColor: SHIPPER_TEAL,
              color: '#ffffff',
              boxShadow: '0 12px 22px rgba(0, 136, 138, 0.32)',
              '&:hover': { backgroundColor: SHIPPER_TEAL_DARK },
              '&.Mui-disabled': {
                backgroundColor: 'rgba(0, 170, 171, 0.22)',
                color: '#ffffff',
                boxShadow: 'none',
              },
            }}
          >
            {isBulkMode && bulkSending ? (
              <CircularProgress size={22} sx={{ color: '#ffffff' }} />
            ) : (
              <SendIcon fontSize="small" />
            )}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default QuoteMessagingModal;
