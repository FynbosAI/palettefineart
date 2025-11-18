import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  IconButton,
  Button,
  Tooltip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Checkbox
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import { useDashboardData, useAuth } from '../../hooks/useStoreSelectors';
import useChatStore from '../../store/chatStore';
import { motion } from 'motion/react';
import { slideInLeft } from '../../lib/motion';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import useCurrency from '../../hooks/useCurrency';
import CheckIcon from '@mui/icons-material/Check';

const organizationLogoAssets = import.meta.glob(
  '../../../public/logos/*.{png,svg}',
  { eager: true, import: 'default', query: '?url' }
) as Record<string, string>;

type OrganizationLogoEntry = {
  svg?: string;
  png?: string;
};

const organizationLogoMap = new Map<string, OrganizationLogoEntry>();

Object.entries(organizationLogoAssets).forEach(([path, url]) => {
  const fileName = path.split('/').pop();
  if (!fileName) return;

  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return;

  const baseName = fileName.slice(0, dotIndex).trim().toLowerCase();
  if (!baseName) return;

  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  const entry = organizationLogoMap.get(baseName) ?? {};

  if (extension === 'svg' && !entry.svg) {
    entry.svg = url;
  } else if (extension === 'png' && !entry.png) {
    entry.png = url;
  }

  organizationLogoMap.set(baseName, entry);
});

const findOrganizationLogoUrl = (organizationName: string | null | undefined): string | null => {
  if (!organizationName) return null;

  const normalized = organizationName.trim().toLowerCase();
  if (!normalized) return null;

  const entry = organizationLogoMap.get(normalized);
  if (!entry) return null;

  return entry.svg ?? entry.png ?? null;
};

const buildRouteLabel = (
  originName: string | null | undefined,
  destinationName: string | null | undefined,
  fallbackRoute?: string | null
): string => {
  const origin = originName?.trim() ?? '';
  const destination = destinationName?.trim() ?? '';
  if (origin && destination) {
    return `${origin} → ${destination}`;
  }
  if (fallbackRoute?.trim()) {
    return fallbackRoute.trim();
  }
  if (origin) return origin;
  if (destination) return destination;
  return 'Route unavailable';
};

interface DashboardStats {
  totalShipments: number;
  activeShipments: number;
  totalQuotes: number;
  activeQuotes: number;
  activeQuotesWithBids: number;
  bidCoverageRate: number | null;
  urgentShipments: number;
}

type ShipperHistoryEntry = {
  id: string;
  shipmentName: string;
  route: string;
  co2Kg: number | null;
  completedAt: string | null;
  mode: string | null;
};

type ShipperInsightRow = {
  id: string;
  name: string;
  logoKeys: string[];
  remoteLogoUrl: string | null;
  totalSpendUsd: number;
  avgCo2PerBidKg: number | null;
  bidsSent: number;
  estimateVariancePercent: number | null;
  history: ShipperHistoryEntry[];
};

interface ShipperLeaderboardProps {
  rows: ShipperInsightRow[];
}

