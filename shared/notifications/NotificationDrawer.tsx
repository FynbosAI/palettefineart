import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CloseIcon from '@mui/icons-material/Close';
import { AnimatePresence, motion } from 'motion/react';
import type {
  BranchNotificationType,
  BranchNotificationWithStatus,
} from './types';
import { formatRelativeTime } from './time';

const typeLabels: Partial<Record<BranchNotificationType, string>> = {
  bid_invited: 'Estimate Invitation',
  bid_submitted: 'Estimate Submitted',
  bid_accepted: 'Estimate Accepted',
  bid_rejected: 'Estimate Rejected',
  bid_withdrawn: 'Estimate Withdrawn',
  bid_needs_confirmation: 'Estimate Needs Confirmation',
  quote_withdrawn: 'Estimate Withdrawn',
  shipment_status: 'Shipment Update',
  shipment_completed: 'Shipment Completed',
  tracking_event: 'Tracking Event',
  message: 'Message',
  document_uploaded: 'Document Uploaded',
  system: 'System Alert',
};

const iconForType = (type: BranchNotificationType, accentOverride?: string) => {
  const iconColor = accentOverride ?? undefined;
  switch (type) {
    case 'bid_invited':
    case 'bid_submitted':
    case 'bid_accepted':
    case 'bid_rejected':
    case 'bid_withdrawn':
    case 'bid_needs_confirmation':
    case 'quote_withdrawn':
      return <GavelOutlinedIcon fontSize="small" sx={{ color: iconColor ?? '#8412FF' }} />;
    case 'shipment_status':
    case 'shipment_completed':
    case 'tracking_event':
      return <LocalShippingOutlinedIcon fontSize="small" sx={{ color: iconColor ?? '#2378DA' }} />;
    case 'message':
      return <ChatBubbleOutlineIcon fontSize="small" sx={{ color: iconColor ?? '#00AAAB' }} />;
    case 'document_uploaded':
    case 'system':
      return <InfoOutlinedIcon fontSize="small" sx={{ color: iconColor ?? '#B523DA' }} />;
    default:
      return <NotificationsNoneIcon fontSize="small" sx={{ color: iconColor ?? '#58517E' }} />;
  }
};

export interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: BranchNotificationWithStatus[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
  onSelectNotification: (notification: BranchNotificationWithStatus) => void;
  error?: string | null;
  accentColor?: string;
}

