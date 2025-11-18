import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TimerIcon from '@mui/icons-material/Timer';
import SpeedIcon from '@mui/icons-material/Speed';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { useNavigate } from 'react-router-dom';
import { useDashboardData, useAuth } from '../../hooks/useStoreSelectors';
import useShipperStore from '../../store/useShipperStore';
import { motion } from 'motion/react';
import { slideInLeft } from '../../lib/motion';
import { computeDeadlineState } from '../../lib/deadline';
import useCurrency from '../../hooks/useCurrency';
import { findOrganizationLogoUrl } from '../../lib/organizationLogos';

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

const formatDateLabel = (value: unknown) => {
  if (!value) return '—';
  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString();
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, organization, logisticsPartner, authHydrated } = useAuth();
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

  const [viewMode, setViewMode] = useState<'estimates' | 'shipments'>('estimates');
  const [compareQuoteId, setCompareQuoteId] = useState<string | null>(null);
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<string | null>(null);
  const [quoteTypeFilter, setQuoteTypeFilter] = useState<string | null>(null);
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<string | null>(null);
  const [revenueTimescale, setRevenueTimescale] = useState<'week' | 'month' | 'year' | 'ytd'>('ytd');
  const [deadlineNow, setDeadlineNow] = useState(() => Date.now());
  const { formatCurrency } = useCurrency();
  const dashboardPrefetched = useShipperStore(state => state.dashboardPrefetched);
  const organizationLogoName = organization?.company?.name ?? organization?.name ?? null;
  const defaultLogoUrl = organization?.img_url || '/logo.png';
  const logoUrl = useMemo(() => {
    const matchedLogo = findOrganizationLogoUrl(organizationLogoName);
    return matchedLogo ?? defaultLogoUrl;
  }, [organizationLogoName, defaultLogoUrl]);

  const branchOrgId = organization?.id ?? null;

  const acceptedRevenueMetrics = useMemo(() => {
    if (!branchOrgId) {
      return { revenue: 0, count: 0 };
    }

    const now = new Date();
    const start = (() => {
      const d = new Date(now);
      switch (revenueTimescale) {
        case 'week': {
          d.setDate(d.getDate() - 7);
          return d;
        }
        case 'month': {
          d.setMonth(d.getMonth() - 1);
          return d;
        }
        case 'year': {
          d.setFullYear(d.getFullYear() - 1);
          return d;
        }
        case 'ytd':
        default: {
          return new Date(now.getFullYear(), 0, 1);
        }
      }
    })();

    const acceptedEstimates = bids.filter(bid => {
      if (bid.status !== 'accepted' || bid.branch_org_id !== branchOrgId) return false;
      const acceptedAt = parseDate(bid.accepted_at ?? bid.updated_at ?? bid.submitted_at ?? bid.created_at);
      if (!acceptedAt) return true; // include if no timestamp
      return acceptedAt >= start;
    });

    const revenue = acceptedEstimates.reduce((sum, estimate) => sum + (estimate.amount ?? 0), 0);
    return { revenue, count: acceptedEstimates.length };
  }, [bids, branchOrgId, revenueTimescale]);

  const winRateMetrics = useMemo(() => {
    const submitted = bids.filter(bid => bid.status !== 'draft');
    const totalSubmitted = submitted.length;
    const acceptedCount = submitted.filter(bid => bid.status === 'accepted').length;
    const rate = totalSubmitted > 0 ? (acceptedCount / totalSubmitted) * 100 : null;
    return { rate, acceptedCount, totalSubmitted };
  }, [bids]);

  const estimateMetrics = useMemo(() => {
    const submissionDetails = bids
      .map(bid => {
        const quoteCreatedAt = parseDate((bid as any)?.quote?.created_at ?? null);
        const submittedAt = parseDate(bid.submitted_at ?? null);
        if (!quoteCreatedAt || !submittedAt) return null;
        const diff = submittedAt.getTime() - quoteCreatedAt.getTime();
        if (diff < 0) return null;
        return { id: bid.id, diffMs: diff };
      })
      .filter((value): value is { id: string; diffMs: number } => value !== null);

    const submissionDurations = submissionDetails.map(item => item.diffMs);

    const decided = bids.filter(bid => bid.status === 'accepted' || bid.status === 'rejected');
    const decisionDetails = decided
      .map(bid => {
        const submittedAt = parseDate(bid.submitted_at ?? null);
        const decisionTimestamp = bid.status === 'accepted'
          ? parseDate(bid.accepted_at ?? bid.updated_at ?? null)
          : parseDate(bid.rejected_at ?? bid.updated_at ?? null);
        if (!submittedAt || !decisionTimestamp) return null;
        const diff = decisionTimestamp.getTime() - submittedAt.getTime();
        if (diff < 0) return null;
        return { id: bid.id, diffMs: diff };
      })
      .filter((value): value is { id: string; diffMs: number } => value !== null);

    const avgSubmissionMs = submissionDurations.length > 0
      ? submissionDurations.reduce((sum, value) => sum + value, 0) / submissionDurations.length
      : null;

    const avgDecisionMs = decisionDetails.length > 0
      ? decisionDetails.reduce((sum, value) => sum + value.diffMs, 0) / decisionDetails.length
      : null;

    return {
      totalDecisions: decided.length,
      submissionSamples: submissionDurations.length,
      avgSubmissionMs,
      decisionSamples: decisionDetails.length,
      avgDecisionMs
    };
  }, [bids]);

  const avgSubmissionDisplay = estimateMetrics.avgSubmissionMs !== null
    ? formatDuration(estimateMetrics.avgSubmissionMs)
    : 'N/A';
  const submissionCaption = estimateMetrics.submissionSamples > 0
    ? `Based on ${estimateMetrics.submissionSamples} ${estimateMetrics.submissionSamples === 1 ? 'estimate' : 'estimates'}`
    : 'Requires submitted estimates with quote timestamps';

  const avgDecisionDisplay = estimateMetrics.avgDecisionMs !== null
    ? formatDuration(estimateMetrics.avgDecisionMs)
    : 'N/A';
  const decisionCaption = estimateMetrics.decisionSamples > 0
    ? `From ${estimateMetrics.decisionSamples} ${estimateMetrics.decisionSamples === 1 ? 'decision' : 'decisions'}`
    : 'Requires accepted or rejected estimates';

  useEffect(() => {
    const timerId = window.setInterval(() => setDeadlineNow(Date.now()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!loading) {
        await Promise.all([
          fetchAvailableQuotes(),
          fetchMyBids(),
          fetchAssignedShipments()
        ]);
        useShipperStore.setState({ dashboardPrefetched: true });
      }
    };

    if (organization && user && authHydrated && !dashboardPrefetched) {
      loadData();
    }
  }, [organization?.id, user?.id, authHydrated, dashboardPrefetched, loading, fetchAvailableQuotes, fetchMyBids, fetchAssignedShipments]);

  const displayNameRaw =
    logisticsPartner?.contact_name ??
    profile?.full_name ??
    (user as any)?.user_metadata?.full_name ??
    user?.email ??
    '';
  const displayName = (displayNameRaw || '').trim() || 'there';
  const [firstNameCandidate] = displayName.split(/\s+/);
  const firstName = firstNameCandidate || displayName;

  const filteredQuotes = useMemo(() => {
    return quotes
      .filter(q => {
        const status = (q.status || '').toLowerCase();
        const type = (q.type || '').toLowerCase();
        if (quoteStatusFilter && status !== quoteStatusFilter) return false;
        if (quoteTypeFilter && type !== quoteTypeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
  }, [quotes, quoteStatusFilter, quoteTypeFilter]);

  const filteredShipments = useMemo(() => {
    return shipments
      .filter(s => {
        const status = (s.status || '').toLowerCase();
        if (shipmentStatusFilter && status !== shipmentStatusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
  }, [shipments, shipmentStatusFilter]);

  const shipmentsByStatus = useMemo(() => {
    const statusOrder = ['in_transit', 'local_delivery', 'pending', 'checking', 'delivered'];
    const grouped = filteredShipments.reduce((acc, shipment) => {
      const key = shipment.status || 'unknown';
      acc[key] = acc[key] || [];
      acc[key].push(shipment);
      return acc;
    }, {} as Record<string, any[]>);

    return statusOrder
      .filter(key => grouped[key]?.length)
      .map(key => ({ status: key, items: grouped[key] }))
      .concat(
        Object.entries(grouped)
          .filter(([key]) => !statusOrder.includes(key))
          .map(([status, items]) => ({ status, items }))
      );
  }, [filteredShipments]);

  const selectedCompareQuote = useMemo(
    () => (compareQuoteId ? filteredQuotes.find(q => q.id === compareQuoteId) || null : null),
    [compareQuoteId, filteredQuotes]
  );

  const getStatusColor = (status: string) => {
    const normalized = (status || '').toLowerCase();
    switch (normalized) {
      case 'accepted': return '#0DAB71';
      case 'submitted': return '#00AAAB';
      case 'active':
      case 'invited': return '#2378DA';
      case 'rejected': return '#D94E45';
      case 'draft': return '#666';
      case 'cancelled': return '#D94E45';
      default: return '#666';
    }
  };

  const getShipmentStatusColor = (status: string) => {
    const normalized = (status || '').toLowerCase();
    switch (normalized) {
      case 'in_transit': return '#E9932D';
      case 'local_delivery': return '#B523DA';
      case 'delivered': return '#0DAB71';
      case 'pending':
      case 'checking': return '#B587E8';
      default: return '#666';
    }
  };

  const upcomingDeadlines = useMemo(() => {
    return filteredQuotes
      .filter(q => q.bidding_deadline)
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.bidding_deadline || 0).getTime();
        const bDate = new Date(b.bidding_deadline || 0).getTime();
        return aDate - bDate;
      })
      .slice(0, 5);
  }, [filteredQuotes]);

  const arrivalWatchlist = useMemo(() => {
    return filteredShipments
      .filter(s => s.estimated_arrival || s.ship_date)
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.estimated_arrival || a.ship_date || 0).getTime();
        const bDate = new Date(b.estimated_arrival || b.ship_date || 0).getTime();
        return aDate - bDate;
      })
      .slice(0, 5);
  }, [filteredShipments]);

  const topRequestsByValue = useMemo(() => {
    return filteredQuotes
      .slice()
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
      .slice(0, 3);
  }, [filteredQuotes]);

  const formatTargetWindow = (start?: unknown, end?: unknown) => {
    if (start && end) {
      return `${new Date(start as string).toLocaleDateString()} → ${new Date(end as string).toLocaleDateString()}`;
    }
    if (start) return `Target: ${new Date(start as string).toLocaleDateString()}`;
    if (end) return `Target: ${new Date(end as string).toLocaleDateString()}`;
    return 'Target window: TBD';
  };

  const selectedFiltersLabel = useMemo(() => {
    const parts: string[] = [];
    if (viewMode === 'estimates') {
      if (quoteStatusFilter) parts.push(`Status: ${quoteStatusFilter}`);
      if (quoteTypeFilter) parts.push(`Type: ${quoteTypeFilter}`);
    } else {
      if (shipmentStatusFilter) parts.push(`Status: ${shipmentStatusFilter.replace('_', ' ')}`);
    }
    return parts.join(' · ') || 'No filters applied';
  }, [viewMode, quoteStatusFilter, quoteTypeFilter, shipmentStatusFilter]);

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
  const acceptedRevenueCaption = acceptedRevenueMetrics.count > 0
    ? `${acceptedRevenueMetrics.count} ${acceptedRevenueMetrics.count === 1 ? 'estimate' : 'estimates'} won`
    : 'No accepted estimates yet';

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <motion.div
            className="header-row"
            data-testid="dashboard-header"
            style={{ alignItems: 'flex-start', height: 'auto', willChange: 'transform' }}
            initial="hidden"
            animate="show"
            variants={slideInLeft}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Box
                sx={{
                  width: 64,
                  height: 64,
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
                  style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', lineHeight: 1.2 }}>
                  {`Welcome back, ${firstName}`}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                  {companyName}
                  {branchName ? ` · ${branchName}` : ''}
                </Typography>
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
          {error ? (
            <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)', mb: 3 }}>
              <CardContent>
                <Typography color="error">Error loading dashboard: {error}</Typography>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={3}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} rowGap={2}>
                <Card sx={{ flex: 1, borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ backgroundColor: 'rgba(132, 18, 255, 0.1)', padding: '12px', borderRadius: '10px', display: 'flex' }}>
                        <RequestQuoteIcon sx={{ color: '#8412FF', fontSize: '24px' }} />
                      </Box>
                      <Box>
                        <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {stats?.availableQuotes ?? 0}
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                          Invited today
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                <Card sx={{ flex: 1, borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ backgroundColor: 'rgba(0, 170, 171, 0.1)', padding: '12px', borderRadius: '10px', display: 'flex' }}>
                        <TrendingUpIcon sx={{ color: '#00AAAB', fontSize: '24px' }} />
                      </Box>
                      <Box>
                        <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {Math.round(bidSuccessRate)}%
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                          Estimate win rate
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                          {winRateMetrics.totalSubmitted > 0 ? `${winRateMetrics.totalSubmitted} submitted` : 'Requires submitted estimates'}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                <Card sx={{ flex: 1, borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ backgroundColor: 'rgba(13, 171, 113, 0.1)', padding: '12px', borderRadius: '10px', display: 'flex' }}>
                        <MonetizationOnIcon sx={{ color: '#0DAB71', fontSize: '24px' }} />
                      </Box>
                      <Box>
                        <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {formatCurrency(acceptedRevenueMetrics.revenue)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                          Revenue won
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                          {acceptedRevenueCaption} · {revenueTimescale.toUpperCase()}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                <Card sx={{ flex: 1, borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                  <CardContent sx={{ padding: '24px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ backgroundColor: 'rgba(132, 18, 255, 0.1)', padding: '12px', borderRadius: '10px', display: 'flex' }}>
                        <TimerIcon sx={{ color: '#8412FF', fontSize: '24px' }} />
                      </Box>
                      <Box>
                        <Typography variant="h4" sx={{ fontFamily: 'Fractul', fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                          {avgSubmissionDisplay}
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'Fractul', color: '#666', fontSize: '14px' }}>
                          Avg submit time
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'Fractul', color: '#999', fontSize: '10px' }}>
                          {submissionCaption}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Stack>

              <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                <CardContent sx={{ padding: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', md: 'center' }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={1}>
                      <ToggleButtonGroup
                        size="small"
                        color="primary"
                        value={viewMode}
                        exclusive
                        onChange={(_, next) => next && setViewMode(next)}
                        sx={{
                          gap: 1,
                          '& .MuiToggleButton-root': {
                            borderRadius: '12px',
                            textTransform: 'none',
                            padding: '10px 16px',
                            border: '1px solid #E9EAEB',
                            backgroundColor: '#FCFCFD',
                            color: '#666',
                            fontWeight: 600,
                            minWidth: 140,
                          },
                          '& .Mui-selected': {
                            backgroundColor: 'rgba(132, 18, 255, 0.12) !important',
                            borderColor: '#8412FF',
                            color: '#8412FF !important',
                            boxShadow: '0 0 0 1px rgba(132, 18, 255, 0.15)',
                          },
                        }}
                      >
                        <ToggleButton value="estimates" aria-label="Estimates view">
                          <RequestQuoteIcon fontSize="small" sx={{ mr: 1 }} /> Estimates
                        </ToggleButton>
                        <ToggleButton value="shipments" aria-label="Shipments view">
                          <LocalShippingIcon fontSize="small" sx={{ mr: 1 }} /> Shipments
                        </ToggleButton>
                      </ToggleButtonGroup>
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel id="revenue-timescale">Revenue range</InputLabel>
                        <Select
                          labelId="revenue-timescale"
                          label="Revenue range"
                          value={revenueTimescale}
                          onChange={e => setRevenueTimescale(e.target.value as typeof revenueTimescale)}
                        >
                          <MenuItem value="week">Last 7 days</MenuItem>
                          <MenuItem value="month">Last 30 days</MenuItem>
                          <MenuItem value="year">Last 12 months</MenuItem>
                          <MenuItem value="ytd">Year to date</MenuItem>
                        </Select>
                      </FormControl>
                    </Stack>
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<FilterAltOutlinedIcon />}
                      onClick={() => {
                        setQuoteStatusFilter(null);
                        setQuoteTypeFilter(null);
                        setShipmentStatusFilter(null);
                      }}
                      sx={{ textTransform: 'none', alignSelf: { xs: 'flex-start', md: 'center' } }}
                    >
                      Clear filters
                    </Button>
                  </Stack>

                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2.5}
                    alignItems={{ xs: 'stretch', md: 'center' }}
                    justifyContent="space-between"
                    rowGap={1.5}
                    columnGap={2}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1.4,
                        rowGap: 1.4,
                        backgroundColor: '#FCFCFD',
                        border: '1px solid #E9EAEB',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        minHeight: 64,
                      }}
                    >
                      {viewMode === 'estimates'
                        ? (
                          <>
                            {['invited', 'draft', 'submitted', 'accepted', 'rejected'].map(status => (
                              <Tooltip key={status} title={`Filter estimates by ${status}`}>
                                <Chip
                                  clickable
                                  label={status}
                                  size="small"
                                  icon={quoteStatusFilter === status ? <CheckIcon fontSize="small" /> : undefined}
                                  onClick={() => setQuoteStatusFilter(prev => (prev === status ? null : status))}
                                  sx={{
                                    backgroundColor:
                                      quoteStatusFilter === status
                                        ? `${getStatusColor(status)}18`
                                        : '#FFFFFF',
                                    color: getStatusColor(status),
                                    border: `2px solid ${getStatusColor(status)}70`,
                                    textTransform: 'capitalize',
                                    height: 36,
                                    padding: '0 14px',
                                    fontWeight: 600,
                                    boxShadow: quoteStatusFilter === status ? '0 0 0 2px rgba(132,18,255,0.08)' : 'none'
                                  }}
                                />
                              </Tooltip>
                            ))}
                            {[
                              { key: 'requested', label: 'Requested' },
                              { key: 'auction', label: 'Auction' },
                            ].map(type => (
                              <Chip
                                key={type.key}
                                clickable
                                label={type.label}
                                size="small"
                                icon={quoteTypeFilter === type.key ? <CheckIcon fontSize="small" /> : undefined}
                                onClick={() => setQuoteTypeFilter(prev => (prev === type.key ? null : type.key))}
                                sx={{
                                  backgroundColor:
                                    quoteTypeFilter === type.key ? 'rgba(0, 170, 171, 0.16)' : '#FFFFFF',
                                  color: '#008A8B',
                                  border: '2px solid rgba(0, 170, 171, 0.35)',
                                  height: 36,
                                  padding: '0 14px',
                                  fontWeight: 600,
                                  boxShadow: quoteTypeFilter === type.key ? '0 0 0 2px rgba(0,170,171,0.12)' : 'none'
                                }}
                              />
                            ))}
                          </>
                        )
                        : (
                          <>
                            {['in_transit', 'local_delivery', 'pending', 'checking', 'delivered'].map(status => (
                              <Chip
                                key={status}
                                clickable
                                label={status.replace('_', ' ')}
                                size="small"
                                icon={shipmentStatusFilter === status ? <CheckIcon fontSize="small" /> : undefined}
                                onClick={() => setShipmentStatusFilter(prev => (prev === status ? null : status))}
                                sx={{
                                  backgroundColor:
                                    shipmentStatusFilter === status ? `${getShipmentStatusColor(status)}20` : '#FFFFFF',
                                  color: getShipmentStatusColor(status),
                                  border: `2px solid ${getShipmentStatusColor(status)}50`,
                                  textTransform: 'capitalize',
                                  height: 36,
                                  padding: '0 14px',
                                  fontWeight: 600,
                                  boxShadow: shipmentStatusFilter === status ? `0 0 0 2px ${getShipmentStatusColor(status)}15` : 'none'
                                }}
                              />
                            ))}
                          </>
                        )}
                    </Box>
                    <Typography variant="caption" sx={{ color: '#8C87A6', minWidth: 220, fontWeight: 600 }}>
                      {selectedFiltersLabel}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>

              <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                  {viewMode === 'estimates' ? (
                    <Stack spacing={2}>
                      {filteredQuotes.length === 0 ? (
                        <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.06)' }}>
                          <CardContent sx={{ padding: '24px !important' }}>
                            <Typography variant="body2" sx={{ color: '#666' }}>
                              No estimates match the current filters. Try clearing filters or switching views.
                            </Typography>
                          </CardContent>
                        </Card>
                      ) : (
                        filteredQuotes.map(quote => {
                          const bidsForQuote = Array.isArray(quote.bids)
                            ? quote.bids.filter((bid: any) => bid && bid.is_draft !== true)
                            : [];
                        const bidAmounts = bidsForQuote
                          .map((bid: any) => Number(bid.amount))
                          .filter((amount: number) => Number.isFinite(amount));
                        const bestBid = bidAmounts.length ? Math.min(...bidAmounts) : null;
                        const bidCount = bidsForQuote.length;
                        const deadlineLabel = quote.bidding_deadline
                          ? new Date(quote.bidding_deadline).toLocaleDateString()
                          : 'No deadline';
                          const status = (quote.status || 'invited').toLowerCase();
                          const statusColor = getStatusColor(status);
                          const typeLabel = (quote.type || '').toString();
                          const isSelected = compareQuoteId === quote.id;

                          return (
                            <Card
                              key={quote.id}
                              sx={{
                                borderRadius: '12px',
                                boxShadow: '0 0 40px rgba(10, 13, 18, 0.08)',
                                border: isSelected ? `2px solid ${statusColor}` : '1px solid #E9EAEB'
                              }}
                            >
                              <CardContent sx={{ padding: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#170849' }}>
                                      {quote.title || quote.client_reference || 'Untitled estimate'}
                                    </Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                                      <Tooltip title={`Status: ${status}`}>
                                        <Chip
                                          label={status}
                                          size="small"
                                          clickable
                                          onClick={() => setQuoteStatusFilter(prev => (prev === status ? null : status))}
                                          sx={{
                                            backgroundColor: `${statusColor}10`,
                                            color: statusColor,
                                            border: `1px solid ${statusColor}40`,
                                            textTransform: 'capitalize'
                                          }}
                                        />
                                      </Tooltip>
                                      {typeLabel ? (
                                        <Chip
                                          label={typeLabel}
                                          size="small"
                                          clickable
                                          onClick={() => setQuoteTypeFilter(prev => (prev === typeLabel ? null : typeLabel))}
                                          sx={{
                                            backgroundColor: 'rgba(0, 170, 171, 0.08)',
                                            color: '#00AAAB',
                                            border: '1px solid rgba(0, 170, 171, 0.2)',
                                            textTransform: 'capitalize'
                                          }}
                                        />
                                      ) : null}
                                      {bidCount > 0 ? (
                                        <Chip
                                          label={`${bidCount} estimate${bidCount === 1 ? '' : 's'}`}
                                          size="small"
                                          sx={{
                                            backgroundColor: 'rgba(0, 170, 171, 0.08)',
                                            color: '#00AAAB',
                                            border: '1px solid rgba(0, 170, 171, 0.2)'
                                          }}
                                        />
                                      ) : (
                                        <Chip
                                          label="Awaiting estimates"
                                          size="small"
                                          sx={{
                                            backgroundColor: 'rgba(132, 18, 255, 0.08)',
                                            color: '#8412FF',
                                            border: '1px solid rgba(132, 18, 255, 0.2)'
                                          }}
                                        />
                                      )}
                                    </Stack>
                                  </Box>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={() => navigate(`/estimates/${quote.id}/quote`)}
                                      sx={{ textTransform: 'none' }}
                                    >
                                      View estimate
                                    </Button>
                                    <Button
                                      variant="contained"
                                      size="small"
                                      onClick={() => navigate(`/estimates/${quote.id}/quote`)}
                                      sx={{ textTransform: 'none', backgroundColor: '#8412FF', '&:hover': { backgroundColor: '#730ADD' } }}
                                    >
                                      Edit submission
                                    </Button>
                                  </Stack>
                                </Box>

                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                  <Chip
                                    label={quote.route || `${quote.origin?.name || 'TBD'} → ${quote.destination?.name || 'TBD'}`}
                                    clickable
                                    size="small"
                                    sx={{
                                      backgroundColor: 'rgba(224, 222, 226, 0.4)',
                                      color: '#170849',
                                      border: '1px solid #E9EAEB'
                                    }}
                                  />
                                  <Chip
                                    label={formatTargetWindow(quote.target_date_start, quote.target_date_end)}
                                    size="small"
                                    sx={{ backgroundColor: '#FCFCFD', color: '#170849', border: '1px solid #E9EAEB' }}
                                  />
                                  <Tooltip title="Deadline to submit estimate">
                                    <Chip
                                      label={`Estimate deadline: ${deadlineLabel}`}
                                      size="small"
                                      sx={{ backgroundColor: 'rgba(35, 120, 218, 0.08)', color: '#2378DA', border: '1px solid rgba(35, 120, 218, 0.3)' }}
                                    />
                                  </Tooltip>
                                </Box>

                                <Grid container spacing={2}>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                      Lowest estimate
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 600, color: '#170849' }}>
                                      {bestBid === null ? '—' : formatCurrency(bestBid)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                      {bidCount === 0 ? 'Awaiting partner estimates' : `${bidCount} submitted`}
                                    </Typography>
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                      Client value
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 600, color: '#170849' }}>
                                      {quote.value ? formatCurrency(quote.value) : '—'}
                                    </Typography>
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                      Reference
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 600, color: '#170849' }}>
                                      {quote.client_reference || '—'}
                                    </Typography>
                                  </Grid>
                                </Grid>
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
                    </Stack>
                  ) : (
                    <Stack spacing={2}>
                      {shipmentsByStatus.length === 0 ? (
                        <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.06)' }}>
                          <CardContent sx={{ padding: '24px !important' }}>
                            <Typography variant="body2" sx={{ color: '#666' }}>
                              No shipments match the current filters.
                            </Typography>
                          </CardContent>
                        </Card>
                      ) : (
                        shipmentsByStatus.map(group => (
                          <Card key={group.status} sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.08)' }}>
                            <CardContent sx={{ padding: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                  label={group.status.replace('_', ' ')}
                                  size="small"
                                  sx={{
                                    backgroundColor: `${getShipmentStatusColor(group.status)}10`,
                                    color: getShipmentStatusColor(group.status),
                                    border: `1px solid ${getShipmentStatusColor(group.status)}30`,
                                    textTransform: 'capitalize'
                                  }}
                                />
                                <Typography variant="body2" sx={{ color: '#8C87A6' }}>
                                  {group.items.length} item{group.items.length === 1 ? '' : 's'}
                                </Typography>
                              </Box>
                              <Divider />
                              <Stack spacing={1.5}>
                                {group.items.map(item => (
                                  <Box
                                    key={item.id}
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 2,
                                      padding: '8px 0',
                                      borderBottom: '1px solid #E9EAEB',
                                      '&:last-of-type': { borderBottom: 'none' }
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#170849' }}>
                                        {item.name || item.code || 'Shipment'}
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: '#666' }}>
                                        {item.route || `${item.origin?.name || 'TBD'} → ${item.destination?.name || 'TBD'}`}
                                      </Typography>
                                      <Stack direction="row" spacing={1} flexWrap="wrap">
                                        {item.transport_method ? (
                                          <Chip
                                            label={item.transport_method}
                                            size="small"
                                            sx={{
                                              backgroundColor: 'rgba(132, 18, 255, 0.08)',
                                              color: '#8412FF',
                                              border: '1px solid rgba(132, 18, 255, 0.2)',
                                              textTransform: 'capitalize'
                                            }}
                                          />
                                        ) : null}
                                        {item.logistics_partner ? (
                                          <Chip
                                            label={item.logistics_partner}
                                            size="small"
                                            sx={{
                                              backgroundColor: 'rgba(0, 170, 171, 0.08)',
                                              color: '#00AAAB',
                                              border: '1px solid rgba(0, 170, 171, 0.2)'
                                            }}
                                          />
                                        ) : null}
                                      </Stack>
                                    </Box>
                                    <Box sx={{ textAlign: 'right' }}>
                                      <Typography variant="caption" sx={{ color: '#8C87A6', display: 'block' }}>
                                        Est. arrival
                                      </Typography>
                                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                        {item.estimated_arrival || item.ship_date || '—'}
                                      </Typography>
                                      {item.carbon_estimate ? (
                                        <Typography variant="caption" sx={{ color: '#00AAAB', display: 'block' }}>
                                          {Number(item.carbon_estimate).toFixed(1)} kg CO₂e
                                        </Typography>
                                      ) : null}
                                    </Box>
                                  </Box>
                                ))}
                              </Stack>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </Stack>
                  )}
                </Grid>

                <Grid item xs={12} lg={4}>
                  <Stack spacing={2}>
                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.1)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', mb: 1 }}>
                          Messaging
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                          Open inbox to coordinate with clients and partners about estimates or shipments.
                        </Typography>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => navigate('/messages')}
                          sx={{ textTransform: 'none', backgroundColor: '#8412FF', '&:hover': { backgroundColor: '#730ADD' } }}
                        >
                          Open inbox
                        </Button>
                      </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.1)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', mb: 1 }}>
                          Submission deadlines
                        </Typography>
                        {upcomingDeadlines.length === 0 ? (
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            No upcoming deadlines in view.
                          </Typography>
                        ) : (
                          upcomingDeadlines.map(quote => (
                            <Box
                              key={`${quote.id}-deadline`}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                py: 1,
                                borderBottom: '1px solid #E9EAEB',
                                '&:last-of-type': { borderBottom: 'none' }
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {quote.title || quote.client_reference || 'Estimate'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  {quote.route || `${quote.origin?.name || 'TBD'} → ${quote.destination?.name || 'TBD'}`}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                  Estimate deadline
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {formatDateLabel(quote.bidding_deadline)}
                                </Typography>
                              </Box>
                            </Box>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.1)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', mb: 1 }}>
                          Top requests
                        </Typography>
                        {topRequestsByValue.length === 0 ? (
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            No estimates in view.
                          </Typography>
                        ) : (
                          topRequestsByValue.map(request => (
                            <Box
                              key={request.id}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                py: 1,
                                borderBottom: '1px solid #E9EAEB',
                                '&:last-of-type': { borderBottom: 'none' }
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {request.title || request.client_reference || 'Estimate'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  {request.route || `${request.origin?.name || 'TBD'} → ${request.destination?.name || 'TBD'}`}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                  Value
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {request.value ? formatCurrency(request.value) : '—'}
                                </Typography>
                                <Button
                                  variant="text"
                                  size="small"
                                  onClick={() => navigate(`/estimates/${request.id}/quote`)}
                                  sx={{ textTransform: 'none', padding: 0, minWidth: 0 }}
                                >
                                  Open
                                </Button>
                              </Box>
                            </Box>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.1)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', mb: 1 }}>
                          Arrival watchlist
                        </Typography>
                        {arrivalWatchlist.length === 0 ? (
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            No upcoming arrivals in view.
                          </Typography>
                        ) : (
                          arrivalWatchlist.map(item => (
                            <Box
                              key={`${item.id}-arrival`}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                py: 1,
                                borderBottom: '1px solid #E9EAEB',
                                '&:last-of-type': { borderBottom: 'none' }
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {item.name || item.code || 'Shipment'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#666' }}>
                                  {item.route || `${item.origin?.name || 'TBD'} → ${item.destination?.name || 'TBD'}`}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                  Est. arrival
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {formatDateLabel(item.estimated_arrival || item.ship_date)}
                                </Typography>
                                <Chip
                                  label={item.status}
                                  size="small"
                                  sx={{
                                    mt: 0.5,
                                    backgroundColor: `${getShipmentStatusColor(item.status)}10`,
                                    color: getShipmentStatusColor(item.status),
                                    border: `1px solid ${getShipmentStatusColor(item.status)}30`,
                                    textTransform: 'capitalize'
                                  }}
                                />
                              </Box>
                            </Box>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </Stack>
                </Grid>
              </Grid>
            </Stack>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
