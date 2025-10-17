import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Button, Chip, CircularProgress, Alert, TextField, InputAdornment, IconButton, Menu, MenuItem, Badge, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import { useDashboardData, useAuth } from '../../hooks/useStoreSelectors';
import { motion } from 'motion/react';
import { slideInLeft } from '../../lib/motion';
import useNotifications from '../../hooks/useNotifications';
import { formatRelativeTime } from '../../../../shared/notifications/time';

interface DashboardStats {
  totalShipments: number;
  activeShipments: number;
  totalQuotes: number;
  activeQuotes: number;
  activeQuotesWithBids: number;
  bidCoverageRate: number | null;
  urgentShipments: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { 
    shipments, 
    quotes, 
    loading, 
    error, 
    fetchShipments,
    fetchQuotes 
  } = useDashboardData();
  const { user, profile, currentOrg } = useAuth();
  const displayName =
    (profile?.full_name || (user as any)?.user_metadata?.full_name || user?.email || 'there') as string;
  const firstName = displayName?.split(' ')[0] || displayName;
  const logoUrl = (currentOrg as any)?.img_url || '/logo.png';
  const companyName = (currentOrg as any)?.company?.name || (currentOrg as any)?.name || null;
  const branchName = (currentOrg as any)?.branch_name || null;
  const [shipmentSearchTerm, setShipmentSearchTerm] = useState('');
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);
  const isNotificationMenuOpen = Boolean(notificationAnchorEl);

  const [stats, setStats] = useState<DashboardStats>({
    totalShipments: 0,
    activeShipments: 0,
    totalQuotes: 0,
    activeQuotes: 0,
    activeQuotesWithBids: 0,
    bidCoverageRate: null,
    urgentShipments: 0
  });

  // Calculate dashboard statistics
  useEffect(() => {
    const totalShipments = shipments.length;
    const activeShipments = shipments.filter(s => 
      ['checking', 'pending', 'in_transit', 'artwork_collected', 'security_check', 'local_delivery'].includes(s.status)
    ).length;
    
    const totalQuotes = quotes.length;
    const activeQuotes = quotes.filter(q => q.status === 'active').length;
    
    const activeQuotesWithBids = quotes.filter(q => {
      if (q.status !== 'active') {
        return false;
      }
      const bids = Array.isArray(q.bids) ? q.bids : [];
      return bids.some(bid => Boolean(bid));
    }).length;

    const bidCoverageRate = activeQuotes === 0 ? null : activeQuotesWithBids / activeQuotes;
    
    // Urgent shipments: in transit for over 7 days or with upcoming ship dates
    const urgentShipments = shipments.filter(s => {
      if (s.status === 'in_transit' && s.ship_date) {
        const shipDate = new Date(s.ship_date);
        const now = new Date();
        const daysDiff = (now.getTime() - shipDate.getTime()) / (1000 * 3600 * 24);
        return daysDiff > 7;
      }
      if (s.ship_date) {
        const shipDate = new Date(s.ship_date);
        const now = new Date();
        const daysDiff = (shipDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
        return daysDiff <= 3 && daysDiff >= 0; // Shipping in next 3 days
      }
      return false;
    }).length;

    setStats({
      totalShipments,
      activeShipments,
      totalQuotes,
      activeQuotes,
      activeQuotesWithBids,
      bidCoverageRate,
      urgentShipments
    });
  }, [shipments, quotes]);

  // Data is now preloaded before Dashboard mounts, so no need to fetch here
  // If data is missing (edge case), it will be handled by the error/loading states

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return '#0DAB71';
      case 'in_transit': return '#E9932D';
      case 'security_check': return '#2378DA';
      case 'artwork_collected': return '#8412FF';
      case 'local_delivery': return '#B523DA';
      case 'checking':
      case 'pending': return '#666';
      default: return '#D94E45';
    }
  };

  const recentShipments = shipments
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentQuotes = quotes
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const handleToggleNotifications = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (notificationAnchorEl) {
      handleCloseNotifications();
      return;
    }
    setNotificationAnchorEl(event.currentTarget);
  };

  const handleCloseNotifications = () => {
    setNotificationAnchorEl(null);
    if (notifications.some((item) => !item.read)) {
      markAllRead();
    }
  };

  const handleNotificationClick = (href?: string | null) => {
    if (href) {
      navigate(href);
    }
    handleCloseNotifications();
  };

  const submitShipmentSearch = () => {
    const trimmed = shipmentSearchTerm.trim();
    if (trimmed) {
      navigate(`/logistics?search=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/logistics');
    }
  };

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <motion.div
            className="header-row"
            style={{ alignItems: 'flex-start', height: 'auto', willChange: 'transform' }}
            initial="hidden"
            animate="show"
            variants={slideInLeft}
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
                  justifyContent: 'center',
                }}
              >
                <img
                  src={logoUrl}
                  alt={companyName ? `${companyName} logo` : 'Organization logo'}
                  style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }}
                />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 500, color: '#170849', lineHeight: 1.2 }}>
                  {`Welcome back, ${firstName}`}
                </Typography>
                {companyName ? (
                  <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                    {companyName}
                    {branchName ? ` · ${branchName}` : ''}
                  </Typography>
                ) : null}
              </Box>
            </Box>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginLeft: { xs: 0, sm: 'auto' },
                width: '100%',
                maxWidth: { xs: '100%', sm: 680 },
                gap: { xs: '12px', sm: '16px' },
                justifyContent: { xs: 'flex-start', sm: 'flex-end' }
              }}
            >
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/estimates/new')}
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
                Create Shipment
              </Button>
              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitShipmentSearch();
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
                  value={shipmentSearchTerm}
                  onChange={(event) => setShipmentSearchTerm(event.target.value)}
                  placeholder="Search shipments"
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
                      '& fieldset': {
                        borderColor: '#E9EAEB'
                      },
                      '&:hover fieldset': {
                        borderColor: '#BDBDBD'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#8412FF'
                      }
                    }
                  }}
                />
              </Box>
              <IconButton
                aria-label="Notifications"
                aria-controls={isNotificationMenuOpen ? 'gallery-dashboard-notifications-menu' : undefined}
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
                id="gallery-dashboard-notifications-menu"
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
                  height: 36
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

        <motion.div
          className="main-content"
          style={{ padding: '24px 32px', willChange: 'transform' }}
          initial="hidden"
          animate="show"
          variants={slideInLeft}
        >
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              Error loading dashboard data: {error}
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {/* Overview Stats */}
              <Grid item xs={12} md={6} lg={3}>
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
                        <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {stats.totalShipments}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                          Total Shipments
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#00AAAB', fontSize: '12px' }}>
                          {stats.activeShipments} active
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6} lg={3}>
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
                        <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {stats.totalQuotes}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                          Total Quotes
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#00AAAB', fontSize: '12px' }}>
                          {stats.activeQuotes} active
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6} lg={3}>
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ 
                        backgroundColor: 'rgba(35, 120, 218, 0.1)', 
                        padding: '12px', 
                        borderRadius: '10px',
                        display: 'flex'
                      }}>
                        <TrendingUpIcon sx={{ color: '#2378DA', fontSize: '24px' }} />
                      </Box>
                      <Box>
                        <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {stats.bidCoverageRate === null ? '—' : `${Math.round(stats.bidCoverageRate * 100)}%`}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                          Bid Coverage Rate
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#00AAAB', fontSize: '12px' }}>
                          {stats.activeQuotes === 0
                            ? 'No active quotes'
                            : `${stats.activeQuotesWithBids} of ${stats.activeQuotes} active quotes`}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6} lg={3}>
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ 
                        backgroundColor: 'rgba(217, 78, 69, 0.1)', 
                        padding: '12px', 
                        borderRadius: '10px',
                        display: 'flex'
                      }}>
                        <AssignmentLateIcon sx={{ color: '#D94E45', fontSize: '24px' }} />
                      </Box>
                      <Box>
                        <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {stats.urgentShipments}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                          Urgent Items
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#D94E45', fontSize: '12px' }}>
                          need attention
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Recent Activity */}
              <Grid item xs={12} lg={6}>
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', marginBottom: '16px' }}>
                      Recent Shipments
                    </Typography>
                    {recentShipments.length === 0 ? (
                      <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', py: 2 }}>
                        No shipments yet
                      </Typography>
                    ) : (
                      recentShipments.map((shipment) => (
                        <Box 
                          key={shipment.id} 
                          sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '12px 0',
                            borderBottom: '1px solid #E9EAEB',
                            '&:last-child': { borderBottom: 'none' },
                            cursor: 'pointer',
                            '&:hover': { backgroundColor: 'rgba(132, 18, 255, 0.02)' }
                          }}
                          onClick={() => navigate('/shipments')}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#170849' }}>
                              {shipment.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                              {shipment.code}
                            </Typography>
                          </Box>
                          <Chip
                            label={shipment.status.replace('_', ' ')}
                            size="small"
                            sx={{
                              backgroundColor: 'white',
                              color: getStatusColor(shipment.status),
                              border: `1px solid ${getStatusColor(shipment.status)}`,
                              fontSize: '12px',
                              textTransform: 'capitalize'
                            }}
                          />
                        </Box>
                      ))
                    )}
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} lg={6}>
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', marginBottom: '16px' }}>
                      Recent Estimates
                    </Typography>
                    {recentQuotes.length === 0 ? (
                      <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', py: 2 }}>
                        No quotes yet
                      </Typography>
                    ) : (
                      recentQuotes.map((quote) => (
                        <Box 
                          key={quote.id} 
                          sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '12px 0',
                            borderBottom: '1px solid #E9EAEB',
                            '&:last-child': { borderBottom: 'none' },
                            cursor: 'pointer',
                            '&:hover': { backgroundColor: 'rgba(0, 170, 171, 0.02)' }
                          }}
                          onClick={() => navigate('/estimates')}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#170849' }}>
                              {quote.title}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                              {quote.route || 'Route not specified'}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Chip
                              label={quote.status}
                              size="small"
                              sx={{
                                backgroundColor: quote.status === 'active' ? 'rgba(0, 170, 171, 0.1)' : 'rgba(102, 102, 102, 0.1)',
                                color: quote.status === 'active' ? '#00AAAB' : '#666',
                                fontSize: '12px',
                                textTransform: 'capitalize',
                                marginBottom: '4px'
                              }}
                            />
                            {quote.bids && quote.bids.length > 0 && (
                              <Typography variant="caption" sx={{ color: '#00AAAB', display: 'block' }}>
                                {quote.bids.length} bid{quote.bids.length !== 1 ? 's' : ''}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      ))
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Status Distribution */}
              <Grid item xs={12}>
                <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', marginBottom: '16px' }}>
                      Shipment Status Overview
                    </Typography>
                    {shipments.length === 0 ? (
                      <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', py: 4 }}>
                        No shipments to display
                      </Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {Object.entries(
                          shipments.reduce((acc, shipment) => {
                            acc[shipment.status] = (acc[shipment.status] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([status, count]) => (
                          <Box
                            key={status}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              padding: '8px 12px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(224, 222, 226, 0.2)',
                              border: `1px solid ${getStatusColor(status)}20`
                            }}
                          >
                            <Box
                              sx={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                backgroundColor: getStatusColor(status)
                              }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#170849' }}>
                              {status.replace('_', ' ')} ({count})
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard; 