const NotificationDrawer = ({
  open,
  onClose,
  notifications,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onMarkAllRead,
  onSelectNotification,
  error = null,
  accentColor,
}: NotificationDrawerProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const accent = accentColor ?? '#8412FF';
  const accentAlpha = (opacity: number) => alpha(accent, opacity);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  const hasUnread = useMemo(
    () => notifications.some((notification) => notification.isUnread),
    [notifications]
  );

  const content = (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="notifications-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(23, 8, 73, 0.18)',
              zIndex: 70,
            }}
            aria-hidden="true"
          />
          <motion.section
            key="notifications-panel"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', duration: 0.32, bounce: 0.2 }}
            style={{
              position: 'fixed',
              top: 'calc(var(--beta-banner-height, 48px) + 24px)',
              right: '24px',
              width: 'min(360px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 96px)',
              borderRadius: '12px',
              border: '1px solid rgba(23, 8, 73, 0.08)',
              background: 'var(--color-paper, #FCFCFD)',
              boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)',
              zIndex: 80,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-drawer-title"
          >
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                padding: '12px 16px 8px',
                background: 'var(--color-paper, #FCFCFD)',
                borderBottom: '1px solid rgba(23, 8, 73, 0.08)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1.5,
                borderTopLeftRadius: 'inherit',
                borderTopRightRadius: 'inherit',
              }}
            >
              <Box>
                <Typography
                  id="notification-drawer-title"
                  variant="subtitle1"
                  sx={{ fontWeight: 600, color: 'var(--color-text, #170849)' }}
                >
                  Notifications
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'var(--color-text-muted, #58517E)', marginTop: '2px', lineHeight: 1.4 }}
                >
                  Stay on top of estimates, shipments, and messages across your branches.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onMarkAllRead}
                  disabled={!hasUnread}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: '12px',
                  paddingX: 1.75,
                  paddingY: 0.5,
                  color: accent,
                  borderColor: accentAlpha(0.32),
                  backgroundColor: accentAlpha(0.08),
                  '&:hover': {
                    backgroundColor: accentAlpha(0.16),
                    borderColor: accentAlpha(0.5),
                  },
                  '&.Mui-disabled': {
                    color: accentAlpha(0.5),
                    borderColor: accentAlpha(0.14),
                    backgroundColor: accentAlpha(0.06),
                  },
                }}
              >
                  Mark all read
                </Button>
                <IconButton
                  aria-label="Close notifications"
                  size="small"
                  onClick={onClose}
                  sx={{
                    color: 'var(--color-text-muted, #58517E)',
                    background: 'rgba(23, 8, 73, 0.03)',
                    '&:hover': { background: 'rgba(23, 8, 73, 0.08)' },
                    borderRadius: '50%',
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            <Box
              sx={{
                maxHeight: 'clamp(260px, calc(100vh - 220px), 420px)',
                overflowY: 'auto',
                paddingBottom: 1,
                background: 'var(--color-paper, #FCFCFD)',
                borderBottomLeftRadius: 'inherit',
                borderBottomRightRadius: 'inherit',
              }}
            >
              {loading ? (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  spacing={2}
                  sx={{ padding: 4, color: 'var(--color-text-muted)' }}
                >
                  <CircularProgress size={28} />
                  <Typography variant="body2">Loading notifications…</Typography>
                </Stack>
              ) : error ? (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  spacing={1.5}
                  sx={{ padding: 4, color: '#D14343', textAlign: 'center' }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Unable to load notifications
                  </Typography>
                  <Typography variant="body2">Please try again in a moment.</Typography>
                </Stack>
              ) : notifications.length === 0 ? (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  spacing={1.25}
                  sx={{ padding: 4, color: 'var(--color-text-muted)' }}
                >
                  <NotificationsNoneIcon sx={{ fontSize: 36, opacity: 0.35 }} />
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'var(--color-text)' }}>
                    You're all caught up
                  </Typography>
                  <Typography variant="body2" sx={{ textAlign: 'center' }}>
                    We'll notify you here when something needs your attention.
                  </Typography>
                </Stack>
              ) : (
                <List disablePadding>
                  {notifications.map((notification) => {
                    const icon = iconForType(notification.type, accent);
                    const label =
                      typeLabels[notification.type] ??
                      notification.type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
                    const relativeTime = formatRelativeTime(notification.createdAt);

                    return (
                      <motion.div
                        key={notification.id}
                        whileHover={{ x: 4 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                        style={{ display: 'block' }}
                      >
                        <ListItemButton
                          alignItems="flex-start"
                          onClick={() => onSelectNotification(notification)}
                          sx={{
                            gap: 1,
                            padding: '12px 16px',
                            minHeight: 68,
                            borderBottom: '1px solid rgba(23, 8, 73, 0.08)',
                            borderRadius: 0,
                            backgroundColor: notification.isUnread ? accentAlpha(0.08) : '#FFFFFF',
                            transition: 'background-color 0.2s ease',
                            '&:hover': {
                              backgroundColor: notification.isUnread
                                ? accentAlpha(0.16)
                                : 'rgba(23, 8, 73, 0.06)',
                            },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 30, marginTop: '2px', color: accent }}>
                            {icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: notification.isUnread ? 700 : 600,
                                    color: 'var(--color-text, #170849)',
                                  }}
                                >
                                  {notification.title}
                                </Typography>
                                <Chip
                                  label={label}
                                  size="small"
                                  sx={{
                                    backgroundColor: accentAlpha(0.12),
                                    color: accent,
                                    fontWeight: 600,
                                    height: 20,
                                    fontSize: '0.7rem',
                                  }}
                                />
                                <Typography variant="caption" sx={{ color: 'var(--color-text-muted, #58517E)' }}>
                                  {relativeTime}
                                </Typography>
                                {notification.isUnread ? (
                                  <FiberManualRecordIcon sx={{ fontSize: 10, color: accent }} />
                                ) : null}
                              </Stack>
                            }
                            secondary={
                              notification.body ? (
                                <Typography variant="body2" sx={{ color: 'var(--color-text-muted, #58517E)', marginTop: 0.25, lineHeight: 1.5 }}>
                                  {notification.body}
                                </Typography>
                              ) : null
                            }
                          />
                        </ListItemButton>
                      </motion.div>
                    );
                  })}
                  {loadingMore ? (
                    <Stack
                      alignItems="center"
                      justifyContent="center"
                      sx={{ paddingY: 1.5, color: 'var(--color-text-muted)' }}
                      spacing={0.75}
                    >
                      <CircularProgress size={22} />
                      <Typography variant="caption">Fetching additional notifications…</Typography>
                    </Stack>
                  ) : null}
                  {hasMore && !loadingMore ? (
                    <Box sx={{ padding: 2 }}>
                      <Button
                        variant="outlined"
                        fullWidth
                        onClick={onLoadMore}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          borderRadius: '999px',
                          borderColor: accentAlpha(0.5),
                          color: accent,
                          '&:hover': {
                            borderColor: accent,
                            backgroundColor: accentAlpha(0.08),
                          },
                        }}
                      >
                        Load more
                      </Button>
                    </Box>
                  ) : null}
                </List>
              )}
            </Box>
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );

  if (!isMounted) return null;
  return createPortal(content, document.body);
};

export default NotificationDrawer;
