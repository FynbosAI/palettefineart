import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, TextField, InputAdornment, IconButton, Badge } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import NotificationDrawer from '../../../../shared/notifications/NotificationDrawer';
import type { BranchNotificationWithStatus } from '../../../../shared/notifications/types';
import useNotifications from '../../hooks/useNotifications';
import useNotificationNavigation from '../../hooks/useNotificationNavigation';
import useShipperStore from '../../store/useShipperStore';

const useHeaderPortal = (enabled: boolean) => {
  const location = useLocation();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cleanup = () => {
      if (hostRef.current) {
        hostRef.current.remove();
        hostRef.current = null;
      }
      setHost(null);
    };

    if (!enabled) {
      cleanup();
      return () => undefined;
    }

    let frame: number | null = null;
    let cancelled = false;

    const attachToHeader = () => {
      if (cancelled) return;
      const mainPanel = document.querySelector<HTMLElement>('.dashboard .main-panel');
      if (!mainPanel) {
        frame = requestAnimationFrame(attachToHeader);
        return;
      }

      const headerRow = mainPanel.querySelector<HTMLElement>(':scope > .header .header-row');
      const target = headerRow || mainPanel;

      const mountNode = document.createElement('div');
      mountNode.classList.add('global-header-host');
      target.appendChild(mountNode);
      hostRef.current = mountNode;
      setHost(mountNode);
    };

    attachToHeader();

    return () => {
      cancelled = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      cleanup();
    };
  }, [location.pathname, enabled]);

  return enabled ? host : null;
};

const ShipperGlobalHeader = () => {
  const portalHost = useHeaderPortal(true);
  const navigate = useNavigate();
  const searchTerm = useShipperStore((state) => state.dashboardSearchTerm);
  const setDashboardSearchTerm = useShipperStore((state) => state.setDashboardSearchTerm);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    error,
    fetchMore,
    markRead,
    markAllRead
  } = useNotifications();
  const resolveNotificationTarget = useNotificationNavigation();

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = searchTerm.trim();
    if (trimmed) {
      navigate(`/estimates?search=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/estimates');
    }
  };

  const handleSelectNotification = (notification: BranchNotificationWithStatus) => {
    void markRead(notification.id);
    const target = resolveNotificationTarget(notification);
    if (target) {
      navigate(target);
    }
    setNotificationsOpen(false);
  };

  if (!portalHost) {
    return null;
  }

  return createPortal(
    <>
      <div className="global-header">
        <Box className="global-header__actions">
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/estimates')}
            sx={{
              backgroundColor: '#00AAAB',
              borderRadius: '10px',
              padding: '0px 28px 1px 26px',
              height: 44,
              minWidth: 0,
              width: { xs: '100%', sm: 222 },
              flex: { xs: '1 1 100%', sm: '0 0 auto' },
              whiteSpace: 'nowrap',
              boxShadow: 'none',
              '&:hover': { backgroundColor: '#008a8b', boxShadow: 'none' }
            }}
          >
            Create Estimate
          </Button>
          <Box
            component="form"
            onSubmit={submitSearch}
            sx={{
              width: { xs: '100%', sm: 320 },
              maxWidth: 320,
              minWidth: 200,
              flex: '1 1 220px'
            }}
          >
            <TextField
              fullWidth
              size="small"
              type="search"
              value={searchTerm}
              onChange={(event) => setDashboardSearchTerm(event.target.value)}
              placeholder="Search estimates"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#00AAAB' }} />
                  </InputAdornment>
                )
              }}
              sx={{
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  height: 44,
                  '& fieldset': { borderColor: '#E9EAEB' },
                  '&:hover fieldset': { borderColor: '#BDBDBD' },
                  '&.Mui-focused fieldset': { borderColor: '#00AAAB' }
                }
              }}
            />
          </Box>
          <IconButton
            aria-label="Notifications"
            onClick={() => setNotificationsOpen(true)}
            sx={{
              width: 40,
              height: 36,
              borderRadius: '6px',
              padding: '6px',
              color: '#170849',
              backgroundColor: 'transparent',
              transition: 'background-color 0.2s ease',
              '&:hover': { backgroundColor: 'rgba(0, 170, 171, 0.1)' }
            }}
          >
            <Badge
              color="error"
              overlap="circular"
              badgeContent={unreadCount > 9 ? '9+' : unreadCount || null}
              sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', minWidth: 18, height: 18 } }}
            >
              <NotificationsNoneIcon sx={{ fontSize: 20 }} />
            </Badge>
          </IconButton>
          <div className="global-header__logo">
            <img src="/logo_full.png" alt="Palette Art Shipping" loading="lazy" />
          </div>
        </Box>
      </div>
      <NotificationDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={fetchMore}
        onMarkAllRead={markAllRead}
        onSelectNotification={handleSelectNotification}
        error={error}
        accentColor="#00AAAB"
      />
    </>,
    portalHost
  );
};

export default ShipperGlobalHeader;
