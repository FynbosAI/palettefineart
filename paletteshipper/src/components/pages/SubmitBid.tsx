import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button, TextField, FormControl, Chip, IconButton, Box, Typography, Paper, InputAdornment, Avatar, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Divider, Select, MenuItem, OutlinedInput, InputLabel } from '@mui/material';
import { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SecurityIcon from '@mui/icons-material/Security';
import CloseIcon from '@mui/icons-material/Close';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SendIcon from '@mui/icons-material/Send';
import CheckIcon from '@mui/icons-material/Check';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import FlightIcon from '@mui/icons-material/Flight';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DriveEtaIcon from '@mui/icons-material/DriveEta';
import HandymanIcon from '@mui/icons-material/Handyman';
import HomeIcon from '@mui/icons-material/Home';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ScheduleIcon from '@mui/icons-material/Schedule';
import WeekendIcon from '@mui/icons-material/Weekend';
import BuildIcon from '@mui/icons-material/Build';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import ShieldIcon from '@mui/icons-material/Shield';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import DescriptionIcon from '@mui/icons-material/Description';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import BadgeIcon from '@mui/icons-material/Badge';
import NatureIcon from '@mui/icons-material/Nature';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useNavigate, useParams } from 'react-router-dom';
import { useBidForm } from '../../hooks/useBidForm';
import { useQuoteDetails, useLoadingState, useQuotes, useContactableShippers, useBids, useAuth } from '../../hooks/useStoreSelectors';
import useCurrency from '../../hooks/useCurrency';
import { supabase } from '../../lib/supabase';
import { QuoteService } from '../../services/QuoteService';
import { BidService } from '../../services/BidService';
import {
  checkLetterheadAvailability,
  exportEstimatePdf,
  type ExportEstimatePayload,
  type ExportLineItemPayload,
} from '../../services/EstimateExportService';
import type { BidLineItem } from '../../services/BidService';
import useChatStore from '../../store/chatStore';
import { useDeadlineCountdown } from '../../lib/deadline';
import RouteMap from '../Map';
import CountdownClock from '../../../../shared/ui/CountdownClock';
import EstimateExclusionsNotice from '../../../../shared/ui/EstimateExclusionsNotice';
import ShipperAvatar from '../ShipperAvatar';
import { findOrganizationLogoUrl } from '../../lib/organizationLogos';
import { extractLocationCoordinates } from '../../lib/locationCoordinates';
import { motion, AnimatePresence } from 'motion/react';
import { SUB_LINE_ITEMS, type EstimateLineItemId } from '../../constants/estimateLineItems';

interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: number;
  description: string;
  imageUrl: string;
  value: number;
  dimensions: string;
  medium: string;
  weight: string;
  weightValue?: number | null;
  weightUnit?: string | null;
  volumetricWeightValue?: number | null;
  volumetricWeightUnit?: string | null;
  countryOfOrigin: string;
  currentCustomsStatus: string;
  tariffCode: string;
  crating: string;
  specialRequirements: any;
  category?: string | null;
  itemType?: string | null;
  period?: string | null;
  hasExistingCrate?: boolean | null;
  imageStatus?: 'empty' | 'loading' | 'ready' | 'error';
  imageError?: string | null;
  imageStorageValue?: string | null;
}

interface QuoteArtworkRecord {
  id: string;
  quote_id: string;
  name: string;
  artist_name?: string;
  year_completed?: number;
  medium?: string;
  dimensions?: string;
  weight?: string;
  weight_value?: number | null;
  weight_unit?: string | null;
  volumetric_weight_value?: number | null;
  volumetric_weight_unit?: string | null;
  declared_value?: number;
  crating?: string;
  has_existing_crate?: boolean | null;
  category?: string | null;
  item_type?: string | null;
  period?: string | null;
  description?: string;
  image_url?: string | null;
  tariff_code?: string;
  country_of_origin?: string;
  export_license_required?: boolean;
  special_requirements?: any;
}

type ArtworkImageCacheEntry = {
  url: string;
  expiresAt: number | null;
  legacy: boolean;
  error: string | null;
};

const CM_PER_INCH = 2.54;

type DimensionUnit = 'cm' | 'inches';

type TransportMethodKey = 'air' | 'sea' | 'ground';

const normalizeTransportValue = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const firstString = value.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
    return firstString ?? null;
  }
  return null;
};

const mapTransportKeyword = (value: string): TransportMethodKey | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/(sea|ocean|maritime|vessel|ship|port|freighter)/.test(normalized)) return 'sea';
  if (/(ground|road|truck|rail|land|courier|shuttle|white\s?glove|van|surface)/.test(normalized)) return 'ground';
  if (/(air|flight|plane|jet|express|airport)/.test(normalized)) return 'air';
  return null;
};

const inferTransportMethodFromQuote = (quote: any): TransportMethodKey | null => {
  if (!quote) return null;
  const candidates: unknown[] = [
    quote.requirements?.transport_method,
    quote.requirements?.transport_mode,
    quote.requirements?.transport_type,
    quote.delivery_specifics?.transport_method,
    quote.delivery_specifics?.transport_mode,
    quote.delivery_specifics?.transport_type,
  ];

  for (const candidate of candidates) {
    const raw = normalizeTransportValue(candidate);
    const mapped = raw ? mapTransportKeyword(raw) : null;
    if (mapped) return mapped;
  }

  return null;
};

const getTransportMethodLabel = (method: TransportMethodKey | null) => {
  switch (method) {
    case 'air':
      return 'Air';
    case 'sea':
      return 'Sea';
    case 'ground':
      return 'Ground';
    default:
      return 'TBD';
  }
};

const getTransportMethodIcon = (method: TransportMethodKey | null) => {
  switch (method) {
    case 'sea':
      return <DirectionsBoatIcon sx={{ color: '#364152' }} />;
    case 'ground':
      return <DriveEtaIcon sx={{ color: '#364152' }} />;
    default:
      return <FlightIcon sx={{ color: '#364152' }} />;
  }
};

const parseDimensionValues = (raw: string): number[] => {
  if (!raw) return [];
  const matches = raw.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches
    .map((value) => {
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    })
    .filter((value): value is number => value !== null);
};

const detectSourceUnit = (raw: string): 'cm' | 'in' => {
  if (!raw) return 'cm';
  if (/\b(in|inch|inches)\b|["″”]/i.test(raw)) {
    return 'in';
  }
  return 'cm';
};

const formatConvertedNumber = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return parseFloat(rounded.toFixed(2)).toString();
};

const convertDimensionsForUnit = (raw: string | undefined, unit: DimensionUnit): string | undefined => {
  if (!raw) return raw;
  const values = parseDimensionValues(raw);
  if (values.length === 0) {
    return raw.trim();
  }

  const sourceUnit = detectSourceUnit(raw);
  const valuesInCm = values.map((value) => (sourceUnit === 'cm' ? value : value * CM_PER_INCH));
  const converted = valuesInCm.map((cmValue) =>
    unit === 'cm' ? formatConvertedNumber(cmValue) : formatConvertedNumber(cmValue / CM_PER_INCH)
  );
  const unitLabel = unit === 'cm' ? 'cm' : 'in';
  return `${converted.join(' × ')} ${unitLabel}`;
};

interface QuoteRequest {
  id: string;
  title: string;
  code: string;
  gallery: string;
  galleryOrgId?: string | null;
  type: 'auction' | 'direct';
  status: 'open' | 'closing_soon';
  route: string;
  origin: string;
  destination: string;
  targetDate: string;
  pickupDate: string;
  auctionDeadline?: string;
  artworkCount: number;
  totalValue: number;
  specialRequirements: string[];
  description: string;
  currentBids: number;
  timeLeft: string;
  estimatedDistance: string;
  transportMode: string;
  insurance: string;
  autoCloseBidding: boolean;
  shipmentId?: string | null;
}

interface SubLineItem {
  id: string;
  name: string;
  cost: number;
}

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const fractulFontStack = "'Fractul', 'Helvetica Neue', Arial, sans-serif";
const createMenuProps = (width: number) => ({
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width
    },
    sx: {
      fontFamily: fractulFontStack
    }
  }
});

const defaultMenuProps = createMenuProps(420);

const toTitleCase = (value: string): string => {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeLabel = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, '\'')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
};

const normalizeToArray = (input: any): string[] => {
  if (input == null) return [];
  if (Array.isArray(input)) return input.map(String);
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    return input.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (typeof input === 'object') return Object.values(input).map(String);
  return [String(input)];
};


type FeedbackVariant = 'success' | 'warning' | 'error';

interface FeedbackNotice {
  id: number;
  variant: FeedbackVariant;
  title: string;
  description?: string;
  details?: string[];
  autoHideMs?: number;
  onDismiss?: () => void;
}

const FEEDBACK_VARIANT_VISUALS: Record<FeedbackVariant, { accent: string; surface: string; icon: React.ReactNode }> = {
  success: {
    accent: '#0DAB71',
    surface: 'rgba(13, 171, 113, 0.12)',
    icon: <CheckIcon sx={{ fontSize: 20 }} />,
  },
  warning: {
    accent: '#FFB020',
    surface: 'rgba(255, 176, 32, 0.12)',
    icon: <WarningAmberRoundedIcon sx={{ fontSize: 20 }} />,
  },
  error: {
    accent: '#D94E45',
    surface: 'rgba(217, 78, 69, 0.12)',
    icon: <ErrorOutlineIcon sx={{ fontSize: 20 }} />,
  },
};

interface SubmissionFeedbackCardProps {
  notice: FeedbackNotice;
  onClose: () => void;
}

