import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import type { BranchNotificationType, BranchNotificationWithStatus } from './types';
import { formatRelativeTime } from './time';
import { toTitleCase } from './utils';

export interface NotificationToastHostProps {
  pendingToastCount: number;
  consumeNextToast: () => BranchNotificationWithStatus | null;
  onSelectNotification?: (notification: BranchNotificationWithStatus) => void;
  autoHideDuration?: number;
}

const toAccentCssVar = (color: string) => `var(--notification-toast-accent, ${color})`;

const NotificationToastHost = ({
  pendingToastCount,
  consumeNextToast,
  onSelectNotification,
  autoHideDuration = 50000,
}: NotificationToastHostProps) => {
  const [current, setCurrent] = useState<BranchNotificationWithStatus | null>(null);
  const [open, setOpen] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  useEffect(() => {
    if (!current && pendingToastCount > 0) {
      const next = consumeNextToast();
      if (next) {
        setCurrent(next);
        setOpen(true);
      }
    }
  }, [pendingToastCount, consumeNextToast, current]);

  useEffect(() => {
    if (!open || !current) {
      clearDismissTimer();
      return;
    }

    dismissTimer.current = setTimeout(() => {
      setOpen(false);
    }, autoHideDuration);

    return () => {
      clearDismissTimer();
    };
  }, [open, current, autoHideDuration]);

  const visuals = useMemo(() => (current ? getNotificationVisuals(current.type) : null), [current]);

  const handleClose = () => {
    setOpen(false);
  };

  const handleExited = () => {
    setCurrent(null);
  };

  const handleView = () => {
    if (current) {
      onSelectNotification?.(current);
    }
    setOpen(false);
  };

  const label = useMemo(() => {
    if (!current) return '';
    return typeLabels[current.type] ?? toTitleCase(current.type);
  }, [current]);

  return (
    <AnimatePresence onExitComplete={handleExited}>
      {open && current && visuals ? (
        <motion.div
          key={current.id}
          initial={{ y: -96, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -96, opacity: 0, scale: 0.85 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26, duration: 0.4 }}
          style={{
            position: 'fixed',
            top: 'calc(var(--beta-banner-height, 48px) + 24px)',
            right: '24px',
            zIndex: 90,
            maxWidth: 'min(360px, calc(100vw - 32px))',
            width: '100%',
          }}
        >
          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '20px',
              border: `1px solid ${toAccentCssVar(visuals.accent)}`,
              backgroundColor: '#FFFFFF',
              boxShadow: '0 24px 48px rgba(10, 13, 18, 0.18)',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                opacity: 0.1,
                backgroundImage: `linear-gradient(135deg, ${toAccentCssVar(visuals.accent)}, ${toAccentCssVar(visuals.accent)})`,
              }}
            />
            <Box
              sx={{
                position: 'relative',
                padding: '22px 24px 22px',
              }}
            >
              <Stack direction="row" spacing={2.5} alignItems="flex-start">
                <motion.div
                  initial={{ rotate: -180, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 18 }}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 12px 30px rgba(17, 12, 58, 0.22)',
                    background: toAccentCssVar(visuals.accent),
                    flexShrink: 0,
                  }}
                >
                  {visuals.icon}
                </motion.div>

                <Stack spacing={1.25} sx={{ minWidth: 0, flex: 1 }}>
                  <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                    {label ? (
                      <Typography
                        variant="caption"
                        sx={{
                          textTransform: 'uppercase',
                          letterSpacing: 0.6,
                          fontWeight: 600,
                          color: 'var(--color-text-muted, #58517E)',
                        }}
                      >
                        {label}
                      </Typography>
                    ) : null}

                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        color: 'var(--color-text, #170849)',
                        lineHeight: 1.28,
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {current.title}
                    </Typography>
                    {current.body ? (
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'var(--color-text-muted, #58517E)',
                          lineHeight: 1.55,
                          whiteSpace: 'pre-line',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {current.body}
                      </Typography>
                    ) : null}
                  </Stack>

                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent={onSelectNotification ? 'space-between' : 'flex-start'}
                    sx={{ color: 'var(--color-text-muted, #58517E)' }}
                  >
                    <Stack direction="row" spacing={0.6} alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {formatRelativeTime(current.createdAt)}
                      </Typography>
                      {current.isUnread ? <FiberManualRecordIcon sx={{ fontSize: 10 }} /> : null}
                    </Stack>
                    {onSelectNotification ? (
                      <Button
                        size="small"
                        onClick={handleView}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          borderRadius: '999px',
                          paddingX: 1.75,
                          paddingY: 0.25,
                          minHeight: 0,
                          color: '#FFFFFF',
                          background: 'var(--color-primary, #8412FF)',
                          '&:hover': { background: 'var(--color-primary-dark, #730ADD)' },
                        }}
                      >
                        View
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>

                <IconButton
                  aria-label="Dismiss notification"
                  size="small"
                  onClick={handleClose}
                  sx={{
                    marginTop: '4px',
                    background: 'rgba(23, 8, 73, 0.06)',
                    color: 'var(--color-text-muted, #58517E)',
                    '&:hover': { background: 'rgba(23, 8, 73, 0.14)' },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>

            <motion.div
              style={{ height: 6, background: toAccentCssVar(visuals.accent), transformOrigin: 'left center' }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: autoHideDuration / 1000, ease: 'linear' }}
            />
          </Box>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default NotificationToastHost;

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

const getNotificationVisuals = (type: BranchNotificationType) => {
  switch (type) {
    case 'bid_invited':
    case 'bid_submitted':
    case 'bid_accepted':
    case 'bid_rejected':
    case 'bid_withdrawn':
    case 'bid_needs_confirmation':
    case 'quote_withdrawn':
      return {
        accent: '#8412FF',
        icon: <GavelOutlinedIcon sx={{ fontSize: 28, color: '#FFFFFF' }} />,
      };
    case 'shipment_status':
    case 'shipment_completed':
    case 'tracking_event':
      return {
        accent: '#2378DA',
        icon: <LocalShippingOutlinedIcon sx={{ fontSize: 28, color: '#FFFFFF' }} />,
      };
    case 'message':
      return {
        accent: '#00AAAB',
        icon: <ChatBubbleOutlineIcon sx={{ fontSize: 28, color: '#FFFFFF' }} />,
      };
    case 'document_uploaded':
    case 'system':
      return {
        accent: '#B523DA',
        icon: <InfoOutlinedIcon sx={{ fontSize: 28, color: '#FFFFFF' }} />,
      };
    default:
      return {
        accent: 'rgba(88, 81, 126, 0.8)',
        icon: <NotificationsNoneIcon sx={{ fontSize: 28, color: '#FFFFFF' }} />,
      };
  }
};