const ShipperLeaderboardRow: React.FC<{ row: ShipperInsightRow }> = ({ row }) => {
  const [open, setOpen] = useState(false);
  const { formatCurrency, preferredCurrency } = useCurrency();
  const logoUrl = (() => {
    for (const key of row.logoKeys) {
      const candidate = findOrganizationLogoUrl(key);
      if (candidate) return candidate;
    }
    return row.remoteLogoUrl ?? null;
  })();
  const formattedTotalSpend = useMemo(() => formatCurrency(row.totalSpendUsd), [formatCurrency, row.totalSpendUsd]);
  const averageCo2Display =
    row.avgCo2PerBidKg === null || !Number.isFinite(row.avgCo2PerBidKg)
      ? '—'
      : `${row.avgCo2PerBidKg.toFixed(1)} kg`;
  const varianceValue =
    row.estimateVariancePercent === null || !Number.isFinite(row.estimateVariancePercent)
      ? null
      : row.estimateVariancePercent;
  const varianceLabel =
    varianceValue === null ? '—' : `${varianceValue > 0 ? '+' : ''}${varianceValue.toFixed(1)}%`;
  const varianceColor =
    varianceValue === null ? '#170849' : varianceValue > 0 ? '#D94E45' : varianceValue < 0 ? '#0DAB71' : '#170849';
  const historyDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }),
    []
  );

  return (
    <>
      <TableRow
        sx={{
          '& > *': { borderBottom: '1px solid #E9EAEB' },
          '&:last-of-type > *': { borderBottom: open ? '1px solid #E9EAEB' : 'none' }
        }}
      >
        <TableCell sx={{ width: 48, borderBottom: 'inherit' }}>
          <IconButton
            aria-label={`Toggle ${row.name} history`}
            size="small"
            onClick={() => setOpen(prev => !prev)}
            sx={{ color: '#8571FF' }}
          >
            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ borderBottom: 'inherit' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              component="img"
              src={logoUrl ?? undefined}
              alt={logoUrl ? `${row.name} logo` : `${row.name} logo placeholder`}
              sx={{
                width: 44,
                height: 44,
                borderRadius: '8px',
                objectFit: 'cover',
                backgroundColor: '#F4F5F7',
                border: '1px solid #E9EAEB'
              }}
            />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                {row.name}
              </Typography>
              <Typography variant="caption" sx={{ color: '#666' }}>
                Year to date
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="right" sx={{ borderBottom: 'inherit' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
            {averageCo2Display}
          </Typography>
          <Typography variant="caption" sx={{ color: '#8C87A6' }}>
            Avg CO₂ per estimate (kg CO₂e)
          </Typography>
        </TableCell>
        <TableCell align="right" sx={{ borderBottom: 'inherit' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
            {row.bidsSent}
          </Typography>
          <Typography variant="caption" sx={{ color: '#8C87A6' }}>
            Estimates sent (YTD)
          </Typography>
        </TableCell>
        <TableCell align="right" sx={{ borderBottom: 'inherit' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
            {formattedTotalSpend}
          </Typography>
          <Typography variant="caption" sx={{ color: '#8C87A6' }}>
            Total spend ({preferredCurrency})
          </Typography>
        </TableCell>
        <TableCell align="right" sx={{ borderBottom: 'inherit' }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: varianceColor
            }}
          >
            {varianceLabel}
          </Typography>
          <Typography variant="caption" sx={{ color: '#8C87A6' }}>
            Avg estimate vs. peer median
          </Typography>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ paddingBottom: 0, paddingTop: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 0, padding: '0 16px 16px' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#170849', mb: 1, mt: 2 }}>
                Completed shipments
              </Typography>
              {row.history.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#8C87A6' }}>
                  No shipment history recorded yet.
                </Typography>
              ) : (
                <Table size="small" aria-label={`${row.name} completed shipments`}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#8571FF', fontWeight: 600 }}>Completed</TableCell>
                      <TableCell sx={{ color: '#8571FF', fontWeight: 600 }}>Shipment</TableCell>
                      <TableCell sx={{ color: '#8571FF', fontWeight: 600 }}>Route</TableCell>
                      <TableCell sx={{ color: '#8571FF', fontWeight: 600 }}>Mode</TableCell>
                      <TableCell align="right" sx={{ color: '#8571FF', fontWeight: 600 }}>
                        CO₂ (kg)
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {row.history.map(entry => {
                      const completedAtLabel = entry.completedAt
                        ? (() => {
                            const parsed = new Date(entry.completedAt as string);
                            return Number.isNaN(parsed.getTime())
                              ? 'Date unavailable'
                              : historyDateFormatter.format(parsed);
                          })()
                        : 'Date unavailable';
                      const co2Label =
                        entry.co2Kg === null || !Number.isFinite(entry.co2Kg)
                          ? '—'
                          : Number(entry.co2Kg).toLocaleString(undefined, { maximumFractionDigits: 1 });
                      const modeLabel = entry.mode ? entry.mode : '—';

                      return (
                        <TableRow key={entry.id} sx={{ '&:last-of-type td, &:last-of-type th': { border: 0 } }}>
                          <TableCell component="th" scope="row">
                            {completedAtLabel}
                          </TableCell>
                          <TableCell>{entry.shipmentName}</TableCell>
                          <TableCell>{entry.route}</TableCell>
                          <TableCell>{modeLabel}</TableCell>
                          <TableCell align="right">{co2Label}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

type ShipperSortKey = 'name' | 'avgCo2PerBidKg' | 'bidsSent' | 'totalSpendUsd' | 'estimateVariancePercent';

const ShipperLeaderboard: React.FC<ShipperLeaderboardProps> = ({ rows }) => {
  const [orderBy, setOrderBy] = useState<ShipperSortKey>('name');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('asc');
  const { preferredCurrency } = useCurrency();

  const handleRequestSort = (property: ShipperSortKey) => {
    if (orderBy === property) {
      setOrderDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderDirection('asc');
    }
    if (orderBy !== property) {
      setOrderBy(property);
    }
  };

  const sortedRows = useMemo(() => {
    const comparator = (a: ShipperInsightRow, b: ShipperInsightRow) => {
      let valueA: string | number;
      let valueB: string | number;

      switch (orderBy) {
        case 'avgCo2PerBidKg': {
          const safeA =
            typeof a.avgCo2PerBidKg === 'number' && Number.isFinite(a.avgCo2PerBidKg)
              ? a.avgCo2PerBidKg
              : Number.NEGATIVE_INFINITY;
          const safeB =
            typeof b.avgCo2PerBidKg === 'number' && Number.isFinite(b.avgCo2PerBidKg)
              ? b.avgCo2PerBidKg
              : Number.NEGATIVE_INFINITY;
          valueA = safeA;
          valueB = safeB;
          break;
        }
        case 'bidsSent':
          valueA = a.bidsSent;
          valueB = b.bidsSent;
          break;
        case 'totalSpendUsd':
          valueA = a.totalSpendUsd;
          valueB = b.totalSpendUsd;
          break;
        case 'estimateVariancePercent': {
          const safeA =
            typeof a.estimateVariancePercent === 'number' && Number.isFinite(a.estimateVariancePercent)
              ? a.estimateVariancePercent
              : Number.NEGATIVE_INFINITY;
          const safeB =
            typeof b.estimateVariancePercent === 'number' && Number.isFinite(b.estimateVariancePercent)
              ? b.estimateVariancePercent
              : Number.NEGATIVE_INFINITY;
          valueA = safeA;
          valueB = safeB;
          break;
        }
        case 'name':
        default:
          valueA = a.name;
          valueB = b.name;
          break;
      }

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return valueA - valueB;
      }

      const stringA = String(valueA).toLowerCase();
      const stringB = String(valueB).toLowerCase();
      return stringA.localeCompare(stringB);
    };

    const stabilized = rows.map((row, index) => ({ row, index }));
    stabilized.sort((a, b) => {
      const order = comparator(a.row, b.row);
      if (order !== 0) {
        return orderDirection === 'asc' ? order : -order;
      }
      return a.index - b.index;
    });
    return stabilized.map(item => item.row);
  }, [rows, orderBy, orderDirection]);

  return (
    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
      <CardContent sx={{ padding: '24px !important' }}>
        <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849' }}>
          Shipper Insights
        </Typography>
        <Typography variant="body2" sx={{ color: '#666', marginTop: '4px' }}>
          Year-to-date performance across submitted estimates.
        </Typography>
        <Box sx={{ overflowX: 'auto', marginTop: '24px' }}>
          <TableContainer
            component={Box}
            sx={{
              minWidth: '880px',
              borderRadius: '12px',
              border: '1px solid #E9EAEB',
              backgroundColor: '#FBFBFD',
              overflow: 'hidden'
            }}
          >
            <Table aria-label="Shipper insights leaderboard">
              <TableHead sx={{ backgroundColor: '#F3F4F8' }}>
                <TableRow>
                  <TableCell sx={{ width: 48 }} />
                  <TableCell
                    sortDirection={orderBy === 'name' ? orderDirection : false}
                    sx={{ color: '#8571FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  >
                    <TableSortLabel
                      active={orderBy === 'name'}
                      direction={orderBy === 'name' ? orderDirection : 'asc'}
                      onClick={() => handleRequestSort('name')}
                      hideSortIcon={false}
                      sx={{
                        color: 'inherit !important',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        '&.Mui-active': { color: '#8571FF !important' },
                        '& .MuiTableSortLabel-icon': { color: '#8571FF !important' }
                      }}
                    >
                      Shipper
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sortDirection={orderBy === 'avgCo2PerBidKg' ? orderDirection : false}
                    sx={{ color: '#8571FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  >
                    <TableSortLabel
                      active={orderBy === 'avgCo2PerBidKg'}
                      direction={orderBy === 'avgCo2PerBidKg' ? orderDirection : 'asc'}
                      onClick={() => handleRequestSort('avgCo2PerBidKg')}
                      hideSortIcon={false}
                      sx={{
                        color: 'inherit !important',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        '&.Mui-active': { color: '#8571FF !important' },
                        '& .MuiTableSortLabel-icon': { color: '#8571FF !important' }
                      }}
                    >
                      Avg CO₂ / Estimate (kg CO₂e)
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sortDirection={orderBy === 'bidsSent' ? orderDirection : false}
                    sx={{ color: '#8571FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  >
                    <TableSortLabel
                      active={orderBy === 'bidsSent'}
                      direction={orderBy === 'bidsSent' ? orderDirection : 'asc'}
                      onClick={() => handleRequestSort('bidsSent')}
                      hideSortIcon={false}
                      sx={{
                        color: 'inherit !important',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        '&.Mui-active': { color: '#8571FF !important' },
                        '& .MuiTableSortLabel-icon': { color: '#8571FF !important' }
                      }}
                    >
                      Estimates Sent (YTD)
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sortDirection={orderBy === 'totalSpendUsd' ? orderDirection : false}
                    sx={{ color: '#8571FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  >
                    <TableSortLabel
                      active={orderBy === 'totalSpendUsd'}
                      direction={orderBy === 'totalSpendUsd' ? orderDirection : 'asc'}
                      onClick={() => handleRequestSort('totalSpendUsd')}
                      hideSortIcon={false}
                      sx={{
                        color: 'inherit !important',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        '&.Mui-active': { color: '#8571FF !important' },
                        '& .MuiTableSortLabel-icon': { color: '#8571FF !important' }
                      }}
                    >
                      Total Spend ({preferredCurrency})
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    align="right"
                    sortDirection={orderBy === 'estimateVariancePercent' ? orderDirection : false}
                    sx={{ color: '#8571FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  >
                    <TableSortLabel
                      active={orderBy === 'estimateVariancePercent'}
                      direction={orderBy === 'estimateVariancePercent' ? orderDirection : 'asc'}
                      onClick={() => handleRequestSort('estimateVariancePercent')}
                      hideSortIcon={false}
                      sx={{
                        color: 'inherit !important',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        '&.Mui-active': { color: '#8571FF !important' },
                        '& .MuiTableSortLabel-icon': { color: '#8571FF !important' }
                      }}
                    >
                      Avg estimate vs. peers
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        No year-to-date estimate activity yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map(row => (
                    <ShipperLeaderboardRow
                      key={row.id}
                      row={row}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const {
    shipments,
    quotes,
    loading,
    error,
    fetchShipments,
    fetchQuotes,
    hasDashboardPreloaded,
    preloadDashboardData,
  } = useDashboardData();
  const chatThreads = useChatStore(state => state.threads);
  const fetchThreads = useChatStore(state => state.fetchThreads);
  const selectThread = useChatStore(state => state.selectThread);
  const chatLoading = useChatStore(state => state.loading);
  const { user, profile, currentOrg } = useAuth();
  const displayName =
    (profile?.full_name || (user as any)?.user_metadata?.full_name || user?.email || 'there') as string;
  const firstName = displayName?.split(' ')[0] || displayName;
  const defaultLogoUrl = (currentOrg as any)?.img_url || '/logo.png';
  const organizationLogoName = (currentOrg as any)?.company?.name || (currentOrg as any)?.name || null;
  const logoUrl = useMemo(() => {
    const matchedLogo = findOrganizationLogoUrl(organizationLogoName);
    return matchedLogo ?? defaultLogoUrl;
  }, [organizationLogoName, defaultLogoUrl]);
  const companyName = (currentOrg as any)?.company?.name || (currentOrg as any)?.name || null;
  const branchName = (currentOrg as any)?.branch_name || null;
  const { formatCurrency, preferredCurrency } = useCurrency();

  const [stats, setStats] = useState<DashboardStats>({
    totalShipments: 0,
    activeShipments: 0,
    totalQuotes: 0,
    activeQuotes: 0,
    activeQuotesWithBids: 0,
    bidCoverageRate: null,
    urgentShipments: 0
  });
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'quotes' | 'shipments'>('quotes');
  const [compareMode, setCompareMode] = useState(false);
  const [compareQuoteId, setCompareQuoteId] = useState<string | null>(null);
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<string | null>(null);
  const [quoteTypeFilter, setQuoteTypeFilter] = useState<string | null>(null);
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (hasDashboardPreloaded) {
      setDashboardLoading(false);
      return;
    }

    let cancelled = false;
    setDashboardLoading(true);
    preloadDashboardData({ silent: true }).finally(() => {
      if (!cancelled) {
        setDashboardLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasDashboardPreloaded, preloadDashboardData]);

  useEffect(() => {
    if (!chatThreads.length && !chatLoading) {
      fetchThreads().catch(err => console.error('Dashboard: fetchThreads failed', err));
    }
  }, [chatThreads.length, chatLoading, fetchThreads]);

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
    const normalized = (status || '').toLowerCase();
    switch (normalized) {
      case 'delivered': return '#0DAB71';
      case 'in_transit': return '#E9932D';
      case 'security_check': return '#2378DA';
      case 'artwork_collected': return '#8412FF';
      case 'local_delivery': return '#B523DA';
      case 'pending':
      case 'checking': return '#B587E8';
      case 'pending_change':
      case 'pending_approval': return '#2378DA';
      case 'cancelled': return '#D94E45';
      default:
        if (normalized === 'draft') return '#666';
        return '#666';
    }
  };

  const recentShipments = shipments
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentQuotes = quotes
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const startOfYear = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1);
  }, []);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    []
  );

  const relativeFormatter = useMemo(() => new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }), []);

  const formatRelativeTime = (value: unknown) => {
    if (!value) return 'No activity';
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) return 'No activity';
    const now = Date.now();
    const diffMs = date.getTime() - now;
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    if (Math.abs(diffMinutes) < 60) {
      return relativeFormatter.format(diffMinutes, 'minute');
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 48) {
      return relativeFormatter.format(diffHours, 'hour');
    }
    const diffDays = Math.round(diffHours / 24);
    return relativeFormatter.format(diffDays, 'day');
  };

  const formatDateLabel = (value: unknown) => {
    if (!value) return '—';
    const parsed = new Date(value as string);
    if (Number.isNaN(parsed.getTime())) return '—';
    return dateFormatter.format(parsed);
  };

  const formatTargetWindow = (start?: unknown, end?: unknown) => {
    if (start && end) {
      return `${formatDateLabel(start)} → ${formatDateLabel(end)}`;
    }
    if (start) return `Target: ${formatDateLabel(start)}`;
    if (end) return `Target: ${formatDateLabel(end)}`;
    return 'Target window: TBD';
  };

  const quoteStatusMeta: Record<string, { color: string; helper: string }> = {
    active: { color: '#00AAAB', helper: 'Visible to partners; bidding open until deadline.' },
    draft: { color: '#666', helper: 'Saved internally; not yet open to partners.' },
    completed: { color: '#0DAB71', helper: 'Awarded and converted to shipment.' },
    cancelled: { color: '#D94E45', helper: 'Closed without award.' },
  };

  const filteredQuotes = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return quotes
      .filter(q => {
        const status = (q.status || '').toLowerCase();
        const type = (q.type || '').toLowerCase();

        if (quoteStatusFilter && status !== quoteStatusFilter) return false;
        if (quoteTypeFilter && type !== quoteTypeFilter) return false;

        if (!search) return true;
        const haystack = [
          q.title,
          q.client_reference,
          q.route,
          q.origin?.name,
          q.destination?.name,
          status,
          type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
  }, [quotes, quoteStatusFilter, quoteTypeFilter, searchTerm]);

  const filteredShipments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return shipments
      .filter(s => {
        const status = (s.status || '').toLowerCase();
        if (shipmentStatusFilter && status !== shipmentStatusFilter) return false;
        if (!search) return true;
        const haystack = [
          s.name,
          s.code,
          s.transport_method,
          s.logistics_partner,
          s.origin?.name,
          s.destination?.name,
          status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
  }, [shipments, shipmentStatusFilter, searchTerm]);

  const upcomingDeadlines = useMemo(() => {
    return filteredQuotes
      .filter(q => q.bidding_deadline || q.target_date_start)
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.bidding_deadline || a.target_date_start || 0).getTime();
        const bDate = new Date(b.bidding_deadline || b.target_date_start || 0).getTime();
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

  const shipmentsByStatus = useMemo(() => {
    const statusOrder = [
      'in_transit',
      'local_delivery',
      'pending',
      'checking',
      'pending_change',
      'pending_approval',
      'artwork_collected',
      'security_check',
      'delivered',
      'cancelled',
    ];

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

  const clearFilters = () => {
    setQuoteStatusFilter(null);
    setQuoteTypeFilter(null);
    setShipmentStatusFilter(null);
    setSearchTerm('');
  };

  const selectedFiltersLabel = useMemo(() => {
    const parts: string[] = [];
    if (viewMode === 'quotes') {
      if (quoteStatusFilter) parts.push(`Status: ${quoteStatusFilter === 'completed' ? 'awarded' : quoteStatusFilter}`);
      if (quoteTypeFilter) parts.push(`Type: ${quoteTypeFilter}`);
    } else {
      if (shipmentStatusFilter) parts.push(`Status: ${shipmentStatusFilter.replace('_', ' ')}`);
    }
    return parts.join(' · ') || 'No filters applied';
  }, [viewMode, quoteStatusFilter, quoteTypeFilter, shipmentStatusFilter]);

  useEffect(() => {
    if (!compareMode) {
      setCompareQuoteId(null);
    }
  }, [compareMode]);

  const shipperInsightsRows = useMemo<ShipperInsightRow[]>(() => {
    if (!Array.isArray(quotes) || quotes.length === 0) {
      return [];
    }

    type BranchAggregate = {
      id: string;
      name: string;
      logoCandidates: Set<string>;
      remoteLogoUrl: string | null;
      totalSpendUsd: number;
      totalCo2Kg: number;
      co2Count: number;
      bidsSent: number;
      peerDiffSum: number;
      peerDiffCount: number;
      history: ShipperHistoryEntry[];
    };

    type NormalizedBid = {
      id: string;
      branchKey: string;
      displayName: string;
      logoCandidates: string[];
      remoteLogoUrl: string | null;
      amount: number;
      co2: number | null;
      submittedAt: Date;
      status: string | null;
    };

    const parseNumber = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const chooseDisplayName = (current: string | null, candidate: string | null) => {
      const sanitizedCurrent = current?.trim() || '';
      const sanitizedCandidate = candidate?.trim() || '';
      if (!sanitizedCurrent || sanitizedCurrent.toLowerCase().includes('unknown')) {
        return sanitizedCandidate || sanitizedCurrent || 'Unknown shipper branch';
      }
      return sanitizedCurrent;
    };

    const formatTransportMode = (value: unknown): string | null => {
      if (typeof value !== 'string' || !value.trim()) return null;
      return value
        .trim()
        .split(/[\s_-]+/)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
    };

    const parseDateValue = (value: unknown): Date | null => {
      if (!value) return null;
      const date = new Date(value as string);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const pickCompletionDate = (shipment: any): Date | null => {
      if (!shipment) return null;
      return (
        parseDateValue(shipment?.delivered_at) ||
        parseDateValue(shipment?.completed_at) ||
        parseDateValue(shipment?.updated_at) ||
        parseDateValue(shipment?.estimated_arrival) ||
        parseDateValue(shipment?.ship_date) ||
        null
      );
    };

    const finalShipmentStatuses = new Set(['delivered']);

    const normalizeBid = (rawBid: any): NormalizedBid | null => {
      if (!rawBid || rawBid.is_draft === true) return null;
      if (typeof rawBid.status === 'string' && rawBid.status.toLowerCase() === 'draft') return null;

      const submittedAtStr = rawBid.submitted_at || rawBid.updated_at || rawBid.created_at;
      if (!submittedAtStr) return null;
      const submittedAt = new Date(submittedAtStr);
      if (Number.isNaN(submittedAt.getTime())) return null;
      if (submittedAt < startOfYear) return null;

      const branchOrg = rawBid.branch_org ?? null;
      const branchOrgId = branchOrg?.id ?? rawBid.branch_org_id ?? null;
      const branchKey = branchOrgId || (rawBid.logistics_partner_id ? `lp:${rawBid.logistics_partner_id}` : null);
      if (!branchKey) return null;

      const branchLabel =
        (typeof branchOrg?.branch_name === 'string' && branchOrg.branch_name.trim()) ||
        (typeof branchOrg?.name === 'string' && branchOrg.name.trim()) ||
        null;

      const partnerOrg = rawBid.logistics_partner?.organization ?? null;
      const partnerName =
        (typeof partnerOrg?.name === 'string' && partnerOrg.name.trim()) ||
        (typeof rawBid.logistics_partner?.name === 'string' && rawBid.logistics_partner.name.trim()) ||
        null;

      const displayName = branchLabel || partnerName || 'Unknown shipper branch';

      const remoteLogoUrl =
        (typeof branchOrg?.img_url === 'string' && branchOrg.img_url.trim()) ||
        (typeof partnerOrg?.img_url === 'string' && partnerOrg.img_url.trim()) ||
        (typeof rawBid.logistics_partner?.logo_url === 'string' && rawBid.logistics_partner.logo_url.trim()) ||
        null;

      const rawCandidates = [
        branchLabel,
        branchOrg?.name ?? null,
        partnerName,
        partnerOrg?.name ?? null,
        rawBid.logistics_partner?.abbreviation ?? null,
      ];
      const logoCandidates = rawCandidates
        .map(candidate => (typeof candidate === 'string' ? candidate.trim() : ''))
        .filter(Boolean);

      const amount = parseNumber(rawBid.amount) ?? 0;
      const co2 = parseNumber(rawBid.co2_estimate);
      const status = typeof rawBid.status === 'string' ? rawBid.status.toLowerCase() : null;

      return {
        id: rawBid.id,
        branchKey,
        displayName,
        logoCandidates,
        remoteLogoUrl,
        amount,
        co2,
        submittedAt,
        status,
      };
    };

    const computePeerDiff = (bid: NormalizedBid, peers: NormalizedBid[]): number | null => {
      const others = peers.filter(peer => peer.branchKey !== bid.branchKey);
      if (others.length === 0) return null;
      const total = others.reduce((sum, peer) => sum + peer.amount, 0);
      if (total === 0) return null;
      const average = total / others.length;
      if (average === 0) return null;
      return ((bid.amount - average) / average) * 100;
    };

    const branchAggregates = new Map<string, BranchAggregate>();

    quotes.forEach(quote => {
      if (!Array.isArray(quote.bids) || quote.bids.length === 0) {
        return;
      }

      const latestByBranch = new Map<string, NormalizedBid>();

      (quote.bids as any[]).forEach(rawBid => {
        const normalized = normalizeBid(rawBid);
        if (!normalized) return;
        const existing = latestByBranch.get(normalized.branchKey);
        if (!existing || existing.submittedAt.getTime() < normalized.submittedAt.getTime()) {
          latestByBranch.set(normalized.branchKey, normalized);
        }
      });

      const normalizedBids = Array.from(latestByBranch.values());
      if (normalizedBids.length === 0) {
        return;
      }

      normalizedBids.forEach(bid => {
        let aggregate = branchAggregates.get(bid.branchKey);

        if (!aggregate) {
          aggregate = {
            id: bid.branchKey,
            name: bid.displayName,
            logoCandidates: new Set<string>(bid.logoCandidates),
            remoteLogoUrl: bid.remoteLogoUrl,
            totalSpendUsd: 0,
            totalCo2Kg: 0,
            co2Count: 0,
            bidsSent: 0,
            peerDiffSum: 0,
            peerDiffCount: 0,
            history: [],
          };
          branchAggregates.set(bid.branchKey, aggregate);
        } else {
          aggregate.name = chooseDisplayName(aggregate.name, bid.displayName);
          if (!aggregate.remoteLogoUrl && bid.remoteLogoUrl) {
            aggregate.remoteLogoUrl = bid.remoteLogoUrl;
          }
          bid.logoCandidates.forEach(candidate => aggregate.logoCandidates.add(candidate));
        }

        aggregate.totalSpendUsd += bid.amount;
        aggregate.bidsSent += 1;

        if (bid.co2 !== null && Number.isFinite(bid.co2)) {
          aggregate.totalCo2Kg += bid.co2;
          aggregate.co2Count += 1;
        }

        const peerDiff = computePeerDiff(bid, normalizedBids);
        if (peerDiff !== null && Number.isFinite(peerDiff)) {
          aggregate.peerDiffSum += peerDiff;
          aggregate.peerDiffCount += 1;
        }

        const shipment = quote.shipment ?? null;
        const shipmentStatus = typeof shipment?.status === 'string' ? shipment.status.toLowerCase() : null;
        const isFinalShipment = shipmentStatus ? finalShipmentStatuses.has(shipmentStatus) : false;
        const isAcceptedBid = bid.status === 'accepted';

        if (shipment && isFinalShipment && isAcceptedBid) {
          const completionDate = pickCompletionDate(shipment);
          if (completionDate && completionDate >= startOfYear) {
            const co2FromShipment = parseNumber(shipment.carbon_estimate);
            const co2Value =
              co2FromShipment !== null && Number.isFinite(co2FromShipment)
                ? Math.round(co2FromShipment * 10) / 10
                : bid.co2 !== null && Number.isFinite(bid.co2)
                ? Math.round(bid.co2 * 10) / 10
                : null;

            aggregate.history.push({
              id: shipment.id || `${quote.id}-${bid.id}`,
              shipmentName: (shipment.name?.trim() || quote.title?.trim() || 'Shipment'),
              route: buildRouteLabel(
                quote.origin?.name ?? null,
                quote.destination?.name ?? null,
                typeof quote.route === 'string' ? quote.route : null
              ),
              co2Kg: co2Value,
              completedAt: completionDate.toISOString(),
              mode: formatTransportMode(shipment.transport_method),
            });
          }
        }
      });
    });

    return Array.from(branchAggregates.values())
      .map(aggregate => {
        const avgCo2 = aggregate.co2Count > 0 ? aggregate.totalCo2Kg / aggregate.co2Count : null;
        const avgVariance =
          aggregate.peerDiffCount > 0 ? aggregate.peerDiffSum / aggregate.peerDiffCount : null;
        const logoKeys = Array.from(aggregate.logoCandidates).filter(Boolean);

        if (aggregate.name) {
          const normalizedName = aggregate.name.trim();
          if (
            normalizedName &&
            !logoKeys.some(key => key.trim().toLowerCase() === normalizedName.toLowerCase())
          ) {
            logoKeys.push(normalizedName);
          }
        }

        return {
          id: aggregate.id,
          name: aggregate.name || 'Unknown shipper branch',
          logoKeys,
          remoteLogoUrl: aggregate.remoteLogoUrl,
          totalSpendUsd: Math.round(aggregate.totalSpendUsd * 100) / 100,
          avgCo2PerBidKg: avgCo2 !== null ? Math.round(avgCo2 * 10) / 10 : null,
          bidsSent: aggregate.bidsSent,
          estimateVariancePercent: avgVariance !== null ? Math.round(avgVariance * 10) / 10 : null,
          history: aggregate.history
            .slice()
            .sort((a, b) => {
              const timeA = a.completedAt ? new Date(a.completedAt).getTime() : -Infinity;
              const timeB = b.completedAt ? new Date(b.completedAt).getTime() : -Infinity;
              return timeB - timeA;
            }),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [quotes, startOfYear]);

  const topShippersByBids = useMemo(() => {
    return shipperInsightsRows
      .slice()
      .sort((a, b) => b.bidsSent - a.bidsSent)
      .slice(0, 3);
  }, [shipperInsightsRows]);

  const selectedCompareQuote = useMemo(
    () => (compareQuoteId ? filteredQuotes.find(q => q.id === compareQuoteId) || null : null),
    [compareQuoteId, filteredQuotes]
  );

  const topThreads = useMemo(() => {
    const quoteTitleMap = new Map<string, string>();
    quotes.forEach(q => {
      if (q.id) {
        const label = q.title || q.client_reference || q.route || 'Quote';
        quoteTitleMap.set(q.id, label);
      }
    });

    return chatThreads
      .slice()
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 3)
      .map(thread => {
        const title =
          (thread.quoteId && quoteTitleMap.get(thread.quoteId)) ||
          (thread.shipmentId ? `Shipment ${thread.shipmentId.slice(0, 6)}` : 'Conversation');
        const sublabel =
          thread.quoteId && quoteTitleMap.get(thread.quoteId)
            ? 'Quote chat'
            : thread.shipmentId
            ? 'Shipment chat'
            : thread.conversationType || 'Chat';
        return {
          id: thread.id,
          title,
          sublabel,
          lastMessageAt: thread.lastMessageAt,
        };
      });
  }, [chatThreads, quotes]);

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
          </motion.div>
        </header>

        <motion.div
          className="main-content"
          style={{ padding: '24px 32px', willChange: 'transform' }}
          initial="hidden"
          animate="show"
          variants={slideInLeft}
        >
          {loading || dashboardLoading || !hasDashboardPreloaded ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              Error loading dashboard data: {error}
            </Alert>
          ) : (
            <Grid container spacing={3}>
              <Grid item xs={12}>
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
                              minWidth: 120,
                            },
                            '& .Mui-selected': {
                              backgroundColor: 'rgba(132, 18, 255, 0.12) !important',
                              borderColor: '#8412FF',
                              color: '#8412FF !important',
                              boxShadow: '0 0 0 1px rgba(132, 18, 255, 0.15)',
                            },
                          }}
                        >
                          <ToggleButton value="quotes" aria-label="Quotes view">
                            <RequestQuoteIcon fontSize="small" sx={{ mr: 1 }} /> Quotes
                          </ToggleButton>
                          <ToggleButton value="shipments" aria-label="Shipments view">
                            <LocalShippingIcon fontSize="small" sx={{ mr: 1 }} /> Shipments
                          </ToggleButton>
                        </ToggleButtonGroup>
                        <Button
                          variant={compareMode ? 'contained' : 'outlined'}
                          size="small"
                          color="secondary"
                          startIcon={<CompareArrowsIcon />}
                          onClick={() => setCompareMode(prev => !prev)}
                          sx={{
                            textTransform: 'none',
                            borderRadius: '12px',
                            padding: '10px 16px',
                            borderWidth: compareMode ? 0 : 1,
                            fontWeight: 700,
                            letterSpacing: 0.2,
                          }}
                        >
                          Compare estimates
                        </Button>
                      </Stack>
                      <Button
                        variant="text"
                        size="small"
                        startIcon={<FilterAltOutlinedIcon />}
                        onClick={clearFilters}
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
                        {viewMode === 'quotes'
                          ? (
                            <>
                              {['active', 'draft', 'completed', 'cancelled'].map(status => (
                                <Tooltip key={status} title={quoteStatusMeta[status]?.helper || ''}>
                                  <Chip
                                    clickable
                                    label={status === 'completed' ? 'Awarded' : status}
                                    size="small"
                                    icon={quoteStatusFilter === status ? <CheckIcon fontSize="small" /> : undefined}
                                    onClick={() => setQuoteStatusFilter(prev => (prev === status ? null : status))}
                                    sx={{
                                      backgroundColor:
                                        quoteStatusFilter === status
                                          ? `${quoteStatusMeta[status]?.color || '#8412FF'}18`
                                          : '#FFFFFF',
                                      color: quoteStatusMeta[status]?.color || '#170849',
                                      border: `2px solid ${(quoteStatusMeta[status]?.color || '#E9EAEB')}70`,
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
                              {['in_transit', 'local_delivery', 'pending', 'checking', 'pending_change', 'delivered'].map(status => (
                                <Chip
                                  key={status}
                                  clickable
                                  label={status.replace('_', ' ')}
                                  size="small"
                                  icon={shipmentStatusFilter === status ? <CheckIcon fontSize="small" /> : undefined}
                                  onClick={() => setShipmentStatusFilter(prev => (prev === status ? null : status))}
                                  sx={{
                                    backgroundColor:
                                      shipmentStatusFilter === status ? `${getStatusColor(status)}20` : '#FFFFFF',
                                    color: getStatusColor(status),
                                    border: `2px solid ${getStatusColor(status)}50`,
                                    textTransform: 'capitalize',
                                    height: 36,
                                    padding: '0 14px',
                                    fontWeight: 600,
                                    boxShadow: shipmentStatusFilter === status ? `0 0 0 2px ${getStatusColor(status)}15` : 'none'
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
              </Grid>

              <Grid item xs={12}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6} lg={3}>
                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box
                            sx={{
                              backgroundColor: 'rgba(0, 170, 171, 0.1)',
                              padding: '12px',
                              borderRadius: '10px',
                              display: 'flex'
                            }}
                          >
                            <RequestQuoteIcon sx={{ color: '#00AAAB', fontSize: '24px' }} />
                          </Box>
                          <Box>
                            <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                              {stats.activeQuotes}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                              Estimates open
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#00AAAB', fontSize: '12px' }}>
                              {stats.totalQuotes} total
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box
                            sx={{
                              backgroundColor: 'rgba(132, 18, 255, 0.1)',
                              padding: '12px',
                              borderRadius: '10px',
                              display: 'flex'
                            }}
                          >
                            <LocalShippingIcon sx={{ color: '#8412FF', fontSize: '24px' }} />
                          </Box>
                          <Box>
                            <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                              {stats.activeShipments}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                              Shipments in motion
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#8412FF', fontSize: '12px' }}>
                              {stats.totalShipments} total
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box
                            sx={{
                              backgroundColor: 'rgba(35, 120, 218, 0.1)',
                              padding: '12px',
                              borderRadius: '10px',
                              display: 'flex'
                            }}
                          >
                            <TrendingUpIcon sx={{ color: '#2378DA', fontSize: '24px' }} />
                          </Box>
                          <Box>
                            <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                              {stats.bidCoverageRate === null ? '—' : `${Math.round(stats.bidCoverageRate * 100)}%`}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                              Estimate coverage
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#00AAAB', fontSize: '12px' }}>
                              {stats.activeQuotes === 0
                                ? 'No active quotes'
                                : `${stats.activeQuotesWithBids} of ${stats.activeQuotes} have estimates`}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)' }}>
                      <CardContent sx={{ padding: '20px !important' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box
                            sx={{
                              backgroundColor: 'rgba(217, 78, 69, 0.1)',
                              padding: '12px',
                              borderRadius: '10px',
                              display: 'flex'
                            }}
                          >
                            <AssignmentLateIcon sx={{ color: '#D94E45', fontSize: '24px' }} />
                          </Box>
                          <Box>
                            <Typography variant="h4" sx={{ fontWeight: 500, color: '#170849', marginBottom: '4px' }}>
                              {stats.urgentShipments}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#666', fontSize: '14px' }}>
                              Items needing attention
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#D94E45', fontSize: '12px' }}>
                              late or shipping soon
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Grid>

              <Grid item xs={12} lg={8}>
                {viewMode === 'quotes' ? (
                  <Stack spacing={2}>
                    {compareMode && (
                      <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.08)' }}>
                        <CardContent sx={{ padding: '20px !important' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849' }}>
                              Compare estimates (per request)
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                              Select one estimate request and review submitted estimates side by side
                            </Typography>
                          </Box>
                          {!selectedCompareQuote ? (
                            <Typography variant="body2" sx={{ color: '#666' }}>
                              Choose an estimate above to compare its submitted estimates (amount, CO₂, transit).
                            </Typography>
                          ) : (
                            (() => {
                              const estimates = Array.isArray(selectedCompareQuote.bids)
                                ? selectedCompareQuote.bids.filter((bid: any) => bid && bid.is_draft !== true)
                                : [];
                              const sortedEstimates = estimates
                                .slice()
                                .sort((a: any, b: any) => (Number(a.amount) || 0) - (Number(b.amount) || 0))
                                .slice(0, 4);

                              return sortedEstimates.length === 0 ? (
                                <Typography variant="body2" sx={{ color: '#666' }}>
                                  No estimates submitted yet. Invite partners or wait for submissions.
                                </Typography>
                              ) : (
                                <Grid container spacing={2}>
                                  {sortedEstimates.map((estimate: any, idx: number) => {
                                    const amount = Number(estimate.amount);
                                    const co2 = Number(estimate.co2_estimate);
                                    const transit = estimate.estimated_transit_time ?? '';
                                    const partnerName =
                                      estimate.logistics_partner?.name ||
                                      estimate.logistics_partner?.organization?.name ||
                                      estimate.branch_org?.name ||
                                      'Partner';
                                    return (
                                      <Grid item xs={12} md={6} key={estimate.id || idx}>
                                        <Box
                                          sx={{
                                            backgroundColor: '#FCFCFD',
                                            border: '1px solid #E9EAEB',
                                            borderRadius: '10px',
                                            padding: '14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 1
                                          }}
                                        >
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#170849' }}>
                                              {partnerName}
                                            </Typography>
                                            <Chip
                                              label={estimate.status || 'pending'}
                                              size="small"
                                              sx={{
                                                backgroundColor: 'rgba(0,170,171,0.12)',
                                                color: '#008A8B',
                                                border: '1px solid rgba(0,170,171,0.25)',
                                                textTransform: 'capitalize'
                                              }}
                                            />
                                          </Box>
                                          <Divider />
                                          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                                            <Box>
                                              <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                                Amount
                                              </Typography>
                                              <Typography variant="body1" sx={{ fontWeight: 700, color: '#170849' }}>
                                                {Number.isFinite(amount) ? formatCurrency(amount) : '—'}
                                              </Typography>
                                            </Box>
                                            <Box>
                                              <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                                CO₂ estimate
                                              </Typography>
                                              <Typography variant="body1" sx={{ fontWeight: 700, color: '#170849' }}>
                                                {Number.isFinite(co2) ? `${co2.toFixed(1)} kg` : '—'}
                                              </Typography>
                                            </Box>
                                            <Box>
                                              <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                                Transit time
                                              </Typography>
                                              <Typography variant="body1" sx={{ fontWeight: 700, color: '#170849' }}>
                                                {transit || '—'}
                                              </Typography>
                                            </Box>
                                            <Box>
                                              <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                                Submitted
                                              </Typography>
                                              <Typography variant="body1" sx={{ fontWeight: 700, color: '#170849' }}>
                                                {formatDateLabel(estimate.submitted_at || estimate.updated_at || estimate.created_at)}
                                              </Typography>
                                            </Box>
                                          </Box>
                                        </Box>
                                      </Grid>
                                    );
                                  })}
                                </Grid>
                              );
                            })()
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {filteredQuotes.length === 0 ? (
                      <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.06)' }}>
                        <CardContent sx={{ padding: '24px !important' }}>
                          <Typography variant="body2" sx={{ color: '#666' }}>
                            No quotes match the current filters. Try clearing filters or switching views.
                          </Typography>
                        </CardContent>
                      </Card>
                    ) : (
                      filteredQuotes.map(quote => {
                        const bids = Array.isArray(quote.bids)
                          ? quote.bids.filter((bid: any) => bid && bid.is_draft !== true)
                          : [];
                        const bidAmounts = bids
                          .map((bid: any) => Number(bid.amount))
                          .filter((amount: number) => Number.isFinite(amount));
                        const bestBid = bidAmounts.length ? Math.min(...bidAmounts) : null;
                        const bidCount = bids.length;
                        const deadlineLabel = formatDateLabel(quote.bidding_deadline);
                        const status = (quote.status || 'draft').toLowerCase();
                        const statusColor = quoteStatusMeta[status]?.color || '#170849';
                        const typeLabel = (quote.type || '').toString();
                        const routeLabel = buildRouteLabel(
                          quote.origin?.name ?? null,
                          quote.destination?.name ?? null,
                          typeof quote.route === 'string' ? quote.route : null
                        );
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
                                    {quote.title || quote.client_reference || 'Untitled quote'}
                                  </Typography>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                                    <Tooltip title={quoteStatusMeta[status]?.helper || ''}>
                                      <Chip
                                        label={status === 'completed' ? 'Awarded' : status}
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
                                    {quote.shipment_id ? (
                                      <Chip
                                        label="Linked to shipment"
                                        size="small"
                                        clickable
                                        onClick={() => setViewMode('shipments')}
                                        sx={{
                                          backgroundColor: 'rgba(35, 120, 218, 0.08)',
                                          color: '#2378DA',
                                          border: '1px solid rgba(35, 120, 218, 0.3)'
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
                                  {compareMode && (
                                    <Chip
                                      label={isSelected ? 'Comparing estimates' : 'Compare estimates'}
                                      size="small"
                                      onClick={() => setCompareQuoteId(prev => (prev === quote.id ? null : quote.id))}
                                      clickable
                                      sx={{
                                        backgroundColor: isSelected ? 'rgba(132, 18, 255, 0.15)' : '#FCFCFD',
                                        color: isSelected ? '#8412FF' : '#170849',
                                        border: isSelected ? '1px solid rgba(132, 18, 255, 0.4)' : '1px solid #E9EAEB',
                                        fontWeight: 600
                                      }}
                                    />
                                  )}
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => navigate(`/estimates/${quote.id}/bids`)}
                                    sx={{ textTransform: 'none' }}
                                  >
                                    View estimates
                                  </Button>
                                </Stack>
                              </Box>

                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                <Chip
                                  label={routeLabel}
                                  clickable
                                  size="small"
                                  onClick={() => setSearchTerm(routeLabel)}
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
                                <Tooltip title="Deadline partners see for estimate submissions">
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
                                  <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                    {preferredCurrency} preferred
                                  </Typography>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                  <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                    Reference
                                  </Typography>
                                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#170849' }}>
                                    {quote.client_reference || '—'}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                    {quote.type === 'auction' ? 'Auction' : 'Requested'}
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
                            No shipments match the current filters. Switch back to quotes or clear filters.
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
                                  backgroundColor: `${getStatusColor(group.status)}10`,
                                  color: getStatusColor(group.status),
                                  border: `1px solid ${getStatusColor(group.status)}30`,
                                  textTransform: 'capitalize'
                                }}
                              />
                              <Typography variant="body2" sx={{ color: '#8C87A6' }}>
                                {group.items.length} item{group.items.length === 1 ? '' : 's'}
                              </Typography>
                            </Box>
                            <Divider />
                            <Stack spacing={1.5}>
                              {group.items.map(item => {
                                const arrivalLabel = formatDateLabel(item.estimated_arrival || item.ship_date);
                                const routeLabel = buildRouteLabel(
                                  item.origin?.name ?? null,
                                  item.destination?.name ?? null,
                                  typeof item.route === 'string' ? item.route : null
                                );
                                return (
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
                                        {routeLabel}
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
                                            clickable
                                            onClick={() => {
                                              setShipmentStatusFilter(item.status || null);
                                              setViewMode('shipments');
                                            }}
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
                                        {arrivalLabel}
                                      </Typography>
                                      {item.carbon_estimate ? (
                                        <Typography variant="caption" sx={{ color: '#00AAAB', display: 'block' }}>
                                          {Number(item.carbon_estimate).toFixed(1)} kg CO₂e
                                        </Typography>
                                      ) : null}
                                    </Box>
                                  </Box>
                                );
                              })}
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
                    <CardContent sx={{ padding: '20px !important', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849' }}>
                        Messaging
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        Top conversations you’re active in. Open a chat or start a new one.
                      </Typography>
                      {topThreads.length === 0 ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => navigate('/messages')}
                            sx={{ textTransform: 'none', backgroundColor: '#8412FF', '&:hover': { backgroundColor: '#730ADD' } }}
                          >
                            Open messages
                          </Button>
                        </Stack>
                      ) : (
                        <Stack spacing={1.25}>
                          {topThreads.map(thread => (
                            <Box
                              key={thread.id}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                border: '1px solid #E9EAEB',
                                borderRadius: '10px',
                                padding: '10px 12px',
                                backgroundColor: '#FCFCFD'
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {thread.title}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                  {thread.sublabel} · {formatRelativeTime(thread.lastMessageAt)}
                                </Typography>
                              </Box>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={async () => {
                                  try {
                                    await selectThread(thread.id);
                                  } catch (err) {
                                    console.error('selectThread failed', err);
                                  }
                                  navigate('/messages');
                                }}
                                sx={{ textTransform: 'none' }}
                              >
                                Open chat
                              </Button>
                            </Box>
                          ))}
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => navigate('/messages')}
                            sx={{ textTransform: 'none', backgroundColor: '#8412FF', '&:hover': { backgroundColor: '#730ADD' }, width: 'fit-content' }}
                          >
                            Open inbox
                          </Button>
                        </Stack>
                      )}
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.1)' }}>
                    <CardContent sx={{ padding: '20px !important' }}>
                      <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', mb: 1 }}>
                        Upcoming deadlines
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
                                {quote.title || quote.client_reference || 'Quote'}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#666' }}>
                                {formatTargetWindow(quote.target_date_start, quote.target_date_end)}
                              </Typography>
                              <Chip
                                label="View quote"
                                size="small"
                                clickable
                                onClick={() => navigate(`/estimates/${quote.id}/bids`)}
                                sx={{
                                  width: 'fit-content',
                                  backgroundColor: 'rgba(0, 170, 171, 0.08)',
                                  color: '#00AAAB',
                                  border: '1px solid rgba(0, 170, 171, 0.2)',
                                  textTransform: 'none'
                                }}
                              />
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                Estimate deadline
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                {formatDateLabel(quote.bidding_deadline || quote.target_date_start)}
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
                                {buildRouteLabel(
                                  item.origin?.name ?? null,
                                  item.destination?.name ?? null,
                                  typeof item.route === 'string' ? item.route : null
                                )}
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
                                clickable
                                onClick={() => setShipmentStatusFilter(item.status || null)}
                                sx={{
                                  mt: 0.5,
                                  backgroundColor: `${getStatusColor(item.status)}10`,
                                  color: getStatusColor(item.status),
                                  border: `1px solid ${getStatusColor(item.status)}30`,
                                  textTransform: 'capitalize'
                                }}
                              />
                            </Box>
                          </Box>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.1)' }}>
                    <CardContent sx={{ padding: '20px !important' }}>
                      <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', mb: 1 }}>
                        Top shippers (engagement)
                      </Typography>
                      {topShippersByBids.length === 0 ? (
                        <Typography variant="body2" sx={{ color: '#666' }}>
                          No shipper activity yet.
                        </Typography>
                      ) : (
                        <Stack spacing={1.5}>
                          {topShippersByBids.map(shipper => (
                            <Box
                              key={shipper.id}
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                border: '1px solid #E9EAEB',
                                borderRadius: '10px',
                                padding: '10px 12px',
                                backgroundColor: '#FCFCFD'
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                  {shipper.name}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#8C87A6' }}>
                                  {shipper.bidsSent} estimates | {shipper.avgCo2PerBidKg !== null ? `${shipper.avgCo2PerBidKg.toFixed(1)} kg CO₂e` : 'CO₂ n/a'}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
                                {formatCurrency(shipper.totalSpendUsd)}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: '12px', boxShadow: '0 0 40px rgba(10, 13, 18, 0.1)' }}>
                    <CardContent sx={{ padding: '20px !important' }}>
                      <Typography variant="h6" sx={{ fontWeight: 500, color: '#170849', mb: 1 }}>
                        Shipment status overview
                      </Typography>
                      {shipments.length === 0 ? (
                        <Typography variant="body2" sx={{ color: '#666' }}>
                          No shipments to display.
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {Object.entries(
                            shipments.reduce((acc, shipment) => {
                              const key = shipment.status || 'unknown';
                              acc[key] = (acc[key] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>)
                          ).map(([status, count]) => (
                            <Chip
                              key={status}
                              label={`${status.replace('_', ' ')} (${count})`}
                              size="small"
                              clickable
                              onClick={() => {
                                setShipmentStatusFilter(status);
                                setViewMode('shipments');
                              }}
                              sx={{
                                backgroundColor: `${getStatusColor(status)}10`,
                                color: getStatusColor(status),
                                border: `1px solid ${getStatusColor(status)}30`,
                                textTransform: 'capitalize'
                              }}
                            />
                          ))}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Stack>
              </Grid>
            </Grid>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard; 