const SubmissionFeedbackCard: React.FC<SubmissionFeedbackCardProps> = ({ notice, onClose }) => {
  const visuals = FEEDBACK_VARIANT_VISUALS[notice.variant];

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <motion.div
      key={notice.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1800,
        pointerEvents: 'none',
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(17, 12, 58, 0.24)',
          backdropFilter: 'blur(1.5px)',
          pointerEvents: 'auto',
        }}
      />
      <motion.div
        initial={{ y: 28, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 28, scale: 0.94, opacity: 0 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          bottom: '32px',
          right: '32px',
          width: 'min(380px, calc(100vw - 32px))',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '22px',
            border: `1.4px solid ${visuals.accent}`,
            background: '#FFFFFF',
            boxShadow: '0 26px 52px rgba(17, 12, 58, 0.23)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(135deg, ${visuals.surface}, rgba(255,255,255,0.75))`,
              opacity: 0.85,
            }}
          />
          <div
            style={{
              position: 'relative',
              padding: '22px 24px 22px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '16px',
                background: visuals.surface,
                border: `1px solid ${visuals.accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: visuals.accent,
                boxShadow: '0 10px 24px rgba(17, 12, 58, 0.18)',
                flexShrink: 0,
              }}
            >
              {visuals.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: fractulFontStack,
                  fontWeight: 800,
                  fontSize: '16px',
                  letterSpacing: '0.25px',
                  color: '#170849',
                  lineHeight: 1.45,
                }}
              >
                {notice.title}
              </div>
              {notice.description ? (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: '13px',
                    color: '#58517E',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {notice.description}
                </div>
              ) : null}
              {notice.details && notice.details.length > 0 ? (
                <ul
                  style={{
                    margin: '10px 0 0',
                    paddingLeft: '20px',
                    color: '#4F4B73',
                    fontSize: '13px',
                    lineHeight: 1.6,
                  }}
                >
                  {notice.details.map((detail) => (
                    <li key={detail} style={{ marginBottom: 4 }}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                color: '#58517E',
                '&:hover': {
                  color: '#170849',
                  background: 'rgba(23, 8, 73, 0.08)',
                },
              }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

const DEFAULT_LOGO_URL = '/logo.png';

const deriveInitials = (label: string): string => {
  const trimmed = (label || '').trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase();
  }
  return parts.map(part => part[0]?.toUpperCase() || '').join('').slice(0, 3) || parts[0].slice(0, 2).toUpperCase();
};

const resolveLocalAgentLogo = (shipper: any) => {
  const candidateNames = new Set<string>();
  if (shipper?.name) {
    const normalized = String(shipper.name).trim();
    if (normalized) {
      candidateNames.add(normalized);
      normalized
        .split(/[—–-]/)
        .map((part: string) => part.trim())
        .filter(Boolean)
        .forEach((part: string) => candidateNames.add(part));
    }
  }

  if (shipper?.contact_name) {
    candidateNames.add(String(shipper.contact_name).trim());
  }

  let localLogo: string | null = null;
  for (const candidate of candidateNames) {
    localLogo = findOrganizationLogoUrl(candidate);
    if (localLogo) break;
  }

  const primaryLogo = localLogo ?? DEFAULT_LOGO_URL;
  const fallbackLogo = localLogo ? DEFAULT_LOGO_URL : undefined;

  return {
    primaryLogo,
    fallbackLogo,
    localLogo,
  };
};

const DELIVERY_SPECIFICS_ALIAS_MAP = {
  delivery_requirements: {
    'white glove service': 'white_glove_service',
  },
  packing_requirements: {
    'museum-quality crate': 'museum_crate_full',
    'museum quality crate': 'museum_crate_full',
    'climate controlled crate': 'climate_controlled_crate',
    't-frame (paintings)': 't_frame',
    't frame (paintings)': 't_frame',
    't-frame': 't_frame',
    't frame': 't_frame',
  },
  safety_security_requirements: {
    'air ride suspension vehicle': 'air_ride_suspension_vehicle',
    'signature on delivery': 'signature_on_delivery',
    'fixed delivery address': 'fixed_delivery_address',
  },
} as const;

const buildSubItemLookup = () => {
  const lookup: Record<string, Record<string, string>> = {};

  Object.entries(SUB_LINE_ITEMS).forEach(([lineItemId, items]) => {
    lookup[lineItemId] = {};
    items.forEach((item) => {
      lookup[lineItemId][normalizeLabel(item.name)] = item.id;
    });
  });

  Object.entries(DELIVERY_SPECIFICS_ALIAS_MAP).forEach(([lineItemId, aliasMap]) => {
    const base = lookup[lineItemId] || (lookup[lineItemId] = {});
    Object.entries(aliasMap).forEach(([alias, id]) => {
      base[normalizeLabel(alias)] = id;
    });
  });

  return lookup;
};

const SUB_ITEM_LOOKUP = buildSubItemLookup();

const DELIVERY_SPECIFICS_TO_LINE_ITEM = {
  delivery_requirements: 'delivery_requirements',
  packing_requirements: 'packing_requirements',
  access_requirements: 'access_at_delivery',
  safety_security_requirements: 'safety_security_requirements',
  condition_check_requirements: 'condition_check_requirements',
} as const;

type LineItemKey = EstimateLineItemId;
type DeliverySpecificsKey = keyof typeof DELIVERY_SPECIFICS_TO_LINE_ITEM;

const normalizeSpecialRequirements = (requirements: any): string[] => {
  if (!requirements) return [];

  if (typeof requirements === 'string') {
    return requirements.trim() ? [requirements.trim()] : [];
  }

  if (Array.isArray(requirements)) {
    return requirements
      .flatMap((item) => {
        if (!item) return [];
        if (typeof item === 'string') {
          return item.trim() ? [item.trim()] : [];
        }
        if (typeof item === 'object') {
          return Object.entries(item)
            .filter(([, value]) => Boolean(value))
            .map(([key, value]) => (typeof value === 'string' && value.trim() ? value.trim() : toTitleCase(key)));
        }
        return [String(item)];
      })
      .map((label) => label.trim())
      .filter((label) => label.length > 0);
  }

  if (typeof requirements === 'object') {
    return Object.entries(requirements)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => (typeof value === 'string' && value.trim() ? value.trim() : toTitleCase(key)))
      .filter((label) => label.length > 0);
  }

  return [];
};

const SubmitBid = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get quote data from store
  const { quote, bidForQuote, hasBid } = useQuoteDetails(id || null);
  const { loading } = useLoadingState();
  const { fetchQuoteDetails } = useQuotes();
  const { confirmBid, withdrawBid } = useBids();
  const { organization } = useAuth();
  const { formatCurrency, currencySymbol, preferredCurrency, convertAmount } = useCurrency();
  const formatEstimateCurrency = useCallback(
    (amount: number | null | undefined) =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: preferredCurrency,
        minimumFractionDigits: Math.abs(Number(amount ?? 0)) < 1 ? 2 : 0,
        maximumFractionDigits: 2
      }).format(Number.isFinite(amount as number) ? (amount as number) : 0),
    [preferredCurrency]
  );
  
  // Use the bid form hook for form management
  const bidForm = useBidForm({ quoteId: id || '' });
  const { 
    lineItems,
    selectedSubItems,
    specialServices,
    notes,
    validUntil,
    estimatedTransitTime,
    handleLineItemCostChange,
    handleSubItemToggle,
    setSpecialServices,
    setNotes,
    setValidUntil,
    setEstimatedTransitTime,
    calculateTotal,
    handleSaveDraft,
    handleSubmit,
    setLineItemsState,
    setSelectedSubItemsState,
    setCustomLineItemsState,
    hydrateFromBid
  } = bidForm;
  const theme = useTheme();
  
  // Determine if this is a bid (auction) or quote (direct) submission
  const isAuction = window.location.pathname.includes('/bid');
  const isDirect = window.location.pathname.includes('/quote');
  const hasExistingEstimate = Boolean(bidForQuote);
  const estimateActionLabel = hasExistingEstimate ? 'Update Estimate' : 'Prepare Estimate';
  const [selectedSubItemsLocal, setSelectedSubItemsLocal] = useState<{[key: string]: string[]}>({
    '1': [],
    '2': [],
    '3': [],
    '4': []
  });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [letterheadAvailable, setLetterheadAvailable] = useState<boolean | null>(null);
  const [letterheadChecking, setLetterheadChecking] = useState(false);
  const [letterheadMessage, setLetterheadMessage] = useState<string | null>(null);
  const letterheadBypassEnabled = useMemo(
    () => import.meta.env.VITE_BYPASS_LETTERHEAD === 'true' || window.location.hostname === 'localhost',
    []
  );

  const exportButtonDisabled =
    exportingPdf || letterheadChecking || (!letterheadBypassEnabled && letterheadAvailable === false) || !organization?.id;
  const exportHelperText = (() => {
    if (letterheadChecking) return 'Checking for branch letterhead...';
    if (letterheadAvailable === false) {
      return letterheadMessage || 'No letterhead found for this branch. Contact support to upload your letterhead.';
    }
    if (!organization?.id) return 'Select a branch to enable exports.';
    return null;
  })();
  
  const manualClose = quote?.auto_close_bidding === false;
  const deadlineState = useDeadlineCountdown(quote?.bidding_deadline ?? null, {
    manualClose,
    closedLabel: 'Bidding closed',
    manualLabel: 'Manual close',
  });
  
  const deadlineAccentColor = manualClose
    ? 'rgba(23, 8, 73, 0.7)'
    : deadlineState.isExpired
      ? '#D94E45'
      : deadlineState.urgency === 'critical'
        ? '#D94E45'
        : deadlineState.urgency === 'warning'
          ? '#E9932D'
          : '#170849';
  const deadlineMessage = manualClose
    ? 'Gallery will close estimates manually'
    : deadlineState.isExpired
      ? 'Deadline passed'
      : `Deadline: ${deadlineState.label}`;
  const deadlineExpiredForSubmission = !manualClose && deadlineState.isExpired;
  
  // Tab state for switching between bid and message
  const [activeTab, setActiveTab] = useState<number>(0);
  // Pagination state for right pane lists
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 4;
  
  // Message mode state (client or agent)
  const [messageMode, setMessageMode] = useState<'client' | 'agent'>('client');
  const [selectedShipper, setSelectedShipper] = useState<string>('');
  // Filter scope for shipper chat
  const [shipperScope, setShipperScope] = useState<'origin' | 'destination'>('origin');
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>('cm');
  const [isBidModalOpen, setIsBidModalOpen] = useState<boolean>(false);
  const [bidModalInfoTab, setBidModalInfoTab] = useState<'summary' | 'artworks'>('summary');
  const [hasAppliedDeliverySpecifics, setHasAppliedDeliverySpecifics] = useState(false);

  const messageButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '999px',
    padding: '8px 18px',
    color: '#00aaab',
    borderColor: '#00aaab',
    '&:hover': {
      borderColor: '#008a8b',
      color: '#008a8b',
      backgroundColor: 'rgba(0, 170, 171, 0.08)'
    },
    '& .MuiSvgIcon-root': {
      color: 'currentColor'
    }
  } as const;

  // Contactable shippers from store (organizations + partner contact_name)
  const { contactableShippers, fetchContactableShippers } = useContactableShippers();

  useEffect(() => {
    fetchContactableShippers();
  }, [fetchContactableShippers]);

  // Reset pagination when tab or data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, quote?.quote_artworks?.length, contactableShippers?.length]);

  useEffect(() => {
    const verifyLetterhead = async () => {
      if (letterheadBypassEnabled) {
        setLetterheadAvailable(true);
        setLetterheadMessage(null);
        return;
      }
      if (!isBidModalOpen || !organization?.id) return;
      setLetterheadChecking(true);
      try {
        const status = await checkLetterheadAvailability(organization.id);
        setLetterheadAvailable(status.available);
        setLetterheadMessage(status.available ? null : status.reason || 'Letterhead not found for this branch.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to verify letterhead availability.';
        setLetterheadAvailable(false);
        setLetterheadMessage(message);
      } finally {
        setLetterheadChecking(false);
      }
    };

    void verifyLetterhead();
  }, [isBidModalOpen, organization?.id, letterheadBypassEnabled]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionState, setSubmissionState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [feedbackNotice, setFeedbackNotice] = useState<FeedbackNotice | null>(null);
  const feedbackNoticeRef = useRef<FeedbackNotice | null>(null);
  const feedbackNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingFeedbackNotice, setPendingFeedbackNotice] = useState<FeedbackNotice | null>(null);
  const lastQuoteIdRef = useRef<string | null>(null);
  const prefilledBidSignatureRef = useRef<string | null>(null);
  const knownLineItemIds = useMemo(() => new Set(lineItems.map((item) => item.id)), [lineItems]);

  const formatLineItemAmount = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return '';
    }
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '');
  }, []);

  const resolveSubItemSelection = useCallback((lineItemId: string, rawValue: unknown): string | null => {
    if (typeof rawValue !== 'string') {
      return null;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }
    const options = (SUB_LINE_ITEMS as Record<string, Array<{ id: string; name: string }>>)[lineItemId] || [];
    const byIdMatch = options.find((option) => option.id === trimmed);
    if (byIdMatch) {
      return byIdMatch.id;
    }
    const normalized = normalizeLabel(trimmed);
    return SUB_ITEM_LOOKUP[lineItemId]?.[normalized] || null;
  }, []);

  const resetEstimateLineItems = useCallback(() => {
    setLineItemsState((prev) => prev.map((item) => ({ ...item, cost: '' })));
    setSelectedSubItemsState({});
    setCustomLineItemsState([]);
  }, [setLineItemsState, setSelectedSubItemsState, setCustomLineItemsState]);

  const hydrateEstimateFromBid = useCallback(
    (existingBid: typeof bidForQuote) => {
      if (!existingBid) {
        return;
      }

      const standardBuckets = new Map<string, { amount: number; subItemIds: Set<string> }>();
      const customItems: Array<{ id: string; name: string; cost: string }> = [];

      (existingBid.bid_line_items || []).forEach((item: BidLineItem | null, index: number) => {
        if (!item) {
          return;
        }

        const categoryId = item.category || '';
        const totalAmount = Number(item.total_amount ?? item.unit_price ?? 0) || 0;
        const isKnownCategory = categoryId && knownLineItemIds.has(categoryId);

        if (!isKnownCategory || categoryId === 'custom') {
          const label = (() => {
            if (Array.isArray(item.description) && item.description.length > 0) {
              return item.description.join(', ');
            }
            if (categoryId) {
              return toTitleCase(categoryId.replace(/_/g, ' '));
            }
            return 'Custom service';
          })();

          customItems.push({
            id: item.id || `custom-${index}`,
            name: label,
            cost: formatLineItemAmount(totalAmount),
          });
          return;
        }

        const bucket = standardBuckets.get(categoryId) || { amount: 0, subItemIds: new Set<string>() };
        bucket.amount += totalAmount;

        if (Array.isArray(item.description)) {
          item.description.forEach((entry: unknown) => {
            const resolved = resolveSubItemSelection(categoryId, entry);
            if (resolved) {
              bucket.subItemIds.add(resolved);
            }
          });
        }

        standardBuckets.set(categoryId, bucket);
      });

      setLineItemsState((prev) =>
        prev.map((item) => {
          const bucket = standardBuckets.get(item.id);
          return {
            ...item,
            cost: bucket ? formatLineItemAmount(bucket.amount) : '',
          };
        })
      );

      const selectionRecord: Record<string, string[]> = {};
      standardBuckets.forEach((bucket, category) => {
        if (bucket.subItemIds.size > 0) {
          selectionRecord[category] = Array.from(bucket.subItemIds);
        }
      });

      setSelectedSubItemsState(selectionRecord);
      setCustomLineItemsState(customItems);
    },
    [formatLineItemAmount, resolveSubItemSelection, setLineItemsState, setSelectedSubItemsState, setCustomLineItemsState, knownLineItemIds]
  );

  useEffect(() => {
    const currentId = quote?.id ?? null;
    if (currentId === lastQuoteIdRef.current) {
      return;
    }
    lastQuoteIdRef.current = currentId;
    resetEstimateLineItems();
  }, [quote?.id, resetEstimateLineItems]);

  const applyPrefillFromBid = useCallback(
    (source: typeof bidForQuote | null | undefined) => {
      if (!source || !Array.isArray(source.bid_line_items) || source.bid_line_items.length === 0) {
        return false;
      }
      hydrateEstimateFromBid(source);
      return true;
    },
    [hydrateEstimateFromBid]
  );

  const getBidSignature = useCallback((bid: typeof bidForQuote | null | undefined) => {
    if (!bid?.id) {
      return null;
    }
    return `${bid.id}:${bid.updated_at ?? ''}:${bid.amount ?? ''}`;
  }, []);

  useEffect(() => {
    if (!bidForQuote) {
      prefilledBidSignatureRef.current = null;
      return;
    }

    const signature = getBidSignature(bidForQuote);
    if (prefilledBidSignatureRef.current === signature) {
      return;
    }

    const hydratedFromLocal = applyPrefillFromBid(bidForQuote);
    if (hydratedFromLocal) {
      prefilledBidSignatureRef.current = signature;
      return;
    }

    let isCancelled = false;

    (async () => {
      try {
        const { data, error } = await BidService.getBidDetails(bidForQuote.id);
        if (error || !data) {
          console.error('[SubmitBid] Failed to load bid details for prefill', error);
          return;
        }
        if (!isCancelled && applyPrefillFromBid(data)) {
          prefilledBidSignatureRef.current = getBidSignature(data) ?? signature;
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[SubmitBid] Unexpected error fetching bid details for prefill', err);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [bidForQuote, applyPrefillFromBid, getBidSignature]);

  const totalEstimate = calculateTotal();
  const estimateCtaLabel = bidForQuote ? 'Update estimate' : 'Prepare estimate';

  const isSubmitActionDisabled =
    deadlineExpiredForSubmission ||
    submissionState === 'loading' ||
    submissionState === 'success' ||
    submitting ||
    totalEstimate === 0 ||
    !validUntil;

  const clearFeedbackNoticeTimeout = useCallback(() => {
    if (feedbackNoticeTimeoutRef.current) {
      clearTimeout(feedbackNoticeTimeoutRef.current);
      feedbackNoticeTimeoutRef.current = null;
    }
  }, []);

  const showFeedbackNotice = useCallback((notice: FeedbackNotice | null) => {
    clearFeedbackNoticeTimeout();
    feedbackNoticeRef.current = notice;
    setFeedbackNotice(notice);
    setPendingFeedbackNotice(null);

    if (notice?.autoHideMs) {
      feedbackNoticeTimeoutRef.current = setTimeout(() => {
        const current = feedbackNoticeRef.current;
        if (current && current.id === notice.id) {
          feedbackNoticeRef.current = null;
          setFeedbackNotice(null);
          notice.onDismiss?.();
        }
        feedbackNoticeTimeoutRef.current = null;
      }, notice.autoHideMs);
    }
  }, [clearFeedbackNoticeTimeout]);

  const dismissFeedbackNotice = useCallback(() => {
    const current = feedbackNoticeRef.current;
    feedbackNoticeRef.current = null;
    clearFeedbackNoticeTimeout();
    if (current?.onDismiss) {
      current.onDismiss();
    }
    setFeedbackNotice(null);
    setPendingFeedbackNotice(null);
  }, [clearFeedbackNoticeTimeout]);

  useEffect(() => {
    feedbackNoticeRef.current = feedbackNotice;
  }, [feedbackNotice]);

  const canDisplayFeedbackNotice = submissionState !== 'loading' && !submitting;

  const queueFeedbackNotice = useCallback((notice: FeedbackNotice) => {
    if (canDisplayFeedbackNotice) {
      showFeedbackNotice(notice);
    } else {
      setPendingFeedbackNotice(notice);
    }
  }, [canDisplayFeedbackNotice, showFeedbackNotice]);

  useEffect(() => {
    if (pendingFeedbackNotice && canDisplayFeedbackNotice) {
      showFeedbackNotice(pendingFeedbackNotice);
      setPendingFeedbackNotice(null);
    }
  }, [pendingFeedbackNotice, canDisplayFeedbackNotice, showFeedbackNotice]);

  const submitButtonVisualStyles = (() => {
    const disabledBackground = 'rgba(23, 8, 73, 0.12)';
    const disabledColor = 'rgba(23, 8, 73, 0.45)';
    const disabledBorder = '1px solid rgba(23, 8, 73, 0.12)';

    if (deadlineExpiredForSubmission) {
      return {
        background: disabledBackground,
        color: disabledColor,
        border: disabledBorder,
        boxShadow: 'none'
      };
    }

    if (submissionState === 'success') {
      return {
        background: 'rgba(13, 171, 113, 0.15)',
        color: '#0DAB71',
        border: '1px solid rgba(13, 171, 113, 0.4)',
        boxShadow: '0 12px 26px rgba(13, 171, 113, 0.25)'
      };
    }

    if (submissionState === 'loading') {
      return {
        background: '#6C1AE2',
        color: '#FFFFFF',
        border: '1px solid #6C1AE2',
        boxShadow: '0 12px 26px rgba(132, 18, 255, 0.22)'
      };
    }

    if (isSubmitActionDisabled) {
      return {
        background: disabledBackground,
        color: disabledColor,
        border: disabledBorder,
        boxShadow: 'none'
      };
    }

    return {
      background: '#8412ff',
      color: '#FFFFFF',
      border: '1px solid #8412ff',
      boxShadow: '0 16px 30px rgba(132, 18, 255, 0.28)'
    };
  })();

  useEffect(() => {
    return () => {
      feedbackNoticeRef.current = null;
      clearFeedbackNoticeTimeout();
    };
  }, [clearFeedbackNoticeTimeout]);

  const [artworkImageMap, setArtworkImageMap] = useState<Record<string, ArtworkImageCacheEntry>>({});
  const artworkImageMapRef = useRef<Record<string, ArtworkImageCacheEntry>>({});
  const fetchingArtworkIds = useRef<Set<string>>(new Set());
  const isComponentMounted = useRef(false);

  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  useEffect(() => {
    artworkImageMapRef.current = artworkImageMap;
  }, [artworkImageMap]);

  useEffect(() => {
    setArtworkImageMap({});
    artworkImageMapRef.current = {};
    fetchingArtworkIds.current.clear();
  }, [quote?.id]);

  const ensureArtworkPreview = useCallback(
    async (artwork: QuoteArtworkRecord, accessToken: string, options: { force?: boolean } = {}) => {
      const storedValue = artwork.image_url || '';

      if (!storedValue) {
        if (!isComponentMounted.current) return;
        setArtworkImageMap(prev => {
          if (!prev[artwork.id]) return prev;
          const next = { ...prev };
          delete next[artwork.id];
          return next;
        });
        return;
      }

      if (storedValue.startsWith('http://') || storedValue.startsWith('https://')) {
        if (!isComponentMounted.current) return;
        setArtworkImageMap(prev => {
          const existing = prev[artwork.id];
          if (existing && existing.url === storedValue && existing.legacy) {
            return prev;
          }
          return {
            ...prev,
            [artwork.id]: {
              url: storedValue,
              expiresAt: null,
              legacy: true,
              error: null,
            },
          };
        });
        return;
      }

      const existing = artworkImageMapRef.current[artwork.id];
      const bufferMs = 5_000;
      const stillValid =
        existing?.url &&
        existing.expiresAt !== null &&
        existing.expiresAt - bufferMs > Date.now();

      if (stillValid && !options.force) {
        return;
      }

      if (fetchingArtworkIds.current.has(artwork.id)) {
        return;
      }

      fetchingArtworkIds.current.add(artwork.id);

      try {
        const result = await QuoteService.getArtworkImageViewUrl(artwork.id, accessToken);
        if (!isComponentMounted.current) return;

        setArtworkImageMap(prev => {
          const next = {
            ...prev,
            [artwork.id]: {
              url: result.url,
              expiresAt: result.legacy ? null : Date.now() + 55_000,
              legacy: !!result.legacy,
              error: null,
            },
          };
          return next;
        });
      } catch (err) {
        if (!isComponentMounted.current) return;
        const message = err instanceof Error ? err.message : 'Unable to fetch artwork image';
        setArtworkImageMap(prev => {
          const next = {
            ...prev,
            [artwork.id]: {
              url: '',
              expiresAt: null,
              legacy: false,
              error: message,
            },
          };
          return next;
        });
      } finally {
        fetchingArtworkIds.current.delete(artwork.id);
      }
    },
    []
  );

  const refreshArtworkImage = useCallback(
    async (artworkId: string, options: { force?: boolean } = {}) => {
      if (!quote?.quote_artworks) return;
      const target = quote.quote_artworks.find(art => art.id === artworkId) as QuoteArtworkRecord | undefined;
      if (!target) return;

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        return;
      }

      if (options.force) {
        setArtworkImageMap(prev => {
          const next = { ...prev };
          delete next[artworkId];
          return next;
        });
      }

      await ensureArtworkPreview(target, accessToken, options);
    },
    [ensureArtworkPreview, quote?.quote_artworks]
  );

  const handleArtworkImageError = useCallback(
    (artworkId: string, url: string | null, _event?: React.SyntheticEvent<HTMLImageElement, Event>) => {
      refreshArtworkImage(artworkId, { force: true });
    },
    [refreshArtworkImage]
  );

  useEffect(() => {
    const hydratePreviews = async () => {
      if (!quote?.quote_artworks || quote.quote_artworks.length === 0) return;

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('Unable to hydrate artwork previews:', error.message);
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        console.warn('Unable to hydrate artwork previews: missing access token');
        return;
      }

      await Promise.all(
        quote.quote_artworks.map(art => ensureArtworkPreview(art as QuoteArtworkRecord, accessToken))
      );
    };

    hydratePreviews();
  }, [quote?.quote_artworks, ensureArtworkPreview]);

  // Message state
  const [message, setMessage] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesHeight, setMessagesHeight] = useState<number>(200);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const chatLoading = useChatStore((state) => state.loading);
  const openThreadForQuote = useChatStore((state) => state.openThreadForQuote);
  const selectChatThread = useChatStore((state) => state.selectThread);
  const sendChatMessage = useChatStore((state) => state.sendMessage);
  const chatError = useChatStore((state) => state.error);
  const clearChatError = useChatStore((state) => state.clearError);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;
    
    const rect = document.querySelector('.messages-container')?.getBoundingClientRect();
    if (rect) {
      const newHeight = e.clientY - rect.top;
      const minHeight = 150;
      const maxHeight = 500;
      
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setMessagesHeight(newHeight);
      }
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  // Fetch quote details on mount
  useEffect(() => {
    if (id) {
      fetchQuoteDetails(id);
    }
  }, [id, fetchQuoteDetails]);


  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle global mouse events for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Pre-fill form with existing bid data (for confirmation flow)
  useEffect(() => {
    if (!bidForQuote) return;
    hydrateFromBid(bidForQuote);
  }, [bidForQuote?.id, bidForQuote?.updated_at, hydrateFromBid]);

  // Set default quote valid until date (30 days from now) if no existing bid
  useEffect(() => {
    if (!bidForQuote) {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      setValidUntil(defaultDate.toISOString().split('T')[0]);
    }
  }, [bidForQuote, setValidUntil]);

  useEffect(() => {
    if (!bidForQuote || bidForQuote.valid_until) {
      return;
    }
    if (validUntil) {
      return;
    }
    const fallbackDate = new Date();
    fallbackDate.setDate(fallbackDate.getDate() + 30);
    setValidUntil(fallbackDate.toISOString().split('T')[0]);
  }, [bidForQuote, validUntil, setValidUntil]);

  const synchronizeSubItemSelections = useCallback((lineItemId: string, nextSelected: string[]) => {
    const previous = selectedSubItems[lineItemId] || [];
    const toAdd = nextSelected.filter((id) => !previous.includes(id));
    const toRemove = previous.filter((id) => !nextSelected.includes(id));

    toAdd.forEach((id) => handleSubItemToggle(lineItemId, id));
    toRemove.forEach((id) => handleSubItemToggle(lineItemId, id));
  }, [selectedSubItems, handleSubItemToggle]);

  const handleSubItemsSelectChange = (lineItemId: string) => (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value }
    } = event;
    const normalized = typeof value === 'string' ? value.split(',') : value;
    synchronizeSubItemSelections(lineItemId, normalized);
  };

  useEffect(() => {
    if (!isBidModalOpen) return;
    if (!quote?.delivery_specifics) return;

    let updated = false;

    (Object.entries(DELIVERY_SPECIFICS_TO_LINE_ITEM) as Array<[DeliverySpecificsKey, LineItemKey]>).forEach(([specificKey, lineItemId]) => {
      const rawValue = (quote.delivery_specifics as Record<string, unknown>)[specificKey];
      const values = normalizeToArray(rawValue);
      if (!values.length) return;

      const mappedIds = Array.from(
        new Set(
          values
            .map((value) => SUB_ITEM_LOOKUP[lineItemId]?.[normalizeLabel(value)])
            .filter((id): id is string => Boolean(id))
        )
      );

      if (!mappedIds.length) return;

      const existingSelections = selectedSubItems[lineItemId] || [];
      if (existingSelections.length > 0 && hasAppliedDeliverySpecifics) {
        return;
      }

      synchronizeSubItemSelections(lineItemId, mappedIds);
      updated = true;
    });

    if (updated) {
      setHasAppliedDeliverySpecifics(true);
    }
  }, [isBidModalOpen, quote?.delivery_specifics, selectedSubItems, synchronizeSubItemSelections, hasAppliedDeliverySpecifics]);

  useEffect(() => {
    if (!isBidModalOpen) {
      setHasAppliedDeliverySpecifics(false);
      setBidModalInfoTab('summary');
    }
  }, [isBidModalOpen]);

  useEffect(() => {
    setHasAppliedDeliverySpecifics(false);
  }, [quote?.id]);

  // Icon mapping for sub-items
  const getSubItemIcon = (itemId: string) => {
    const iconMap: { [key: string]: React.ReactElement } = {
      // Transport mode icons
      'air': <FlightIcon sx={{ fontSize: '20px' }} />,
      'sea': <DirectionsBoatIcon sx={{ fontSize: '20px' }} />,
      'courier': <LocalShippingOutlinedIcon sx={{ fontSize: '20px' }} />,
      'ground': <DriveEtaIcon sx={{ fontSize: '20px' }} />,
      
      // Collection & delivery services icons
      'white_glove': <HandymanIcon sx={{ fontSize: '20px' }} />,
      'standard': <HomeIcon sx={{ fontSize: '20px' }} />,
      'curbside': <LocationOnIcon sx={{ fontSize: '20px' }} />,
      'inside': <HomeIcon sx={{ fontSize: '20px' }} />,
      'appointment': <ScheduleIcon sx={{ fontSize: '20px' }} />,
      'weekend': <WeekendIcon sx={{ fontSize: '20px' }} />,
      
      // Packing & crating icons
      'professional': <BuildIcon sx={{ fontSize: '20px' }} />,
      'bubble': <BubbleChartIcon sx={{ fontSize: '20px' }} />,
      'wooden': <Inventory2Icon sx={{ fontSize: '20px' }} />,
      'climate': <ThermostatIcon sx={{ fontSize: '20px' }} />,
      'fragile': <ShieldIcon sx={{ fontSize: '20px' }} />,
      'soft': <CheckroomIcon sx={{ fontSize: '20px' }} />,
      
      // Documentation & customs icons
      'export': <DescriptionIcon sx={{ fontSize: '20px' }} />,
      'import': <ImportExportIcon sx={{ fontSize: '20px' }} />,
      'insurance_cert': <VerifiedUserIcon sx={{ fontSize: '20px' }} />,
      'customs': <AccountBalanceIcon sx={{ fontSize: '20px' }} />,
      'carnet': <BadgeIcon sx={{ fontSize: '20px' }} />,
      'cites': <NatureIcon sx={{ fontSize: '20px' }} />
    };
    
    return iconMap[itemId] || <Inventory2Icon sx={{ fontSize: '20px' }} />;
  };

  // Use bid form state from hook instead of local state
  
  
  const originCoordinates = useMemo(
    () => extractLocationCoordinates(quote?.origin),
    [quote?.origin]
  );
  const destinationCoordinates = useMemo(
    () => extractLocationCoordinates(quote?.destination),
    [quote?.destination]
  );

  const isInitialQuoteLoading = loading && !quote;

  // Loading state
  if (isInitialQuoteLoading) {
    return (
      <div className="main-wrap">
        <div className="main-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <CircularProgress sx={{ color: '#00AAAB' }} />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="main-wrap">
        <div className="main-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Alert severity="error" sx={{ maxWidth: 420 }}>
            Unable to load this estimate right now. Please refresh the page or return to the Estimates list.
          </Alert>
        </div>
      </div>
    );
  }

  const normalizedTransportMethod = inferTransportMethodFromQuote(quote);
  const transportModeLabel = getTransportMethodLabel(normalizedTransportMethod);

  // Format quote data for display with proper data from quotes table
  const quoteRequest = {
    id: quote.id,
    title: quote.title || 'Untitled Quote',
    code: quote.client_reference || `Q-${quote.id.slice(0, 6)}`,
    gallery: quote.owner_org?.name || 'Unknown Client',
    galleryOrgId: quote.owner_org?.id || quote.owner_org_id || null,
    type: quote.type as 'direct' | 'requested' | 'open',
    status: quote.status,
    route: quote.origin && quote.destination ? `${quote.origin.name} → ${quote.destination.name}` : quote.route || 'TBD',
    origin: quote.origin?.name || 'TBD',
    destination: quote.destination?.name || 'TBD',
    originAddress: quote.origin?.address_full || '',
    destinationAddress: quote.destination?.address_full || '',
    targetDate: quote.target_date || quote.target_date_start || '',
    targetDateEnd: quote.target_date_end || '',
    pickupDate: quote.target_date || '',
    auctionDeadline: quote.bidding_deadline || '',
    artworkCount: quote.quote_artworks?.length || 0,
    totalValue: quote.value || 0,
    specialRequirements: quote.requirements || quote.delivery_specifics?.special_requirements || [],
    description: quote.description || quote.notes || '',
    notes: quote.notes || '',
    deliverySpecifics: quote.delivery_specifics || {},
    currentBids: 0, // Would need to fetch from bids table
    timeLeft: deadlineState.label,
    estimatedDistance: 'TBD', // Would need calculation
    transportMode: transportModeLabel,
    insurance: quote.delivery_specifics?.insurance_requirements || 'Standard',
    autoCloseBidding: quote.auto_close_bidding !== false,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
    shipmentId: quote.shipment_id || null,
    pickupContactName: quote.origin_contact_name || '',
    pickupContactPhone: quote.origin_contact_phone || '',
    pickupContactEmail: quote.origin_contact_email || '',
    deliveryContactName: quote.destination_contact_name || '',
    deliveryContactPhone: quote.destination_contact_phone || '',
    deliveryContactEmail: quote.destination_contact_email || '',
  };

  const originAddress = quoteRequest.originAddress || quoteRequest.origin || '';
  const destinationAddress = quoteRequest.destinationAddress || quoteRequest.destination || '';

  // Use actual artworks from quote or empty array
  const artworks = (quote.quote_artworks || []).map((artwork: QuoteArtworkRecord) => {
    const cacheEntry = artworkImageMap[artwork.id];
    const storedValue = artwork.image_url || '';
    const directUrl = storedValue.startsWith('http://') || storedValue.startsWith('https://') ? storedValue : '';
    const imageUrl = cacheEntry?.url || directUrl;
    const status: Artwork['imageStatus'] = !storedValue
      ? 'empty'
      : imageUrl
        ? 'ready'
        : cacheEntry?.error
          ? 'error'
          : 'loading';

    return {
      id: artwork.id,
      title: artwork.name,
      artist: artwork.artist_name || 'Unknown Artist',
      year: artwork.year_completed || 0,
      description: artwork.description || '',
      imageUrl,
      value: artwork.declared_value || 0,
      dimensions: artwork.dimensions || '',
      medium: artwork.medium || '',
      weight: artwork.weight || '',
      weightValue: artwork.weight_value ?? null,
      weightUnit: artwork.weight_unit || null,
      volumetricWeightValue: artwork.volumetric_weight_value ?? null,
      volumetricWeightUnit: artwork.volumetric_weight_unit || null,
      countryOfOrigin: artwork.country_of_origin || '',
      currentCustomsStatus: artwork.export_license_required ? 'License Required' : 'Cleared',
      tariffCode: artwork.tariff_code || '',
      crating: artwork.crating || '',
      specialRequirements: artwork.special_requirements || null,
      category: artwork.category || null,
      itemType: artwork.item_type || null,
      period: artwork.period || null,
      hasExistingCrate: artwork.has_existing_crate ?? null,
      imageStatus: status,
      imageError: cacheEntry?.error || null,
      imageStorageValue: storedValue || null,
    };
  });

  // Helpers to derive location tokens for origin/destination filtering
  const extractLocationTokens = (name?: string, address?: string) => {
    const tokens = new Set<string>();
    const push = (v?: string) => {
      if (v) {
        tokens.add(v.trim());
        tokens.add(v.trim().toLowerCase());
      }
    };
    push(name);
    if (address) {
      const parts = address.split(',').map(p => p.trim()).filter(Boolean);
      // city likely first, country likely last
      push(parts[0]);
      push(parts[parts.length - 1]);
      // also push all parts for loose matches
      parts.forEach(push);
    }
    return Array.from(tokens).filter(Boolean) as string[];
  };

  const originTokens = extractLocationTokens(quote.origin?.name, quote.origin?.address_full);
  const destinationTokens = extractLocationTokens(quote.destination?.name, quote.destination?.address_full);

  const doesRegionMatch = (regions: string[] | undefined, placeTokens: string[]) => {
    if (!regions || regions.length === 0 || placeTokens.length === 0) return false;
    const regionVals = regions.flatMap(r => [r, r.toLowerCase()]);
    return regionVals.some(r => placeTokens.some(t => r.includes(t) || t.includes(r)));
  };

  const filteredShippers = (contactableShippers || []).filter((shipper) => {
    const regions = shipper.regions || [];
    return shipperScope === 'origin'
      ? doesRegionMatch(regions, originTokens)
      : doesRegionMatch(regions, destinationTokens);
  });

  const filteredSummaryLineItems = useMemo(() => {
    return lineItems.filter((li) => {
      const selectedIds = selectedSubItems[li.id] || [];
      const hasAny = selectedIds.length > 0;
      const hasPrice = (parseFloat(li.cost as any) || 0) > 0;
      return hasAny || hasPrice;
    });
  }, [lineItems, selectedSubItems]);

  const bidModalInfoOptions = useMemo(
    () => [
      { id: 'summary' as const, label: 'Selections', count: filteredSummaryLineItems.length },
      { id: 'artworks' as const, label: 'Artwork details', count: artworks.length },
    ],
    [filteredSummaryLineItems.length, artworks.length]
  );

  const renderBidSummarySections = () => {
    const sectionLabels: { [key: string]: string } = {
      delivery_requirements: 'Delivery Requirements',
      packing_requirements: 'Packing Requirements',
      access_at_delivery: 'Access at Delivery',
      safety_security_requirements: 'Safety & Security Requirements',
      condition_check_requirements: 'Condition Check Requirements',
      movement_routing_domestic: 'Movement Type & Routing: Domestic',
      movement_routing_exports: 'Movement Type & Routing: Exports',
      movement_routing_cross_trade: 'Movement Type & Routing: Cross Trade',
      movement_routing_imports: 'Movement Type & Routing: Imports',
      customs_licences_documentation: 'Customs, Licences & Documentation',
      warehouse_viewing_services: 'Warehouse & Viewing Services',
    };

    if (filteredSummaryLineItems.length === 0) {
      return (
        <Typography variant="body2" sx={{ color: '#170849', opacity: 0.7 }}>
          Your selected services will appear here as soon as you start configuring the estimate.
        </Typography>
      );
    }

    return filteredSummaryLineItems.map((item, idx) => {
      const selectedIds = selectedSubItems[item.id] || [];
      const hasAny = selectedIds.length > 0;
      const label = sectionLabels[item.id as keyof typeof sectionLabels] || item.name;

      return (
        <Box
          key={item.id}
          sx={{
            pb: 1,
            borderBottom: idx < filteredSummaryLineItems.length - 1 ? '1px solid rgba(132, 18, 255, 0.2)' : 'none',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#170849', mb: 0.5 }}>
            {label}
          </Typography>
          {hasAny ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {selectedIds.map((sid) => {
                const sub = (SUB_LINE_ITEMS as any)[item.id]?.find((s: any) => s.id === sid);
                return (
                  <Box key={sid} sx={{ color: '#3f475a', fontWeight: 500 }}>
                    {sub?.name || sid}
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#170849', opacity: 0.55 }}>
              No selections
            </Typography>
          )}
        </Box>
      );
    });
  };

  const renderArtworkDetailCards = () => {
    if (!artworks.length) {
      return (
        <Typography variant="body2" sx={{ color: '#170849', opacity: 0.7 }}>
          No artwork details were provided for this request — reach out to the gallery if you need more information.
        </Typography>
      );
    }

    return artworks.map((artwork) => {
      const hasImage = Boolean(artwork.imageUrl && artwork.imageStatus === 'ready');
      const requirements = normalizeSpecialRequirements(artwork.specialRequirements);
      const description = (artwork.description || '').trim();
      const metadata = [
        { label: 'Dimensions', value: artwork.dimensions },
        { label: 'Weight', value: artwork.weight },
        { label: 'Country of origin', value: artwork.countryOfOrigin },
        { label: 'Tariff code', value: artwork.tariffCode },
        { label: 'Crating', value: artwork.crating },
        { label: 'Customs status', value: artwork.currentCustomsStatus },
      ].filter((entry) => Boolean(entry.value && String(entry.value).trim().length));

      const renderMetaRow = (label: string, value: string | number) => (
        <Box
          key={`${artwork.id}-${label}`}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25,
            minWidth: '45%',
          }}
        >
          <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 700, color: 'rgba(23, 8, 73, 0.55)' }}>
            {label}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#170849' }}>
            {value}
          </Typography>
        </Box>
      );

      return (
        <Box
          key={artwork.id}
          sx={{
            display: 'flex',
            gap: 1.5,
            borderRadius: '14px',
            border: '1px solid rgba(132, 18, 255, 0.18)',
            backgroundColor: '#fff',
            p: 1.5,
            boxShadow: '0 12px 30px rgba(23, 8, 73, 0.08)',
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '12px',
              flexShrink: 0,
              backgroundColor: hasImage ? '#fdfbff' : 'rgba(132, 18, 255, 0.08)',
              backgroundImage: hasImage ? `url(${artwork.imageUrl})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8412FF',
              fontWeight: 700,
              fontSize: '18px',
            }}
          >
            {!hasImage ? (artwork.title?.charAt(0).toUpperCase() || 'A') : null}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, color: '#170849', fontFamily: 'Fractul', lineHeight: 1.3 }}
            >
              {artwork.title || 'Untitled artwork'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#3f475a', fontWeight: 600 }}>
              {artwork.artist}
              {artwork.year ? ` • ${artwork.year}` : ''}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mt: 0.5 }}>
              {artwork.medium ? (
                <Chip
                  size="small"
                  label={artwork.medium}
                  sx={{
                    borderRadius: '999px',
                    backgroundColor: 'rgba(132, 18, 255, 0.12)',
                    color: '#8412FF',
                    fontWeight: 600,
                    fontSize: '12px',
                  }}
                />
              ) : null}
              {artwork.dimensions ? (
                <Chip
                  size="small"
                  label={artwork.dimensions}
                  sx={{
                    borderRadius: '999px',
                    backgroundColor: 'rgba(0, 170, 171, 0.12)',
                    color: '#008A8B',
                    fontWeight: 600,
                    fontSize: '12px',
                  }}
                />
              ) : null}
              {artwork.weight ? (
                <Chip
                  size="small"
                  label={artwork.weight}
                  sx={{
                    borderRadius: '999px',
                    backgroundColor: 'rgba(24, 29, 39, 0.08)',
                    color: '#3f475a',
                    fontWeight: 600,
                    fontSize: '12px',
                  }}
                />
              ) : null}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" sx={{ color: 'rgba(23, 8, 73, 0.7)', fontWeight: 600 }}>
                Declared value
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#170849' }}>
                {formatCurrency(artwork.value || 0)}
              </Typography>
            </Box>
            {metadata.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
                {metadata.map((entry) => renderMetaRow(entry.label, entry.value as string))}
              </Box>
            )}
            {description ? (
              <Typography variant="body2" sx={{ color: '#3f475a', mt: 1.5, lineHeight: 1.5 }}>
                {description}
              </Typography>
            ) : null}
            {requirements.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mt: 1 }}>
                {requirements.map((req) => (
                  <Chip
                    key={`${artwork.id}-${req}`}
                    size="small"
                    label={req}
                    sx={{
                      borderRadius: '999px',
                      backgroundColor: 'rgba(132, 18, 255, 0.12)',
                      color: '#8412FF',
                      fontWeight: 600,
                      fontSize: '12px',
                    }}
                  />
                ))}
              </Box>
            ) : null}
          </Box>
        </Box>
      );
    });
  };

  const availableServices = [
    { id: 'crating', label: 'Professional Crating' },
    { id: 'installation', label: 'Installation Service' },
    { id: 'climate', label: 'Climate Control' },
    { id: 'storage', label: 'Temporary Storage' }
  ];

  const dimensionOptions: { label: string; value: DimensionUnit }[] = [
    { label: 'Centimeters', value: 'cm' },
    { label: 'Inches', value: 'inches' },
  ];

  const getSpecialRequirementIcon = (requirement: string) => {
    switch (requirement) {
      case 'climate_control': return <AcUnitIcon sx={{ fontSize: 16 }} />;
      case 'high_security': return <SecurityIcon sx={{ fontSize: 16 }} />;
      case 'oversized': return <LocalShippingIcon sx={{ fontSize: 16 }} />;
      default: return null;
    }
  };

  const getSpecialRequirementText = (requirement: string) => {
    switch (requirement) {
      case 'climate_control': return 'Climate Control';
      case 'high_security': return 'High Security';
      case 'oversized': return 'Oversized Items';
      case 'insurance_required': return 'Insurance Required';
      default: return requirement.replace('_', ' ');
    }
  };

  const handleServiceToggle = (serviceId: string) => {
    const currentServices = specialServices || [];
    setSpecialServices(
      currentServices.includes(serviceId) 
        ? currentServices.filter(s => s !== serviceId)
        : [...currentServices, serviceId]
    );
  };

  const buildExportPayload = (): ExportEstimatePayload | null => {
    if (!organization?.id) {
      return null;
    }

    const artworkValue =
      quoteRequest.totalValue === null || quoteRequest.totalValue === undefined
        ? null
        : convertAmount(quoteRequest.totalValue);

    const items: ExportLineItemPayload[] = lineItems
      .map((item) => {
        const cost = parseFloat(item.cost) || 0;
        const selectedIds = selectedSubItems[item.id] || [];
        const selectedLabels = selectedIds
          .map((sid) => {
            const subItem = SUB_LINE_ITEMS[item.id as EstimateLineItemId]?.find((s) => s.id === sid);
            return subItem?.name || sid;
          })
          .filter(Boolean);

        return {
          id: item.id,
          name: item.name,
          cost,
          subItems: selectedLabels,
        };
      })
      .filter((item) => item.cost > 0 || (item.subItems?.length ?? 0) > 0);

    return {
      quoteId: quoteRequest.id,
      quoteTitle: quoteRequest.title,
      quoteCode: quoteRequest.code,
      currencyCode: preferredCurrency,
      galleryName: quoteRequest.gallery,
      origin: quoteRequest.origin,
      originAddress: quoteRequest.originAddress || null,
      destination: quoteRequest.destination,
      destinationAddress: quoteRequest.destinationAddress || null,
      validUntil: validUntil || undefined,
      notes: notes?.trim() || undefined,
      total: totalEstimate,
      lineItems: items,
      branchOrgId: organization.id,
      companyOrgId: organization.company?.id ?? organization.parent_org_id ?? null,
      branchName: organization.branch_name ?? organization.name ?? null,
      companyName: organization.company?.name ?? null,
      artworkCount: quoteRequest.artworkCount ?? null,
      artworkValue,
    };
  };

  const handleExportPdf = async () => {
    const payload = buildExportPayload();
    if (!payload) {
      setExportError('Select a branch to export with its letterhead.');
      setLetterheadAvailable(false);
      return;
    }

    setExportingPdf(true);
    setExportError(null);

    try {
      const blob = await exportEstimatePdf(payload);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Estimate-${quoteRequest.code || quoteRequest.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setExportError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export PDF.';
      setExportError(message);
      if ((err as any)?.code === 'LETTERHEAD_MISSING') {
        setLetterheadAvailable(false);
        setLetterheadMessage(message);
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSubmitBid = async () => {
    if (!quote) return;
    if (deadlineExpiredForSubmission) {
      queueFeedbackNotice({
        id: Date.now(),
        variant: 'warning',
        title: 'Bidding deadline has passed',
        description: 'Please contact the gallery for next steps before submitting.',
      });
      return;
    }

    const totalAmount = totalEstimate;
    if (totalAmount === 0 || !validUntil) {
      queueFeedbackNotice({
        id: Date.now(),
        variant: 'warning',
        title: 'Complete required estimate details',
        description: 'Select at least one service and set a valid until date prior to submitting.',
      });
      return;
    }

    setSubmitting(true);
    setSubmissionState('loading');

    try {
      // Use the bid form hook's submit function
      const result = await handleSubmit();

      if (result.success) {
        console.log('Estimate submitted successfully:', {
          bidId: result.data?.id,
          totalAmount
        });
        setSubmissionState('success');

        const warnings = (result.warnings || []).filter(Boolean);
        const hasWarnings = warnings.length > 0;
        const noticeTitle = hasWarnings
          ? `${isAuction ? 'Estimate' : 'Estimate'} submitted with warnings`
          : `${isAuction ? 'Estimate' : 'Estimate'} submitted successfully`;

        queueFeedbackNotice({
          id: Date.now(),
          variant: hasWarnings ? 'warning' : 'success',
          title: noticeTitle,
          description: hasWarnings
            ? 'Review the noted items below. We will return you to Estimates once you acknowledge this message.'
            : 'Nice work!',
          details: hasWarnings ? warnings : undefined,
          autoHideMs: hasWarnings ? undefined : 2600,
          onDismiss: () => {
            setSubmissionState('idle');
            navigate('/estimates');
          },
        });
      } else {
        queueFeedbackNotice({
          id: Date.now(),
          variant: 'error',
          title: `Failed to submit ${isAuction ? 'bid' : 'quote'}`,
          description: result.errors?.join('\n') || 'Unknown error. Please try again.',
        });
        setSubmissionState('idle');
      }
    } catch (error) {
      console.error(`Failed to submit ${isAuction ? 'bid' : 'quote'}:`, error);
      queueFeedbackNotice({
        id: Date.now(),
        variant: 'error',
        title: `Failed to submit ${isAuction ? 'bid' : 'quote'}`,
        description: 'Something went wrong. Please try again in a moment.',
      });
      setSubmissionState('idle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraftClick = async () => {
    setSubmitting(true);
    try {
      const result = await handleSaveDraft();
      if (result.success) {
        queueFeedbackNotice({
          id: Date.now(),
          variant: 'success',
          title: 'Draft saved',
          description: 'We saved your progress so you can revisit this estimate later.',
          autoHideMs: 2600,
        });
      } else {
        queueFeedbackNotice({
          id: Date.now(),
          variant: 'error',
          title: 'Failed to save draft',
          description: result.errors?.join('\n') || 'Unknown error. Please try again.',
        });
      }
    } catch (error) {
      console.error('Failed to save draft:', error);
      queueFeedbackNotice({
        id: Date.now(),
        variant: 'error',
        title: 'Failed to save draft',
        description: 'Something went wrong while saving. Please try again shortly.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !quoteRequest?.id) {
      return;
    }

    const body = message.trim();
    setMessage('');

    const localMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: body,
      timestamp: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, localMessage]);

    try {
      const threadId = await openThreadForQuote({
        quoteId: quoteRequest.id,
        shipmentId: quoteRequest.shipmentId ?? null,
        shipperBranchOrgId: organization?.id ?? null,
        galleryBranchOrgId: quoteRequest.galleryOrgId ?? null,
      });
      await selectChatThread(threadId);
      await sendChatMessage(threadId, body);
    } catch (err) {
      console.error('[SubmitBid] failed to send chat message', err);
    }
  };

  const handleOpenConversationInMessages = async () => {
    if (!quoteRequest?.id) return;
    try {
      const threadId = await openThreadForQuote({
        quoteId: quoteRequest.id,
        shipmentId: quoteRequest.shipmentId ?? null,
        shipperBranchOrgId: organization?.id ?? null,
        galleryBranchOrgId: quoteRequest.galleryOrgId ?? null,
      });
      await selectChatThread(threadId);
      navigate(`/messages?threadId=${threadId}`);
    } catch (err) {
      console.error('[SubmitBid] failed to open Messages page', err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to get initials when no image available
  const getInitials = (fullName: string) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  };

  return (
    <div className="main-wrap">
      <AnimatePresence>
        {feedbackNotice ? (
          <SubmissionFeedbackCard
            key={feedbackNotice.id}
            notice={feedbackNotice}
            onClose={dismissFeedbackNotice}
          />
        ) : null}
      </AnimatePresence>
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate('/estimates')}
                sx={{
                  color: '#58517E',
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': {
                    background: 'rgba(132, 18, 255, 0.04)',
                  },
                }}
              >
                Back to Estimates
              </Button>
              <h1 className="header-title">Estimate</h1>
            </div>
          </div>
        </header>
        
        <div className="main-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '24px' }}>
          {bidForQuote && bidForQuote.status === 'needs_confirmation' && (
            <Alert severity="warning" sx={{ gridColumn: '1 / -1', my: 1 }}>
              The quote requirements have changed. Please review and confirm your bid, or withdraw if you cannot fulfill the updated request.
            </Alert>
          )}
          {/* LEFT: Hero + details */}
          <section aria-label="Quote details" style={{ background: '#F0FAFA', borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '32px', lineHeight: 1.1, color: '#1a1b2e' }}>{quoteRequest.title}</h2>
              <span className="tag success" style={{ padding: '6px 10px', borderRadius: 999, border: '1.5px solid #0DAB71', color: '#0DAB71', background: 'transparent', fontWeight: 700 }}>{(quoteRequest.status || 'open').toString().toUpperCase()}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', margin: '8px 0 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2a2f45' }}>
                <span style={{ opacity: 0.8 }}>Quote:</span>&nbsp;<strong>{quoteRequest.code}</strong>
              </div>
              {quote.client_reference && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2a2f45' }}>
                  <span style={{ opacity: 0.8 }}>Client reference:</span>&nbsp;<strong>{quote.client_reference}</strong>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '12px', borderRadius: 12, background: '#FFFFFF', border: '1px solid rgba(23,8,73,0.08)' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7085', fontWeight: 700, marginBottom: 4 }}>Pickup contact</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#170849' }}>{quoteRequest.pickupContactName || '—'}</div>
                  <div style={{ fontSize: 13, color: '#3f475a', marginTop: 2 }}>{quoteRequest.pickupContactPhone || 'No phone provided'}</div>
                  <div style={{ fontSize: 13, color: '#3f475a' }}>{quoteRequest.pickupContactEmail || 'No email provided'}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: 12, background: '#FFFFFF', border: '1px solid rgba(23,8,73,0.08)' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7085', fontWeight: 700, marginBottom: 4 }}>Delivery contact</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#170849' }}>{quoteRequest.deliveryContactName || '—'}</div>
                  <div style={{ fontSize: 13, color: '#3f475a', marginTop: 2 }}>{quoteRequest.deliveryContactPhone || 'No phone provided'}</div>
                  <div style={{ fontSize: 13, color: '#3f475a' }}>{quoteRequest.deliveryContactEmail || 'No email provided'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Button
                  className="primary-btn"
                  fullWidth
                  variant="contained"
                  disabled={deadlineExpiredForSubmission}
                  sx={{
                    background: '#8412ff',
                    color: '#fff',
                    textTransform: 'none',
                    fontWeight: 700,
                    minHeight: '44px',
                    minWidth: '180px',
                    '&:hover': { background: '#730add' },
                    '&.Mui-disabled': { background: 'rgba(23, 8, 73, 0.12)', color: 'rgba(23, 8, 73, 0.45)' }
                  }}
                  onClick={() => setIsBidModalOpen(true)}
                >
                  {deadlineExpiredForSubmission ? 'Bidding closed' : estimateActionLabel}
                </Button>
                {bidForQuote && bidForQuote.status === 'needs_confirmation' && (
                  <>
                    <Button
                      variant="contained"
                      onClick={async () => {
                        setSubmitting(true);
                        const result = await confirmBid(bidForQuote.id);
                        setSubmitting(false);
                        if (!result.error) {
                          navigate('/estimates');
                        } else {
                          queueFeedbackNotice({
                            id: Date.now(),
                            variant: 'error',
                            title: 'Failed to confirm bid',
                            description: result.error?.message || 'Please try again shortly.',
                          });
                        }
                      }}
                      disabled={submitting}
                      sx={{
                        background: '#8412ff',
                        color: '#fff',
                        textTransform: 'none',
                        fontWeight: 700,
                        minHeight: '44px',
                        minWidth: '180px',
                        '&:hover': { background: '#730add' }
                      }}
                    >
                      {submitting ? 'Confirming...' : 'Confirm & Resubmit Estimate'}
                    </Button>
                    <Button
                      variant="contained"
                      onClick={async () => {
                        if (!window.confirm('Are you sure you want to withdraw your estimate?')) return;
                        setSubmitting(true);
                        const { error } = await withdrawBid(bidForQuote.id);
                        setSubmitting(false);
                        if (!error) {
                          navigate('/estimates');
                        } else {
                          queueFeedbackNotice({
                            id: Date.now(),
                            variant: 'error',
                            title: 'Failed to withdraw bid',
                            description: error.message || 'Please try again shortly.',
                          });
                        }
                      }}
                      sx={{
                        background: '#D94E45',
                        color: '#ffffff',
                        textTransform: 'none',
                        fontWeight: 700,
                        minHeight: '44px',
                        minWidth: '180px',
                        '&:hover': { background: '#c1433b' }
                      }}
                    >
                      Withdraw Bid
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <ScheduleIcon sx={{ fontSize: 20, color: deadlineAccentColor }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {!manualClose && !deadlineState.isExpired && (
                  <CountdownClock
                    deadline={quote?.bidding_deadline ?? null}
                    manualClose={manualClose}
                    size="medium"
                    showLabel={false}
                  />
                )}
                <span style={{ color: deadlineAccentColor, fontWeight: 600 }}>{deadlineMessage}</span>
                {!manualClose && deadlineState.expiresAt && (
                  <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.6)' }}>
                    Deadline: {deadlineState.expiresAt.toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {(originAddress || destinationAddress) && (
              <div className="detail-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
                <div className="route-map-container">
                  <RouteMap
                    origin={originAddress}
                    destination={destinationAddress}
                    originCoordinates={originCoordinates}
                    destinationCoordinates={destinationCoordinates}
                    allowGeocoding={false}
                  />
                </div>
              </div>
            )}

            {/* Details card */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E9EAEB', borderRadius: '14px', padding: '20px', boxShadow: '0 0 40px rgba(10,13,18,0.12)' }}>
              <h3 style={{ fontSize: '22px', margin: '0 0 12px', fontWeight: 700, color: '#0d1230' }}>Details</h3>

              {/* Flight track */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', margin: '6px 0 14px' }}>
                <span style={{ width: 22, height: 22, background: '#0FA7A9', boxShadow: 'inset 0 0 0 6px #fff', borderRadius: 999 }} />
                <span style={{ flex: 1, height: 0, borderTop: '3px dotted #77D6D7' }} />
                {getTransportMethodIcon(normalizedTransportMethod)}
                <span style={{ flex: 1, height: 0, borderTop: '3px dotted #E9EAEB' }} />
                <span style={{ width: 24, height: 24, border: '2px solid #E9EAEB', background: '#fff', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LocationOnIcon sx={{ fontSize: 14, color: '#364152' }} />
                </span>
              </div>

              {/* Addresses */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>
                <div>
                  <div style={{ color: '#3f475a', opacity: 0.75, fontSize: '12px' }}>Origin</div>
                  <address style={{ fontStyle: 'normal', fontWeight: 700, color: '#16192c' }}>{quoteRequest.originAddress || quoteRequest.origin}</address>
                </div>
                <div style={{ borderLeft: '1px solid #E9EAEB', paddingLeft: '24px' }}>
                  <div style={{ color: '#3f475a', opacity: 0.75, fontSize: '12px' }}>Destination</div>
                  <address style={{ fontStyle: 'normal', fontWeight: 700, color: '#16192c' }}>{quoteRequest.destinationAddress || quoteRequest.destination}</address>
                </div>
              </div>

              {/* Metrics */}
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0, margin: '16px 0', borderTop: '1px solid #E9EAEB', borderBottom: '1px solid #E9EAEB', padding: '12px 0' }}>
                <div style={{ padding: '0 16px', position: 'relative' }}>
                  <dt style={{ margin: 0, color: '#3f475a', fontWeight: 600, fontSize: '12px' }}>Arrival date</dt>
                  <dd style={{ margin: '4px 0 0', fontWeight: 800, color: '#0e122b' }}>{quoteRequest.targetDate ? new Date(quoteRequest.targetDate).toLocaleDateString() : 'Flexible'}</dd>
                  <span style={{ position: 'absolute', right: 0, top: 6, bottom: 6, width: 1, background: '#E9EAEB' }} />
                </div>
                <div style={{ padding: '0 16px', position: 'relative' }}>
                  <dt style={{ margin: 0, color: '#3f475a', fontWeight: 600, fontSize: '12px' }}>No. of artworks</dt>
                  <dd style={{ margin: '4px 0 0', fontWeight: 800, color: '#0e122b' }}>{quoteRequest.artworkCount}</dd>
                  <span style={{ position: 'absolute', right: 0, top: 6, bottom: 6, width: 1, background: '#E9EAEB' }} />
                </div>
                <div style={{ padding: '0 16px' }}>
                  <dt style={{ margin: 0, color: '#3f475a', fontWeight: 600, fontSize: '12px' }}>Total value</dt>
                  <dd style={{ margin: '4px 0 0', fontWeight: 800, color: '#0e122b' }}>{formatCurrency(quoteRequest.totalValue || 0)}</dd>
                </div>
              </dl>

              {/* Special Requirements */}
              {quoteRequest.specialRequirements && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '8px', fontWeight: 700 }}>Special requirements</div>
                  {(() => {
                    let requirements: any = quoteRequest.specialRequirements;
                    try {
                      requirements = typeof quoteRequest.specialRequirements === 'string' ? JSON.parse(quoteRequest.specialRequirements) : quoteRequest.specialRequirements;
                    } catch {}
                    if (Array.isArray(requirements)) {
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                          {requirements.map((req: string) => (
                            <span key={req} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', border: '2px solid #8412ff', color: '#8412ff', background: '#fff', fontWeight: 700 }}>
                              {getSpecialRequirementIcon(req)}
                              <span>{getSpecialRequirementText(req)}</span>
                            </span>
                          ))}
                        </div>
                      );
                    }
                    if (typeof requirements === 'object' && requirements !== null) {
                      const formatValue = (value: any) => Array.isArray(value) ? value.join(', ') : String(value);
                      const items: string[] = [];
                      if (requirements.transport_type) items.push(`Transport: ${formatValue(requirements.transport_type)}`);
                      if (requirements.transport_method) items.push(`Method: ${formatValue(requirements.transport_method)}`);
                      if (requirements.packing_requirements) items.push(`Packing: ${formatValue(requirements.packing_requirements)}`);
                      if (requirements.access_requirements) items.push(`Access: ${formatValue(requirements.access_requirements)}`);
                      if (requirements.delivery_requirements) items.push(`Delivery: ${formatValue(requirements.delivery_requirements)}`);
                      if (requirements.condition_check_requirements) items.push(`Condition Check: ${formatValue(requirements.condition_check_requirements)}`);
                      if (requirements.safety_security_requirements) items.push(`Safety/Security: ${formatValue(requirements.safety_security_requirements)}`);
                      if (items.length > 0) {
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', fontSize: '14px', color: 'rgba(23, 8, 73, 0.7)' }}>
                            {items.map((item, idx) => (
                              <React.Fragment key={idx}>
                                {idx > 0 && <span>•</span>}
                                <span>{item.split(': ')[0]}: <strong>{item.split(': ')[1]}</strong></span>
                              </React.Fragment>
                            ))}
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* Delivery specifics moved to its own card below */}
            </div>
            {quoteRequest.deliverySpecifics && Object.keys(quoteRequest.deliverySpecifics).length > 0 && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E9EAEB', borderRadius: '14px', padding: '20px', boxShadow: '0 0 40px rgba(10,13,18,0.12)', marginTop: '16px' }}>
                <h3 style={{ fontSize: '22px', margin: '0 0 12px', fontWeight: 700, color: '#0d1230' }}>Delivery specifics</h3>
                {/* Access Requirements */}
                {quoteRequest.deliverySpecifics?.access_requirements && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#1a153b', marginBottom: 8 }}>
                      <MeetingRoomIcon sx={{ color: '#7b5fd9' }} />
                      <span>Access Requirements</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {normalizeToArray(quoteRequest.deliverySpecifics.access_requirements).map((v, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 10px', borderRadius: 999, background: '#F0E6FF', color: '#8412ff', fontWeight: 700 }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Packing Requirements */}
                {quoteRequest.deliverySpecifics?.packing_requirements && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#1a153b', marginBottom: 8 }}>
                      <Inventory2Icon sx={{ color: '#7b5fd9' }} />
                      <span>Packing Requirements</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {normalizeToArray(quoteRequest.deliverySpecifics.packing_requirements).map((v, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 10px', borderRadius: 999, background: '#F0E6FF', color: '#8412ff', fontWeight: 700 }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Delivery Requirements */}
                {quoteRequest.deliverySpecifics?.delivery_requirements && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#1a153b', marginBottom: 8 }}>
                      <LocalShippingIcon sx={{ color: '#7b5fd9' }} />
                      <span>Delivery Requirements</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {normalizeToArray(quoteRequest.deliverySpecifics.delivery_requirements).map((v, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 10px', borderRadius: 999, background: '#F0E6FF', color: '#8412ff', fontWeight: 700 }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Condition Check Requirements */}
                {quoteRequest.deliverySpecifics?.condition_check_requirements && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#1a153b', marginBottom: 8 }}>
                      <FactCheckIcon sx={{ color: '#7b5fd9' }} />
                      <span>Condition Check Requirements</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {normalizeToArray(quoteRequest.deliverySpecifics.condition_check_requirements).map((v, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 10px', borderRadius: 999, background: '#F0E6FF', color: '#8412ff', fontWeight: 700 }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Safety Security Requirements */}
                {quoteRequest.deliverySpecifics?.safety_security_requirements && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#1a153b', marginBottom: 8 }}>
                      <ShieldIcon sx={{ color: '#7b5fd9' }} />
                      <span>Safety Security Requirements</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {normalizeToArray(quoteRequest.deliverySpecifics.safety_security_requirements).map((v, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 10px', borderRadius: 999, background: '#F0E6FF', color: '#8412ff', fontWeight: 700 }}>
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* RIGHT: Tabs with artworks and agents */}
          <aside aria-label="Right pane" style={{ background: '#FFFFFF', borderRadius: '10px', padding: '16px' }}>
            <Box
              sx={{
                display: 'inline-flex',
                width: '100%',
                gap: 1,
                marginBottom: '12px',
                padding: '6px',
                borderRadius: '14px',
                backgroundColor: 'rgba(132, 18, 255, 0.05)',
                boxShadow: 'inset 0 0 0 1px rgba(132, 18, 255, 0.08)',
              }}
            >
              {[{ id: 0, label: 'Artworks to ship', count: artworks.length }, { id: 1, label: 'Local shipping agents', count: (contactableShippers || []).length }].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <Box key={tab.id} sx={{ position: 'relative', flex: 1 }}>
                    {isActive && (
                      <motion.span
                        layoutId="estimateDetailToggle"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 10,
                          background: '#ffffff',
                          boxShadow: '0 10px 30px rgba(23, 8, 73, 0.12)',
                        }}
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setActiveTab(tab.id)}
                      aria-pressed={isActive}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        padding: '10px 18px',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#170849' : 'rgba(23, 8, 73, 0.65)',
                        fontFamily: 'DM Sans, Helvetica Neue, Arial, sans-serif',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 24,
                          height: 24,
                          padding: '0 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: isActive ? '#BDA0FF' : '#E0D7F5',
                          color: '#1b203a',
                        }}
                      >
                        {tab.count}
                      </span>
                    </motion.button>
                  </Box>
                );
              })}
            </Box>

            {activeTab === 0 ? (
              <>
                <div
                  style={{
                    marginTop: '8px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid #E6DEFF',
                    background: '#F7F3FF',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <span style={{ fontWeight: 600, color: '#170849' }}>Dimensions shown in:</span>
                    <Box
                      sx={{
                        position: 'relative',
                        display: 'inline-flex',
                        gap: 1,
                        padding: '4px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(132, 18, 255, 0.05)',
                        boxShadow: 'inset 0 0 0 1px rgba(132, 18, 255, 0.08)',
                      }}
                    >
                      {dimensionOptions.map(option => {
                        const isActive = dimensionUnit === option.value;
                        return (
                          <Box key={option.value} sx={{ position: 'relative', minWidth: 110, flex: 1 }}>
                            {isActive && (
                              <motion.span
                                layoutId="dimensionUnitToggle"
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  borderRadius: 10,
                                  background: '#ffffff',
                                  boxShadow: '0 8px 24px rgba(23, 8, 73, 0.12)',
                                }}
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                              />
                            )}
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setDimensionUnit(option.value)}
                              aria-pressed={isActive}
                              style={{
                                position: 'relative',
                                zIndex: 1,
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                padding: '8px 12px',
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: isActive ? 700 : 500,
                                color: isActive ? '#170849' : 'rgba(23, 8, 73, 0.65)',
                                fontFamily: 'DM Sans, Helvetica Neue, Arial, sans-serif',
                                cursor: 'pointer',
                              }}
                            >
                              {option.label}
                            </motion.button>
                          </Box>
                        );
                      })}
                    </Box>
                  </div>
                  <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>
                    Artwork dimensions are stored in centimeters. Switch units to view automatic conversions.
                  </span>
                </div>
                <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(() => {
                    const start = (currentPage - 1) * itemsPerPage;
                    const paginatedArtworks = artworks.slice(start, start + itemsPerPage);
                    return paginatedArtworks.map((artwork, idx) => {
                      const formattedValue = formatCurrency(artwork.value);
                    const artistLine = [artwork.artist, artwork.year ? `• ${artwork.year}` : null]
                      .filter(Boolean)
                      .join(' ');
                    const description = artwork.description && artwork.description.trim().length > 0
                      ? artwork.description.trim()
                      : null;
                    const convertedDimensions = convertDimensionsForUnit(artwork.dimensions, dimensionUnit);
                    const formattedWeight = (() => {
                      const value = typeof artwork.weightValue === 'number' && Number.isFinite(artwork.weightValue)
                        ? artwork.weightValue
                        : null;
                      if (value !== null) {
                        return `${value}${artwork.weightUnit ? ` ${artwork.weightUnit}` : ''}`.trim();
                      }
                      return artwork.weight && artwork.weight.trim().length > 0 ? artwork.weight : null;
                    })();
                    const formattedVolumetricWeight = (() => {
                      const value = typeof artwork.volumetricWeightValue === 'number' && Number.isFinite(artwork.volumetricWeightValue)
                        ? artwork.volumetricWeightValue
                        : null;
                      if (value !== null) {
                        return `${value}${artwork.volumetricWeightUnit ? ` ${artwork.volumetricWeightUnit}` : ''}`.trim();
                      }
                      return null;
                    })();
                    const detailItems = [
                      { label: 'Medium', value: artwork.medium },
                      { label: 'Dimensions', value: convertedDimensions },
                      { label: 'Country of origin', value: artwork.countryOfOrigin },
                      { label: 'Customs status', value: artwork.currentCustomsStatus },
                      { label: 'Category', value: artwork.category },
                      { label: 'Item type', value: artwork.itemType },
                      { label: 'Period', value: artwork.period },
                      { label: 'Weight', value: formattedWeight },
                      { label: 'Volumetric weight', value: formattedVolumetricWeight },
                      { label: 'Tariff code', value: artwork.tariffCode },
                      { label: 'Crating', value: artwork.crating },
                      { label: 'Existing crate', value: typeof artwork.hasExistingCrate === 'boolean' ? (artwork.hasExistingCrate ? 'Yes' : 'No') : null }
                    ].filter(item => Boolean(item.value) && String(item.value).trim() !== '');
                    const specialRequirementLabels = normalizeSpecialRequirements(artwork.specialRequirements);

                    return (
                      <li
                        key={artwork.id}
                        style={{
                          position: 'relative',
                          background: 'rgba(224, 222, 226, 0.2)',
                          border: '1px solid #F0E6FF',
                          borderRadius: 16,
                          padding: 18,
                          display: 'flex',
                          gap: 18,
                          alignItems: 'flex-start'
                        }}
                      >
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div
                            style={{
                              width: 96,
                              height: 96,
                              borderRadius: 12,
                              background: '#FBF6FF',
                              border: artwork.imageStatus === 'ready' ? 'none' : '2px dashed #B587E8',
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {artwork.imageStatus === 'ready' && artwork.imageUrl ? (
                              <img
                                src={artwork.imageUrl}
                                alt={artwork.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(event) => handleArtworkImageError(artwork.id, artwork.imageUrl, event)}
                              />
                            ) : artwork.imageStatus === 'loading' ? (
                              <CircularProgress size={26} thickness={4} />
                            ) : artwork.imageStatus === 'error' ? (
                              <button
                                type="button"
                                onClick={() => refreshArtworkImage(artwork.id, { force: true })}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  background: 'rgba(251, 246, 255, 0.9)',
                                  color: '#8412ff',
                                  fontWeight: 700,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: 4
                                }}
                              >
                                Retry
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: '#9ea3b5', textAlign: 'center' }}>No image</span>
                            )}
                          </div>
                          {artwork.imageStatus === 'error' && artwork.imageError ? (
                            <span style={{ fontSize: 10, color: '#d32f2f', lineHeight: 1.2 }}>{artwork.imageError}</span>
                          ) : null}
                        </div>
                        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 800, color: '#1b203a', fontSize: 18, lineHeight: 1.2 }}>{artwork.title || 'Untitled artwork'}</div>
                              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#3f475a' }}>{artistLine || 'Unknown artist'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7085', fontWeight: 700 }}>Declared value</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: '#170849', fontFamily: 'Space Grotesk, monospace' }}>{formattedValue}</div>
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7085', fontWeight: 700, marginBottom: 4 }}>Description</div>
                            <div style={{ fontSize: 13, color: description ? '#1b203a' : '#6b7085', lineHeight: 1.5 }}>
                              {description || <span style={{ fontStyle: 'italic' }}>No description provided</span>}
                            </div>
                          </div>

                          {detailItems.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                              {detailItems.map(item => (
                                <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7085', fontWeight: 700 }}>{item.label}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1b203a' }}>{item.value}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {specialRequirementLabels.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7085', fontWeight: 700 }}>Special requirements</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {specialRequirementLabels.map((label) => (
                                  <span
                                    key={label}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      height: 28,
                                      padding: '0 12px',
                                      borderRadius: 999,
                                      background: '#F0E6FF',
                                      color: '#8412ff',
                                      fontWeight: 700,
                                      fontSize: 12
                                    }}
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div aria-hidden="true" style={{ position: 'absolute', top: 10, right: 14, fontWeight: 700, color: '#1b203a', opacity: 0.25 }}>{start + idx + 1}</div>
                      </li>
                    );
                  });
                })()}
                </ol>
              </>
            ) : (
              <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(() => {
                  const list = (contactableShippers || []);
                  const start = (currentPage - 1) * itemsPerPage;
                  const paginated = list.slice(start, start + itemsPerPage);
                  return paginated.map((shipper: any) => {
                    const { primaryLogo, fallbackLogo } = resolveLocalAgentLogo(shipper);
                    const shipperDisplayName = shipper?.name || 'Local shipping agent';
                    const shipperAbbreviation = deriveInitials(shipperDisplayName);

                    return (
                  <li key={shipper.id} style={{ background: 'rgba(224, 222, 226, 0.2)', border: '1px solid #F0E6FF', borderRadius: 16, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <ShipperAvatar
                          name={shipperDisplayName}
                          abbreviation={shipperAbbreviation}
                          brandColor="#8412ff"
                          imageUrl={primaryLogo}
                          fallbackImageUrl={fallbackLogo}
                          size={56}
                          style={{ borderRadius: '999px', background: '#EDEAF7' }}
                        />
                        <div>
                          <div style={{ fontWeight: 800, color: '#170849', fontSize: 18, lineHeight: 1.2 }}>{shipperDisplayName}</div>
                          <div style={{ color: '#6b7085', fontWeight: 600 }}>{shipper.contact_name || 'Fine art & antiquities'}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedShipper(selectedShipper === shipper.id ? '' : shipper.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, background: 'transparent', border: 'none', color: '#8412ff', fontWeight: 800, cursor: 'pointer' }}
                      >
                        Contact agent
                        <span style={{ display: 'inline-flex', transform: selectedShipper === shipper.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                          <KeyboardArrowDownIcon />
                        </span>
                      </button>
                    </div>
                    {selectedShipper === shipper.id && (
                      <div style={{ marginTop: 14 }}>
                        {chatError && (
                          <Alert severity="error" onClose={clearChatError} sx={{ mb: 1 }}>
                            {chatError}
                          </Alert>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFFFF', border: '1.5px solid #ECE7FB', borderRadius: 14, padding: '12px 12px 12px 14px', boxShadow: '0 1px 0 rgba(0,0,0,0.02)' }}>
                          <input
                            style={{ flex: 1, border: 'none', outline: 'none', font: 'inherit', color: '#3f475a', background: 'transparent' }}
                            placeholder="Type your message..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={chatLoading}
                          />
                          <button
                            className="send-pill"
                            onClick={handleSendMessage}
                            disabled={chatLoading || !message.trim()}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              background: message.trim() ? '#E9D6FF' : '#F3EEFF',
                              color: '#8412ff',
                              border: 'none',
                              opacity: chatLoading || !message.trim() ? 0.6 : 1,
                              cursor: chatLoading || !message.trim() ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <SendIcon fontSize="small" />
                          </button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MessageOutlinedIcon sx={{ fontSize: 18 }} />}
                            onClick={handleOpenConversationInMessages}
                            sx={messageButtonSx}
                          >
                            Open full conversation
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                    );
                  });
                })()}
              </ul>
            )}

            {(() => {
              const totalItems = activeTab === 0 ? artworks.length : (contactableShippers || []).length;
              const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
              const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
              const canPrev = currentPage > 1;
              const canNext = currentPage < totalPages;
              return (
                <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
                  <Button variant="text" disabled={!canPrev} onClick={() => canPrev && setCurrentPage(currentPage - 1)} sx={{ color: '#3f475a', fontWeight: 600, textTransform: 'none' }}>Previous</Button>
                  <ol style={{ display: 'flex', listStyle: 'none', gap: 12, padding: 0, margin: 0 }}>
                    {pages.map((p) => (
                      <li key={p}><button onClick={() => setCurrentPage(p)} style={{ minWidth: 32, height: 32, padding: '0 10px', borderRadius: 10, border: 'none', background: p === currentPage ? '#F0E6FF' : 'transparent', fontWeight: 700 }}>{p}</button></li>
                    ))}
                  </ol>
                  <Button variant="text" disabled={!canNext} onClick={() => canNext && setCurrentPage(currentPage + 1)} sx={{ color: '#3f475a', fontWeight: 600, textTransform: 'none' }}>Next</Button>
                </nav>
              );
            })()}
          </aside>

          {/* Bid Specifications Modal */}
          <Dialog
            open={isBidModalOpen}
            onClose={() => setIsBidModalOpen(false)}
            maxWidth="lg"
            fullWidth
            PaperProps={{ sx: { borderRadius: '24px' } }}
          >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, color: '#1b1440' }}>Estimate line items</Typography>
                <Typography variant="body2" sx={{ color: '#3f475a', fontWeight: 700 }}> {quoteRequest.title} • Quote: <strong>{quoteRequest.code}</strong></Typography>
              </Box>
              <IconButton onClick={() => setIsBidModalOpen(false)} aria-label="Close">×</IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {lineItems.map((item) => (
                  <Box key={item.id} sx={{ position: 'relative', background: '#F6F7FB', border: '1px solid #E9EAEB', borderRadius: '14px', p: 2 }}>
                    <Typography variant="h6" sx={{ fontSize: 20, fontWeight: 800, mb: 1, color: '#1a153b' }}>{item.name}</Typography>
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        fontWeight: 800,
                        background: '#F0E6FF',
                        borderRadius: '12px',
                        px: 1.5,
                        py: 1,
                        boxShadow: '0 1px 2px rgba(132, 18, 255, 0.15)',
                        fontFamily: fractulFontStack
                      }}
                    >
                      <span>{currencySymbol}</span>
                      <TextField
                        value={item.cost}
                        onChange={(e) => handleLineItemCostChange(item.id, e.target.value)}
                        size="small"
                        variant="standard"
                        InputProps={{
                          disableUnderline: true,
                          inputProps: {
                            style: {
                              fontFamily: fractulFontStack,
                              fontWeight: 800,
                              fontSize: '16px',
                              width: '120px',
                              textAlign: 'right',
                              cursor: 'text'
                            },
                            inputMode: 'decimal',
                            pattern: '[0-9]*'
                          }
                        }}
                        sx={{
                          '& .MuiInputBase-root': {
                            background: 'transparent',
                            paddingRight: 0,
                            cursor: 'text'
                          },
                          '& input::placeholder': {
                            color: 'rgba(23, 8, 73, 0.45)',
                            opacity: 1
                          }
                        }}
                        placeholder="0.00"
                        aria-label={`${item.name} cost`}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1.5, fontFamily: fractulFontStack }}>
                      {(() => {
                        const subItems = SUB_LINE_ITEMS[item.id as EstimateLineItemId] || [];
                        const selectedValues = selectedSubItems[item.id] || [];
                        const labelId = `${item.id}-subitems-label`;
                        const selectId = `${item.id}-subitems-select`;
                        const placeholder = 'Select options';

                        if (!subItems.length) {
                          return (
                            <Typography variant="body2" sx={{ color: '#3f475a', opacity: 0.7 }}>
                              No selectable services for this section.
                            </Typography>
                          );
                        }

                        return (
                          <FormControl
                            fullWidth
                            sx={{
                              fontFamily: fractulFontStack,
                              '& .MuiInputLabel-root': { fontFamily: fractulFontStack },
                              '& .MuiOutlinedInput-input': { fontFamily: fractulFontStack },
                              '& .MuiChip-root': { fontFamily: fractulFontStack },
                              '& .MuiChip-label': { fontFamily: fractulFontStack }
                            }}
                          >
                            <InputLabel id={labelId} shrink>
                              {placeholder}
                            </InputLabel>
                            <Select
                              labelId={labelId}
                              id={selectId}
                              multiple
                              displayEmpty
                              value={selectedValues}
                              onChange={handleSubItemsSelectChange(item.id)}
                              input={<OutlinedInput label={placeholder} />}
                              renderValue={(selected) => {
                                const values = selected as string[];

                                if (!values.length) {
                                  return (
                                    <span style={{ color: theme.palette.text.disabled, fontFamily: fractulFontStack }}>
                                      {placeholder}
                                    </span>
                                  );
                                }

                                return (
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {values.map((value) => {
                                      const subItem = subItems.find((s) => s.id === value);
                                      const label = subItem?.name || value;
                                      return (
                                        <Chip
                                          key={value}
                                          label={label}
                                          onDelete={() => handleSubItemToggle(item.id, value)}
                                          onMouseDown={(event) => event.stopPropagation()}
                                          sx={{ maxWidth: '100%', fontFamily: fractulFontStack }}
                                        />
                                      );
                                    })}
                                  </Box>
                                );
                              }}
                              MenuProps={defaultMenuProps}
                            >
                              {subItems.map((subItem) => (
                                <MenuItem
                                  key={subItem.id}
                                  value={subItem.id}
                                  sx={{
                                    fontFamily: fractulFontStack,
                                    fontWeight: selectedValues.includes(subItem.id)
                                      ? theme.typography.fontWeightMedium
                                      : theme.typography.fontWeightRegular
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {getSubItemIcon(subItem.id)}
                                    <span>{subItem.name}</span>
                                  </Box>
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        );
                      })()}
                    </Box>
                  </Box>
                ))}
                
                {/* Notes and Valid Until */}
                <TextField
                  label="Notes to Client"
                  multiline
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  fullWidth
                  placeholder="Any additional information or special considerations..."
                  helperText="Customize anything beyond our standard exclusions below."
                />
                <EstimateExclusionsNotice
                  compact
                  title="Standard exclusions shared with clients"
                  style={{ width: '100%' }}
                />
                <Typography variant="caption" sx={{ color: 'rgba(23, 8, 73, 0.75)' }}>
                  Palette automatically includes these notes on every estimate that is sent to galleries.
                </Typography>
                <TextField
                  label="Quote valid until"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  fullWidth
                  required
                  InputLabelProps={{ shrink: true }}
                  helperText="Required for submission"
                />
              </Box>

              {/* Summary & Artwork details */}
              <Box
                sx={{
                  background: '#F0E6FF',
                  borderRadius: '14px',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    padding: '4px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(132, 18, 255, 0.05)',
                    boxShadow: 'inset 0 0 0 1px rgba(132, 18, 255, 0.08)',
                  }}
                >
                  {bidModalInfoOptions.map((option) => {
                    const isActive = bidModalInfoTab === option.id;
                    return (
                      <Box key={option.id} sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
                        {isActive && (
                          <motion.span
                            layoutId="bidModalInfoToggle"
                            style={{
                              position: 'absolute',
                              inset: 0,
                              borderRadius: 10,
                              background: '#ffffff',
                              boxShadow: '0 8px 24px rgba(23, 8, 73, 0.12)',
                            }}
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setBidModalInfoTab(option.id)}
                          aria-pressed={isActive}
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            padding: '10px 12px',
                            borderRadius: 10,
                            fontSize: 14,
                            fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#170849' : 'rgba(23, 8, 73, 0.65)',
                            fontFamily: 'DM Sans, Helvetica Neue, Arial, sans-serif',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span>{option.label}</span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 28,
                              height: 24,
                              padding: '0 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              background: isActive ? '#BDA0FF' : '#E0D7F5',
                              color: '#1b203a',
                            }}
                          >
                            {option.count}
                          </span>
                        </motion.button>
                      </Box>
                    );
                  })}
                </Box>
              <Box
                sx={{
                  pr: 0.5,
                  mt: 0.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                {bidModalInfoTab === 'summary' ? renderBidSummarySections() : renderArtworkDetailCards()}
              </Box>

                <Divider sx={{ borderColor: 'rgba(23, 8, 73, 0.08)', my: 1 }} />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" sx={{ color: '#170849', fontWeight: 600 }}>
                    Total
                  </Typography>
                  <Typography sx={{ fontSize: 26, fontWeight: 800, color: '#170849' }}>
                    {formatEstimateCurrency(totalEstimate)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button
                    variant="outlined"
                    startIcon={<DescriptionIcon sx={{ fontSize: 18 }} />}
                    onClick={handleExportPdf}
                    disabled={exportButtonDisabled}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      borderRadius: '12px',
                      borderColor: exportButtonDisabled ? '#d5d3de' : '#b8a6ff',
                      color: exportButtonDisabled ? '#7a7d8f' : '#4c3b8f',
                      backgroundColor: exportButtonDisabled ? '#f1f2f6' : '#ffffff',
                      '&:hover': {
                        borderColor: exportButtonDisabled ? '#d5d3de' : '#8e7cff',
                        backgroundColor: exportButtonDisabled ? '#f1f2f6' : '#f7f3ff',
                      },
                    }}
                  >
                    {exportingPdf ? 'Downloading PDF...' : 'Download estimate PDF'}
                  </Button>
                  {letterheadAvailable === false && (
                    <Alert severity="info" sx={{ mt: 0.5 }}>
                      {letterheadMessage || 'No letterhead found for this branch. Please contact support to add your letterhead.'}
                    </Alert>
                  )}
                  {exportHelperText && letterheadAvailable !== false && (
                    <Typography variant="caption" sx={{ color: '#4a4f63' }}>
                      {exportHelperText}
                    </Typography>
                  )}
                  {exportError && (
                    <Alert severity="error" sx={{ mt: 0.5 }}>
                      {exportError}
                    </Alert>
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <motion.button
                    type="button"
                    onClick={handleSubmitBid}
                    disabled={isSubmitActionDisabled}
                    whileHover={(!isSubmitActionDisabled && submissionState !== 'success') ? { scale: 1.01 } : undefined}
                    whileTap={(!isSubmitActionDisabled && submissionState !== 'success') ? { scale: 0.985 } : undefined}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      borderRadius: '12px',
                      border: submitButtonVisualStyles.border,
                      background: submitButtonVisualStyles.background,
                      color: submitButtonVisualStyles.color,
                      fontFamily: fractulFontStack,
                      fontWeight: 700,
                      fontSize: '16px',
                      letterSpacing: '0.2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: isSubmitActionDisabled ? 'not-allowed' : 'pointer',
                      boxShadow: submitButtonVisualStyles.boxShadow,
                      padding: '12px 18px',
                      transition: 'all 0.24s ease',
                      outline: 'none'
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {deadlineExpiredForSubmission ? (
                        <motion.span
                          key="deadline"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          Bidding closed
                        </motion.span>
                      ) : submissionState === 'success' ? (
                        <motion.span
                          key="success"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.22, ease: 'easeOut' }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <CheckIcon sx={{ fontSize: 18 }} />
                          <span>Submitted!</span>
                        </motion.span>
                      ) : submissionState === 'loading' ? (
                        <motion.span
                          key="loading"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <CircularProgress size={16} sx={{ color: submitButtonVisualStyles.color }} thickness={5} />
                          <span>Submitting...</span>
                        </motion.span>
                      ) : submitting ? (
                        <motion.span
                          key="processing"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <CircularProgress size={16} sx={{ color: submitButtonVisualStyles.color }} thickness={5} />
                          <span>Processing...</span>
                        </motion.span>
                      ) : (
                        <motion.span
                          key="idle"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <SendIcon sx={{ fontSize: 18 }} />
                          <span>{isAuction ? estimateActionLabel : 'Submit Estimate'}</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsBidModalOpen(false)} sx={{ textTransform: 'none' }}>Close</Button>
            </DialogActions>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default SubmitBid; 
