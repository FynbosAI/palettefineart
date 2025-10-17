import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, TextField, FormControl, Chip, IconButton, Tabs, Tab, Box, Typography, Paper, InputAdornment, Avatar, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Divider, Select, MenuItem, OutlinedInput, InputLabel } from '@mui/material';
import { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SecurityIcon from '@mui/icons-material/Security';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
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
import useChatStore from '../../store/chatStore';
import { useDeadlineCountdown } from '../../lib/deadline';
import RouteMap from '../Map';
import CountdownClock from '../../../../shared/ui/CountdownClock';

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
  countryOfOrigin: string;
  currentCustomsStatus: string;
  tariffCode: string;
  crating: string;
  specialRequirements: any;
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
  declared_value?: number;
  crating?: string;
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

const SUB_LINE_ITEMS = {
  delivery_requirements: [
    { id: 'ground_floor_curbside_delivery', name: 'Ground Floor/Curbside Delivery' },
    { id: 'dock_to_dock_delivery', name: 'Dock-to-Dock Delivery' },
    { id: 'unpacking_service', name: 'Unpacking Service' },
    { id: 'installation_service', name: 'Installation Service' },
    { id: 'condition_checking', name: 'Condition Checking' },
    { id: 'debris_removal', name: 'Debris Removal' },
    { id: 'white_glove_service', name: 'White Glove Service' },
  ],
  packing_requirements: [
    { id: 'existing_crate_reuse', name: 'Existing Crate (Reuse)' },
    { id: 'soft_wrap_blanket_wrap', name: 'Soft Wrap/Blanket Wrap' },
    { id: 'standard_crate', name: 'Standard Crate' },
    { id: 'single_crate', name: 'Single Crate' },
    { id: 'double_wall_crate', name: 'Double-Wall Crate' },
    { id: 'double_crate', name: 'Double Crate' },
    { id: 'museum_crate_full', name: 'Museum Crate Full' },
    { id: 'museum_crate_sub', name: 'Museum Crate Sub' },
    { id: 'climate_controlled_crate', name: 'Climate-Controlled Crate' },
    { id: 't_frame', name: '"T Frame"' },
    { id: 't_frame_handles', name: 'T Frame Handles' },
    { id: 'ply_box', name: 'Ply Box' },
    { id: 'tri_wall', name: 'Tri Wall' },
    { id: 'foam_lined', name: 'Foam Lined' },
    { id: 'crating_services', name: 'Crating Services' },
    { id: 'crate_rental', name: 'Crate Rental' },
    { id: 'pre_packed_no_service', name: 'Pre-Packed (No Service Needed)' },
  ],
  access_at_delivery: [
    { id: 'ground_floor_unrestricted_access', name: 'Ground Floor - Unrestricted Access' },
    { id: 'freight_elevator_available', name: 'Freight Elevator Available' },
    { id: 'stairs_only', name: 'Stairs Only' },
    { id: 'special_equipment_required', name: 'Special Equipment Required' },
    { id: 'loading_dock_available', name: 'Loading Dock Available' },
    { id: 'onsite_visit', name: 'Onsite Visit (pre-delivery/site survey)' },
    { id: 'parking_suspension', name: 'Parking Suspension' },
  ],
  safety_security_requirements: [
    { id: 'climate_controlled_container', name: 'Climate-Controlled Container' },
    { id: 'two_person_delivery_team', name: 'Two-Person Delivery Team' },
    { id: 'air_ride_suspension_vehicle', name: 'Air-Ride Suspension Vehicle' },
    { id: 'gps_tracking', name: 'GPS Tracking' },
    { id: 'security_escort_vehicle', name: 'Security Escort Vehicle' },
    { id: 'signature_on_delivery', name: 'Signature on Delivery' },
    { id: 'fixed_delivery_address', name: 'Fixed Delivery Address' },
    { id: 'no_redirection_allowed', name: 'No Redirection Allowed' },
    { id: 'airport_security_supervision', name: 'Airport Security Supervision' },
  ],
  condition_check_requirements: [
    { id: 'basic_condition_notes', name: 'Basic Condition Notes' },
    { id: 'pre_collection_inspection', name: 'Pre-Collection Inspection' },
    { id: 'inspection', name: 'Inspection' },
    { id: 'photo_documentation_2_plus', name: 'Photo Documentation (2+ photos)' },
    { id: 'photographs_additional', name: 'Photographs (additional/general)' },
    { id: 'comprehensive_photo_set_3_plus', name: 'Comprehensive Photo Set (3+ photos)' },
    { id: 'articheck', name: 'Articheck (digital condition reporting)' },
    { id: 'professional_condition_report', name: 'Professional Condition Report' },
    { id: 'detailed_report_with_commentary', name: 'Detailed Report with Commentary' },
    { id: 'condition_check', name: 'Condition Check' },
  ],
  movement_routing_domestic: [
    { id: 'domestic_move', name: 'Domestic Move' },
    { id: 'domestic_move_into_storage', name: 'Domestic Move Into Storage' },
    { id: 'domestic_move_out_of_storage', name: 'Domestic Move Out of Storage' },
    { id: 'emergency_art_evacuation', name: 'Emergency Art Evacuation' },
  ],
  movement_routing_exports: [
    { id: 'export_air', name: 'Export AIR' },
    { id: 'export_air_mib', name: 'Export AIR MIB' },
    { id: 'export_courier', name: 'Export Courier' },
    { id: 'export_road_dedicated', name: 'Export Road Dedicated' },
    { id: 'export_road_groupage', name: 'Export Road Groupage' },
    { id: 'export_road_agent', name: 'Export Road Agent' },
    { id: 'export_fcl', name: 'Export FCL' },
    { id: 'export_lcl', name: 'Export LCL' },
  ],
  movement_routing_cross_trade: [
    { id: 'cross_trade_air', name: 'Cross Trade AIR' },
    { id: 'cross_trade_road', name: 'Cross Trade Road' },
    { id: 'cross_trade_fcl', name: 'Cross Trade FCL' },
    { id: 'cross_trade_sea_lcl', name: 'Cross Trade Sea LCL' },
  ],
  movement_routing_imports: [
    { id: 'import_air', name: 'Import AIR' },
    { id: 'import_air_mib', name: 'Import AIR MIB' },
    { id: 'import_courier', name: 'Import Courier' },
    { id: 'import_road_dedicated', name: 'Import Road Dedicated' },
    { id: 'import_road_groupage', name: 'Import Road Groupage' },
    { id: 'import_road_agent', name: 'Import Road Agent' },
    { id: 'import_fcl', name: 'Import FCL' },
    { id: 'import_lcl', name: 'Import LCL' },
  ],
  customs_licences_documentation: [
    { id: 'export_clearance_only', name: 'Export Clearance ONLY' },
    { id: 'import_clearance_only', name: 'Import Clearance ONLY' },
    { id: 'certificate_of_origin', name: 'Certificate of Origin' },
    { id: 'export_licence', name: 'Export Licence' },
    { id: 'cites_licence', name: 'CITES Licence' },
    { id: 'notarizing_documents', name: 'Notarizing Documents' },
    { id: 'vat_and_duty', name: 'VAT & Duty' },
  ],
  warehouse_viewing_services: [
    { id: 'receive', name: 'Receive' },
    { id: 'warehouse_transfer', name: 'Warehouse Transfer' },
    { id: 'viewing_room_full_day', name: 'Viewing Room Full Day' },
    { id: 'viewing_room_half_day', name: 'Viewing Room Half Day' },
    { id: 'handout', name: 'Handout' },
  ],
} as const;

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

type LineItemKey = keyof typeof SUB_LINE_ITEMS;
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
  const { formatCurrency } = useCurrency();
  
  // Use the bid form hook for form management
  const bidForm = useBidForm({ quoteId: id || '' });
  const { 
    lineItems,
    selectedSubItems,
    customLineItems,
    insuranceIncluded,
    specialServices,
    notes,
    validUntil,
    estimatedTransitTime,
    handleLineItemCostChange,
    handleSubItemToggle,
    addCustomLineItem,
    removeCustomLineItem,
    updateCustomLineItemCost,
    setInsuranceIncluded,
    setSpecialServices,
    setNotes,
    setValidUntil,
    setEstimatedTransitTime,
    calculateTotal,
    handleSaveDraft,
    handleSubmit
  } = bidForm;
  const theme = useTheme();
  
  // Determine if this is a bid (auction) or quote (direct) submission
  const isAuction = window.location.pathname.includes('/bid');
  const isDirect = window.location.pathname.includes('/quote');
  
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
    ? 'Gallery will close bidding manually'
    : deadlineState.isExpired
      ? 'Bidding closed — deadline passed'
      : `Bidding closes in ${deadlineState.label}`;
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

  // Additional local state for UI
  const [selectedSubItemsLocal, setSelectedSubItemsLocal] = useState<{[key: string]: string[]}>({
    '1': [],
    '2': [],
    '3': [],
    '4': []
  });

  const [newCustomItemName, setNewCustomItemName] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

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
  const [isBidModalOpen, setIsBidModalOpen] = useState<boolean>(false);
  const [hasAppliedDeliverySpecifics, setHasAppliedDeliverySpecifics] = useState(false);
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
    if (bidForQuote) {
      setNotes(bidForQuote.notes || '');
      setInsuranceIncluded(!!bidForQuote.insurance_included);
      setSpecialServices(Array.isArray(bidForQuote.special_services) ? bidForQuote.special_services : []);
      setEstimatedTransitTime(bidForQuote.estimated_transit_time || '');
      setValidUntil(bidForQuote.valid_until || '');
    }
  }, [bidForQuote, setNotes, setInsuranceIncluded, setSpecialServices, setEstimatedTransitTime, setValidUntil]);

  // Set default quote valid until date (30 days from now) if no existing bid
  useEffect(() => {
    if (!bidForQuote) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    setValidUntil(defaultDate.toISOString().split('T')[0]);
    }
  }, [bidForQuote, setValidUntil]);

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
  
  
  // Loading state
  if (loading || !quote) {
    return (
      <div className="main-wrap">
        <div className="main-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <CircularProgress sx={{ color: '#00AAAB' }} />
        </div>
      </div>
    );
  }

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
    transportMode: 'TBD',
    insurance: quote.delivery_specifics?.insurance_requirements || 'Standard',
    autoCloseBidding: quote.auto_close_bidding !== false,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
    shipmentId: quote.shipment_id || null,
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
      countryOfOrigin: artwork.country_of_origin || '',
      currentCustomsStatus: artwork.export_license_required ? 'License Required' : 'Cleared',
      tariffCode: artwork.tariff_code || '',
      crating: artwork.crating || '',
      specialRequirements: artwork.special_requirements || null,
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

  const availableServices = [
    { id: 'crating', label: 'Professional Crating' },
    { id: 'installation', label: 'Installation Service' },
    { id: 'climate', label: 'Climate Control' },
    { id: 'storage', label: 'Temporary Storage' }
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



  const handleAddCustomLineItem = () => {
    if (newCustomItemName.trim()) {
      addCustomLineItem(newCustomItemName);
      setNewCustomItemName('');
    }
  };




  const handleSubmitBid = async () => {
    if (!quote) return;
    if (deadlineExpiredForSubmission) {
      alert('Bidding deadline has passed. Please contact the gallery for next steps.');
      return;
    }

    const totalAmount = calculateTotal();
    if (totalAmount === 0 || !validUntil) {
      alert('Please select services and set a valid until date');
      return;
    }

    setSubmitting(true);
    
    try {
      // Use the bid form hook's submit function
      const result = await handleSubmit();
      
      if (result.success) {
        console.log('Bid submitted successfully:', {
          bidId: result.data?.id,
          totalAmount
        });
        if (result.warnings && result.warnings.length > 0) {
          const warningMessage = result.warnings.map((warning) => `- ${warning}`).join('\n');
          alert(`${isAuction ? 'Bid' : 'Quote'} submitted with warnings:\n${warningMessage}`);
        } else {
          alert(`${isAuction ? 'Bid' : 'Quote'} submitted successfully!`);
        }
        navigate('/estimates');
      } else {
        alert(`Failed to submit ${isAuction ? 'bid' : 'quote'}: ` + (result.errors?.join(', ') || 'Unknown error'));
      }
    } catch (error) {
      console.error(`Failed to submit ${isAuction ? 'bid' : 'quote'}:`, error);
      alert(`Failed to submit ${isAuction ? 'bid' : 'quote'}. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraftClick = async () => {
    setSubmitting(true);
    try {
      const result = await handleSaveDraft();
      if (result.success) {
        alert('Draft saved successfully!');
      } else {
        alert('Failed to save draft: ' + (result.errors?.join(', ') || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to save draft:', error);
      alert('Failed to save draft. Please try again.');
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
                  {deadlineExpiredForSubmission ? 'Bidding closed' : 'Bid now'}
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
                          alert('Failed to confirm bid');
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
                      {submitting ? 'Confirming...' : 'Confirm & Resubmit Bid'}
                    </Button>
                    <Button
                      variant="contained"
                      onClick={async () => {
                        if (!window.confirm('Are you sure you want to withdraw your bid?')) return;
                        setSubmitting(true);
                        const { error } = await withdrawBid(bidForQuote.id);
                        setSubmitting(false);
                        if (!error) { navigate('/estimates'); } else { alert('Failed to withdraw bid'); }
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
                  <RouteMap origin={originAddress} destination={destinationAddress} />
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
                <FlightIcon sx={{ color: '#364152' }} />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <button
                className={`tab ${activeTab === 0 ? 'active' : ''}`}
                onClick={() => setActiveTab(0)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', background: activeTab === 0 ? '#F0E6FF' : 'transparent', color: '#170849', fontWeight: 700, cursor: 'pointer', flex: 1, minWidth: 0, justifyContent: 'center', textAlign: 'center' }}
              >
                Artworks to ship <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 999, fontSize: 12, background: activeTab === 0 ? '#BDA0FF' : '#CDB6FF', color: '#1b203a' }}>{artworks.length}</span>
              </button>
              <button
                className={`tab ${activeTab === 1 ? 'active' : ''}`}
                onClick={() => setActiveTab(1)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', background: activeTab === 1 ? '#F0E6FF' : 'transparent', color: '#170849', fontWeight: 700, cursor: 'pointer', flex: 1, minWidth: 0, justifyContent: 'center', textAlign: 'center' }}
              >
                Local shipping agents <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 999, fontSize: 12, background: activeTab === 1 ? '#BDA0FF' : '#CDB6FF', color: '#1b203a' }}>{(contactableShippers || []).length}</span>
              </button>
            </div>

            {activeTab === 0 ? (
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
                    const detailItems = [
                      { label: 'Medium', value: artwork.medium },
                      { label: 'Dimensions', value: artwork.dimensions },
                      { label: 'Country of origin', value: artwork.countryOfOrigin },
                      { label: 'Customs status', value: artwork.currentCustomsStatus },
                      { label: 'Weight', value: artwork.weight },
                      { label: 'Tariff code', value: artwork.tariffCode },
                      { label: 'Crating', value: artwork.crating }
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
            ) : (
              <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(() => {
                  const list = (contactableShippers || []);
                  const start = (currentPage - 1) * itemsPerPage;
                  const paginated = list.slice(start, start + itemsPerPage);
                  return paginated.map((shipper: any) => (
                  <li key={shipper.id} style={{ background: 'rgba(224, 222, 226, 0.2)', border: '1px solid #F0E6FF', borderRadius: 16, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div className="avatar" style={{ width: 56, height: 56, borderRadius: 999, background: '#EDEAF7', overflow: 'hidden' }}>
                          {shipper.img_url ? <img src={shipper.img_url} alt={shipper.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#170849', fontSize: 18, lineHeight: 1.2 }}>{shipper.name}</div>
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
                  ));
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
          <Dialog open={isBidModalOpen} onClose={() => setIsBidModalOpen(false)} maxWidth="lg" fullWidth>
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
                      <span>$</span>
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
                        const subItems = SUB_LINE_ITEMS[item.id as keyof typeof SUB_LINE_ITEMS] || [];
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

                {/* Custom line items */}
                {customLineItems.map((item) => (
                  <Box key={item.id} sx={{ background: '#F6F7FB', border: '1px solid #E9EAEB', borderRadius: '14px', p: 2 }}>
                    <Typography variant="subtitle2" sx={{ color: '#1a153b', fontWeight: 800, mb: 1 }}>{item.name}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TextField type="number" value={item.cost} onChange={(e) => updateCustomLineItemCost(item.id, e.target.value)} size="small" placeholder="0" InputProps={{ startAdornment: <span style={{ marginRight: 4, color: '#666' }}>$</span> }} sx={{ width: 160, '& .MuiOutlinedInput-root': { background: '#fff' } }} />
                      <IconButton onClick={() => removeCustomLineItem(item.id)} size="small" sx={{ color: '#999', '&:hover': { color: '#f44336' } }}>×</IconButton>
                    </Box>
                  </Box>
                ))}

                {/* Add custom item */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField value={newCustomItemName} onChange={(e) => setNewCustomItemName(e.target.value)} placeholder="Add custom line item..." size="small" onKeyPress={(e) => { if ((e as any).key === 'Enter') { e.preventDefault(); handleAddCustomLineItem(); } }} />
                  <Button onClick={handleAddCustomLineItem} disabled={!newCustomItemName.trim()} variant="outlined" size="small" startIcon={<AddIcon />}>Add</Button>
                </Box>

                {/* Notes and Valid Until */}
                <TextField label="Notes to Client" multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth placeholder="Any additional information or special considerations..." />
                {/* <TextField label="Quote Valid Until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} /> */}
              </Box>

              {/* Summary */}
              <Box sx={{ background: '#F0E6FF', borderRadius: '14px', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {(() => {
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
                  return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {(() => {
                        const filtered = lineItems.filter((li) => {
                          const selectedIds = selectedSubItems[li.id] || [];
                          const hasAny = selectedIds.length > 0;
                          const hasPrice = (parseFloat(li.cost as any) || 0) > 0;
                          return hasAny || hasPrice;
                        });
                        return filtered.map((item, idx) => {
                          const selectedIds = selectedSubItems[item.id] || [];
                          const hasAny = selectedIds.length > 0;
                          const label = sectionLabels[item.id as keyof typeof sectionLabels] || item.name;
                          return (
                            <Box key={item.id} sx={{ pb: 1, borderBottom: idx < filtered.length - 1 ? '1px solid #E2D7FF' : 'none' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#170849', mb: 0.5 }}>{label}</Typography>
                              {hasAny ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                  {selectedIds.map((sid) => {
                                    const sub = (SUB_LINE_ITEMS as any)[item.id]?.find((s: any) => s.id === sid);
                                    return (
                                      <Box key={sid} sx={{ color: '#3f475a' }}>
                                        {sub?.name || sid}
                                      </Box>
                                    );
                                  })}
                                </Box>
                              ) : (
                                <Typography variant="body2" sx={{ color: '#170849', opacity: 0.55 }}>No selections</Typography>
                              )}
                            </Box>
                          );
                        });
                      })()}
                    </Box>
                  );
                })()}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                  <span>Total</span>
                <span style={{ fontSize: 26, fontWeight: 800 }}>{formatCurrency(calculateTotal())}</span>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                  <Button
                    variant="outlined"
                    onClick={handleSaveDraftClick}
                    disabled={submitting}
                    sx={{ textTransform: 'none' }}
                  >
                    {submitting ? 'Saving...' : 'Save draft'}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleSubmitBid}
                    disabled={submitting || calculateTotal() === 0 || !validUntil || deadlineExpiredForSubmission}
                    sx={{
                      background: '#8412ff',
                      '&:hover': { background: '#730add' },
                      '&.Mui-disabled': { backgroundColor: 'rgba(23, 8, 73, 0.12)', color: 'rgba(23, 8, 73, 0.45)' },
                      textTransform: 'none',
                      fontWeight: 700
                    }}
                  >
                    {deadlineExpiredForSubmission
                      ? 'Bidding closed'
                      : submitting
                        ? 'Submitting...'
                        : (isAuction ? 'Submit Bid' : 'Submit Quote')}
                  </Button>
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
