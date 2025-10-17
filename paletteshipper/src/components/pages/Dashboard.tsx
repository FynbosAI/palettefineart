import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Chip, 
  TextField,
  InputAdornment,
  CircularProgress,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Badge,
  Divider
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TimerIcon from '@mui/icons-material/Timer';
import SpeedIcon from '@mui/icons-material/Speed';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
// import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
// import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import { useNavigate } from 'react-router-dom';
import { useDashboardData, useAuth } from '../../hooks/useStoreSelectors';
import useShipperStore from '../../store/useShipperStore';
import { motion } from 'motion/react';
import { slideInLeft, staggerContainer } from '../../lib/motion';
import { computeDeadlineState } from '../../lib/deadline';
import useCurrency from '../../hooks/useCurrency';
import useNotifications from '../../hooks/useNotifications';
import { formatRelativeTime } from '../../../../shared/notifications/time';

const parseDate = (isoString?: string | null): Date | null => {
  if (!isoString) return null;
  const parsed = new Date(isoString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDuration = (milliseconds: number): string => {
  const totalMinutes = Math.round(milliseconds / 60000);
  if (totalMinutes <= 0) return '<1 min';

  const minutesInDay = 60 * 24;
  const days = Math.floor(totalMinutes / minutesInDay);
  const hours = Math.floor((totalMinutes % minutesInDay) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);

  if (!days && minutes) {
    parts.push(`${minutes}m`);
  } else if (!days && !hours && minutes === 0) {
    parts.push('<1 min');
  }

  return parts.slice(0, 2).join(' ');
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, organization, logisticsPartner } = useAuth();
  const { 
    quotes,
    bids,
    shipments,
    stats,
    bidSuccessRate,
    loading,
    error,
    fetchAvailableQuotes,
    fetchMyBids,
    fetchAssignedShipments
  } = useDashboardData();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [deadlineNow, setDeadlineNow] = useState(() => Date.now());
  const { formatCurrency } = useCurrency();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);
  const isNotificationMenuOpen = Boolean(notificationAnchorEl);

  const branchOrgId = organization?.id ?? null;

  const acceptedRevenueMetrics = useMemo(() => {
    if (!branchOrgId) {
      return {
        revenue: 0,
        count: 0
      };
    }

    const acceptedBids = bids.filter(bid => bid.status === 'accepted' && bid.branch_org_id === branchOrgId);
    const revenue = acceptedBids.reduce((sum, bid) => sum + (bid.amount ?? 0), 0);
    return {
      revenue,
      count: acceptedBids.length
    };
  }, [bids, branchOrgId]);

  const estimateMetrics = useMemo(() => {
    const submissionDetails = bids
      .map(bid => {
        const quoteCreatedAt = parseDate((bid as any)?.quote?.created_at ?? null);
        const submittedAt = parseDate(bid.submitted_at ?? null);
        if (!quoteCreatedAt || !submittedAt) return null;
        const diff = submittedAt.getTime() - quoteCreatedAt.getTime();
        if (diff < 0) return null;
        return {
          id: bid.id,
          quoteCreatedAt: quoteCreatedAt.toISOString(),
          submittedAt: submittedAt.toISOString(),
          diffMs: diff,
          diffMinutes: Number((diff / 60000).toFixed(2))
        };
      })
      .filter((value): value is {
        id: string;
        createdAt: string;
        submittedAt: string;
        diffMs: number;
        diffMinutes: number;
      } => value !== null);

    const submissionDurations = submissionDetails.map(item => item.diffMs);

    const decidedBids = bids.filter(bid => bid.status === 'accepted' || bid.status === 'rejected');
    const acceptedCount = decidedBids.filter(bid => bid.status === 'accepted').length;
    const totalDecisions = decidedBids.length;

    const decisionDetails = decidedBids
      .map(bid => {
        const submittedAt = parseDate(bid.submitted_at ?? null);
        const decisionTimestamp = bid.status === 'accepted'
          ? parseDate(bid.accepted_at ?? bid.updated_at ?? null)
          : parseDate(bid.rejected_at ?? bid.updated_at ?? null);
        if (!submittedAt || !decisionTimestamp) return null;
        const diff = decisionTimestamp.getTime() - submittedAt.getTime();
        if (diff < 0) return null;
        return {
          id: bid.id,
          submittedAt: submittedAt.toISOString(),
          decisionAt: decisionTimestamp.toISOString(),
          status: bid.status,
          diffMs: diff,
          diffMinutes: Number((diff / 60000).toFixed(2))
        };
      })
      .filter((value): value is {
        id: string;
        submittedAt: string;
        decisionAt: string;
        status: 'accepted' | 'rejected';
        diffMs: number;
        diffMinutes: number;
      } => value !== null);

    const decisionDurations = decisionDetails.map(item => item.diffMs);

    const avgSubmissionMs = submissionDurations.length > 0
      ? submissionDurations.reduce((sum, value) => sum + value, 0) / submissionDurations.length
      : null;

    const avgDecisionMs = decisionDurations.length > 0
      ? decisionDurations.reduce((sum, value) => sum + value, 0) / decisionDurations.length
      : null;

    if (typeof window !== 'undefined' && bids.length > 0) {
      // Surface the raw math in the console for quick verification during debugging.
      console.log('[Dashboard] Estimate KPI debug', {
        totalBids: bids.length,
        submissionSamples: submissionDetails,
        averageSubmissionMinutes: avgSubmissionMs !== null ? Number((avgSubmissionMs / 60000).toFixed(2)) : null,
        decisionSamples: decisionDetails,
        averageDecisionMinutes: avgDecisionMs !== null ? Number((avgDecisionMs / 60000).toFixed(2)) : null
      });
    }

    return {
      totalBids: bids.length,
      totalDecisions,
      acceptedCount,
      submissionSamples: submissionDurations.length,
      avgSubmissionMs,
      decisionSamples: decisionDurations.length,
      avgDecisionMs
    };
  }, [bids]);

  const avgSubmissionDisplay = estimateMetrics.avgSubmissionMs !== null
    ? formatDuration(estimateMetrics.avgSubmissionMs)
    : 'N/A';
  const submissionCaption = estimateMetrics.submissionSamples > 0
    ? `Based on ${estimateMetrics.submissionSamples} ${estimateMetrics.submissionSamples === 1 ? 'bid' : 'bids'} since quote creation`
    : 'Requires submitted bids with quote timestamps';

  const avgDecisionDisplay = estimateMetrics.avgDecisionMs !== null
    ? formatDuration(estimateMetrics.avgDecisionMs)
    : 'N/A';
  const decisionCaption = estimateMetrics.decisionSamples > 0
    ? `From ${estimateMetrics.decisionSamples} ${estimateMetrics.decisionSamples === 1 ? 'decision' : 'decisions'}`
    : 'Requires accepted or rejected bids';

  useEffect(() => {
    const timerId = window.setInterval(() => setDeadlineNow(Date.now()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  // Refresh data on mount
  useEffect(() => {
    // Only fetch if we have an organization and not already loading
    const loadData = async () => {
      if (!loading) {
        console.log('📊 Dashboard - Loading data for organization:', organization?.name);
        await Promise.all([
          fetchAvailableQuotes(),
          fetchMyBids(),
          fetchAssignedShipments()
        ]);
      }
    };
    
    if (organization && user) {
      loadData();
    }
  }, [organization?.id, user?.id]); // Use IDs to avoid object comparison issues
  
  // (Debug logs removed after verification)

  const displayNameRaw =
    logisticsPartner?.contact_name ??
    profile?.full_name ??
    (user as any)?.user_metadata?.full_name ??
    user?.email ??
    '';
  const displayName = (displayNameRaw || '').trim() || 'there';
  const [firstNameCandidate] = displayName.split(/\s+/);
  const firstName = firstNameCandidate || displayName;

  // Filter open quotes based on search and filter
  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = 
      (quote.origin?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       quote.destination?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       quote.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       '');
    const matchesFilter = filterType === 'all' || 
      (filterType === 'open' && quote.status === 'active') ||
      (filterType === 'direct' && quote.type === 'direct') ||
      (filterType === 'requested' && quote.type === 'requested');
    return matchesSearch && matchesFilter;
  });

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 0 && diffDays <= 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const submitDashboardSearch = () => {
    const trimmed = searchTerm.trim();
    if (trimmed) {
      navigate(`/estimates?search=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/estimates');
    }
  };

  const handleToggleNotifications = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (notificationAnchorEl) {
      handleCloseNotifications();
      return;
    }
    setNotificationAnchorEl(event.currentTarget);
  };

  const handleCloseNotifications = () => {
    setNotificationAnchorEl(null);
    if (notifications.some(item => !item.read)) {
      markAllRead();
    }
  };

  const handleNotificationClick = (href?: string | null) => {
    if (href) {
      navigate(href);
    }
    handleCloseNotifications();
  };

  // Get quote type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'open':
        return 'primary';
      case 'direct':
        return 'secondary';
      case 'requested':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <div className="main-wrap">
        <div className="main-panel" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <CircularProgress sx={{ color: '#00AAAB' }} />
        </div>
      </div>
    );
  }

  const companyName = organization?.company?.name || organization?.name || 'Your company';
  const branchName = organization?.branch_name || null;
  const logoUrl = organization?.img_url || '/logo.png';

  const acceptedRevenueCaption = acceptedRevenueMetrics.count > 0
    ? `${acceptedRevenueMetrics.count} ${acceptedRevenueMetrics.count === 1 ? 'bid' : 'bids'} won`
    : 'No accepted bids yet';

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <motion.div
            className="header-row"
            data-testid="dashboard-header"
            initial="hidden"
            animate="show"
            variants={slideInLeft}
            style={{ willChange: 'transform', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img
                  src={logoUrl}
                  alt={companyName ? `${companyName} logo` : 'Organization logo'}
                  style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }}
                />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <h1 className="header-title">{`Welcome back, ${firstName}`}</h1>
                <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#6B6780' }}>
                  {companyName}{branchName ? ` · ${branchName}` : ''}
                </Typography>
              </Box>
            </Box>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginLeft: { xs: 0, md: 'auto' },
                width: '100%',
                maxWidth: { xs: '100%', md: 720 },
                gap: { xs: '12px', md: '16px' },
                justifyContent: { xs: 'flex-start', md: 'flex-end' }
              }}
            >
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/estimates')}
                sx={{
                  backgroundColor: '#8412FF',
                  borderRadius: '10px',
                  padding: '0px 28px 1px 26px',
                  height: 44,
                  minWidth: 0,
                  width: { xs: '100%', sm: 222 },
                  flex: { xs: '1 1 100%', sm: '0 0 auto' },
                  whiteSpace: 'nowrap',
                  boxShadow: 'none',
                  '&:hover': { backgroundColor: '#730ADD', boxShadow: 'none' }
                }}
              >
                Create Estimate
              </Button>
              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitDashboardSearch();
                }}
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
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search estimates"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: '#730ADD' }} />
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
                      '&.Mui-focused fieldset': { borderColor: '#8412FF' }
                    }
                  }}
                />
              </Box>
              <IconButton
                aria-label="Notifications"
                aria-controls={isNotificationMenuOpen ? 'dashboard-notifications-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={isNotificationMenuOpen ? 'true' : undefined}
                onClick={handleToggleNotifications}
                sx={{
                  width: 40,
                  height: 36,
                  borderRadius: '6px',
                  padding: '6px',
                  color: '#170849',
                  backgroundColor: 'transparent',
                  transition: 'background-color 0.2s ease',
                  '&:hover': { backgroundColor: 'rgba(132, 18, 255, 0.08)' }
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
              <Menu
                id="dashboard-notifications-menu"
                anchorEl={notificationAnchorEl}
                open={isNotificationMenuOpen}
                onClose={handleCloseNotifications}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                  paper: {
                    sx: { minWidth: 280, borderRadius: 2, paddingY: 1 }
                  }
                }}
              >
                {notifications.length === 0 ? (
                  <MenuItem disabled sx={{ opacity: 1, color: '#58517E', fontSize: 14 }}>
                    You're all caught up
                  </MenuItem>
                ) : (
                  <>
                    {notifications.map((notification) => (
                      <MenuItem
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification.href)}
                        sx={{
                          alignItems: 'flex-start',
                          gap: 1.5,
                          whiteSpace: 'normal',
                          backgroundColor: notification.read ? 'transparent' : 'rgba(132, 18, 255, 0.06)',
                          '&:hover': {
                            backgroundColor: notification.read
                              ? 'rgba(132, 18, 255, 0.08)'
                              : 'rgba(132, 18, 255, 0.12)'
                          }
                        }}
                      >
                        {!notification.read ? (
                          <Box
                            component="span"
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: '#8412FF',
                              marginTop: '6px'
                            }}
                          />
                        ) : (
                          <Box component="span" sx={{ width: 8, height: 8, marginTop: '6px' }} />
                        )}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{ fontWeight: notification.read ? 500 : 600, color: '#170849' }}
                          >
                            {notification.title}
                          </Typography>
                          {notification.description ? (
                            <Typography variant="body2" sx={{ color: '#58517E', lineHeight: 1.4 }}>
                              {notification.description}
                            </Typography>
                          ) : null}
                          <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                            {formatRelativeTime(notification.timestamp)}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                    <Divider sx={{ my: 0.5 }} />
                    <MenuItem
                      onClick={() => {
                        markAllRead();
                        handleCloseNotifications();
                      }}
                      sx={{ color: '#8412FF', fontWeight: 600 }}
                    >
                      Mark all as read
                    </MenuItem>
                  </>
                )}
              </Menu>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '12px',
                  padding: 0,
                  width: { xs: 'auto', sm: 98 },
                  minWidth: 98,
                  height: 36,
                  flex: { xs: '0 0 auto', sm: '0 0 auto' }
                }}
              >
                <img
                  src="/logo_full.png"
                  alt="Palette Art Shipping"
                  style={{ width: '100%', maxWidth: '97.74px', maxHeight: '24px', objectFit: 'contain' }}
                />
              </Box>
            </Box>
          </motion.div>
        </header>

        <div className="main-content" style={{ padding: '24px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: 'none' }}>
            {/* ROW 1 - SHIPMENT KPIs */}
            <div>
              <Typography variant="h6" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '16px' }}>
                Shipment KPIs
              </Typography>
              <motion.div
                data-testid="shipment-kpis"
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                  gap: '24px'
                }}
                initial="hidden"
                animate="show"
                variants={staggerContainer(0.08)}
              >
                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="kpi-card-0">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(132, 18, 255, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <LocalShippingIcon sx={{ color: '#8412FF', fontSize: '24px' }} />
                        </Box>
                        <Box>
                          <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                            {shipments.length}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                            # Shipments
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                  </motion.div>

                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="kpi-card-1">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(233, 147, 45, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <MonetizationOnIcon sx={{ color: '#E9932D', fontSize: '24px' }} />
                        </Box>
                        <Box>
                          <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                            {formatCurrency(acceptedRevenueMetrics.revenue)}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                            Revenue Won
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                            {acceptedRevenueCaption}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                  </motion.div>

                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="kpi-card-2">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(0, 170, 171, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <FlightTakeoffIcon sx={{ color: '#00AAAB', fontSize: '24px' }} />
                        </Box>
                        <Box>
                          <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                            {stats.activeShipments}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                            Shipments In Transit
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                  </motion.div>

                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="kpi-card-3">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(13, 171, 113, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <CheckCircleIcon sx={{ color: '#0DAB71', fontSize: '24px' }} />
                        </Box>
                        <Box>
                          <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                            N/A
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                            On-time Delivery %
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                            (No data available)
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                  </motion.div>
                </motion.div>
            </div>

            {/* ROW 2 - QUOTE KPIs */}
            <div style={{ marginTop: '16px' }}>
              <Typography variant="h6" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '16px' }}>
                Estimate KPIs
              </Typography>
              <motion.div
                data-testid="estimate-kpis"
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                  gap: '24px'
                }}
                initial="hidden"
                animate="show"
                variants={staggerContainer(0.08)}
              >
                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="est-kpi-card-0">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(0, 170, 171, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <RequestQuoteIcon sx={{ color: '#00AAAB', fontSize: '24px' }} />
                        </Box>
                        <Box>
                          <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                            {bids.length}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                            Estimates Sent
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                  </motion.div>

                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="est-kpi-card-1">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(13, 171, 113, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <TrendingUpIcon sx={{ color: '#0DAB71', fontSize: '24px' }} />
                        </Box>
                    <Box>
                      <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                        {Math.round(bidSuccessRate)}%
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                        % Bids Won
                      </Typography>
                      {estimateMetrics.totalDecisions > 0 ? (
                        <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                          {`${estimateMetrics.totalDecisions} ${estimateMetrics.totalDecisions === 1 ? 'decision' : 'decisions'}`}
                        </Typography>
                      ) : (
                        <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                          Requires accepted or rejected bids
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
              </motion.div>

                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="est-kpi-card-2">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(132, 18, 255, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <TimerIcon sx={{ color: '#8412FF', fontSize: '24px' }} />
                        </Box>
                        <Box>
                          <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                            {avgSubmissionDisplay}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                            Avg Time to Submit (Quote → Bid)
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                            {submissionCaption}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                  </motion.div>

                  <motion.div variants={slideInLeft} style={{ willChange: 'transform' }} data-testid="est-kpi-card-3">
                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                    <CardContent sx={{ padding: '24px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ 
                          backgroundColor: 'rgba(233, 147, 45, 0.1)', 
                          padding: '12px', 
                          borderRadius: '10px',
                          display: 'flex'
                        }}>
                          <SpeedIcon sx={{ color: '#E9932D', fontSize: '24px' }} />
                        </Box>
                        <Box>
                          <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                            {avgDecisionDisplay}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                            Avg Estimate Response
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                            {decisionCaption}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                  </motion.div>
                </motion.div>
            </div>

            {/* ROW 3 - OUTSTANDING QUOTES & RECENT ACTIVITY */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {/* Outstanding Quotes - takes up more space */}
              <div style={{ flex: '2 1 600px', minWidth: '500px' }}>
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <Typography variant="h6" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849' }}>
                        Current Estimates
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        
                        <TextField
                          size="small"
                          placeholder="Search..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position="end">
                                <SearchIcon />
                              </InputAdornment>
                            ),
                          }}
                          sx={{ minWidth: 200 }}
                        />
                      </Box>
                    </Box>
                    
                    {filteredQuotes.length === 0 ? (
                      <Box sx={{ padding: '40px', textAlign: 'center' }}>
                        <Typography variant="body1" sx={{ fontFamily: 'Fractul', color: '#666' }}>
                          No outstanding estimates at the moment
                        </Typography>
                      </Box>
                    ) : (
                      <motion.div
                        data-testid="open-quotes-list"
                        initial="hidden"
                        animate="show"
                        variants={staggerContainer(0.06)}
                      >
                        {filteredQuotes.map((quote, i) => {
                          const manualClose = quote.auto_close_bidding === false;
                          const deadlineState = computeDeadlineState(quote.bidding_deadline, { manualClose, now: deadlineNow });
                          const deadlineChipLabel = manualClose
                            ? 'Manual close'
                            : deadlineState.isExpired
                              ? 'Bidding closed'
                              : deadlineState.label;
                          const deadlineChipStyles = manualClose
                            ? { backgroundColor: 'rgba(23, 8, 73, 0.08)', color: '#170849', fontSize: '12px' }
                            : deadlineState.urgency === 'critical'
                              ? { backgroundColor: 'rgba(217, 78, 69, 0.12)', color: '#D94E45', fontSize: '12px' }
                              : deadlineState.urgency === 'warning'
                                ? { backgroundColor: 'rgba(233, 147, 45, 0.1)', color: '#E9932D', fontSize: '12px' }
                                : { backgroundColor: 'rgba(132, 18, 255, 0.1)', color: '#8412FF', fontSize: '12px' };

                          return (
                            <motion.div
                              key={quote.id}
                              data-testid={`open-quote-${i}`}
                              variants={slideInLeft}
                              style={{ willChange: 'transform' }}
                            >
                              <Box 
                                sx={{ 
                                  padding: '20px', 
                                  border: '1px solid #E0E0E0', 
                                  borderRadius: '10px',
                                  marginBottom: '16px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  '&:hover': {
                                    borderColor: '#00AAAB',
                                    backgroundColor: '#F8FAFB'
                                  }
                                }}
                                onClick={() => navigate(`/estimates/${quote.id}/bid`)}
                              >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <Typography variant="body1" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '8px' }}>
                                    {quote.origin?.name && quote.destination?.name 
                                      ? `${quote.origin.name} → ${quote.destination.name}`
                                      : quote.title || 'Untitled Quote'}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Chip
                                      label={deadlineChipLabel}
                                      size="small"
                                      sx={deadlineChipStyles}
                                    />
                                    <Chip
                                      label={quote.type || 'direct'}
                                      size="small"
                                      sx={{
                                        backgroundColor: quote.type === 'requested' 
                                          ? 'rgba(132, 18, 255, 0.1)' 
                                          : 'rgba(0, 170, 171, 0.1)',
                                        color: quote.type === 'requested' ? '#8412FF' : '#00AAAB',
                                        fontSize: '12px'
                                      }}
                                    />
                                  </Box>
                                </Box>
                                <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', marginBottom: '4px' }}>
                                  {quote.notes || 'No description available'}
                                </Typography>
                                <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#666' }}>
                                  Est {formatCurrency(quote.value || 0)}
                                </Typography>
                              </Box>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity Column */}
              <div style={{ flex: '1 1 400px', minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Recent Shipments */}
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Typography variant="h6" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '16px' }}>
                      Shipments In Progress
                    </Typography>
                    <motion.div
                      data-testid="recent-shipments-list"
                      initial="hidden"
                      animate="show"
                      variants={staggerContainer(0.06)}
                    >
                      {shipments.slice(0, 3).map((shipment, i) => (
                        <motion.div
                          key={shipment.id}
                          data-testid={`recent-shipment-${i}`}
                          variants={slideInLeft}
                          style={{ willChange: 'transform' }}
                        >
                          <Box 
                            sx={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'flex-start',
                              padding: '12px 0',
                              borderBottom: '1px solid #E9EAEB',
                              '&:last-child': { borderBottom: 'none' },
                              cursor: 'pointer',
                              '&:hover': { backgroundColor: 'rgba(132, 18, 255, 0.02)' }
                            }}
                            onClick={() => navigate(`/shipments/${shipment.id}`)}
                          >
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                                {shipment.code || `Shipment ${shipment.id.slice(0, 8)}`}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: '4px' }}>
                                <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: shipment.status === 'in_transit' ? '#E9932D' : '#0DAB71' }}>
                                  {shipment.status?.replace('_', ' ')}
                                </Typography>
                                {shipment.status === 'in_transit' && shipment.estimated_arrival && (
                                  <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#666' }}>
                                    • ETA {formatDate(shipment.estimated_arrival)}
                                  </Typography>
                                )}
                                {shipment.status === 'delivered' && (
                                  <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#666' }}>
                                    ✓ Delivered
                                  </Typography>
                                )}
                              </Box>
                              <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#666' }}>
                                {formatCurrency(shipment.total_value || 0)}
                              </Typography>
                            </Box>
                          </Box>
                        </motion.div>
                      ))}
                    </motion.div>
                  </CardContent>
                </Card>

                {/* Recent Estimates Sent */}
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Typography variant="h6" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '16px' }}>
                      Recent Estimates Submitted
                    </Typography>
                    <motion.div
                      data-testid="recent-estimates-list"
                      initial="hidden"
                      animate="show"
                      variants={staggerContainer(0.06)}
                    >
                      {bids.slice(0, 3).map((bid, i) => (
                        <motion.div
                          key={bid.id}
                          data-testid={`recent-estimate-${i}`}
                          variants={slideInLeft}
                          style={{ willChange: 'transform' }}
                        >
                          <Box 
                            sx={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'flex-start',
                              padding: '16px 0',
                              borderBottom: '1px solid #F0F0F0',
                              '&:last-child': { borderBottom: 'none' }
                            }}
                          >
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                                Quote #{bid.quote_id.slice(0, 8)}
                              </Typography>
                              <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#666', marginBottom: '4px', display: 'block' }}>
                                {formatCurrency(bid.amount)}
                              </Typography>
                              <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#666' }}>
                                Sent {formatDate(bid.created_at)}
                              </Typography>
                            </Box>
                            <Chip
                              label={bid.status}
                              size="small"
                              sx={{
                                backgroundColor: 'white',
                                color: bid.status === 'accepted' ? '#0DAB71' : bid.status === 'rejected' ? '#FF4444' : '#E9932D',
                                border: `1px solid ${bid.status === 'accepted' ? '#0DAB71' : bid.status === 'rejected' ? '#FF4444' : '#E9932D'}`,
                                fontSize: '12px'
                              }}
                            />
                          </Box>
                        </motion.div>
                      ))}
                    </motion.div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
