import React, { useState, useEffect, useRef } from 'react';
import { Button, TextField, FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, Checkbox, FormGroup, Chip, IconButton, Tabs, Tab, Box, Typography, Paper, InputAdornment, Avatar, CircularProgress, Alert } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SecurityIcon from '@mui/icons-material/Security';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
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
import { useNavigate, useParams } from 'react-router-dom';
import { useBidForm } from '../../hooks/useBidForm';
import { useQuoteDetails, useLoadingState, useQuotes, useContactableShippers, useBids } from '../../hooks/useStoreSelectors';

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
}

interface QuoteRequest {
  id: string;
  title: string;
  code: string;
  gallery: string;
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
}

interface SubLineItem {
  id: string;
  name: string;
  cost: number;
}

const SubmitBid = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get quote data from store
  const { quote, bidForQuote, hasBid } = useQuoteDetails(id || null);
  const { loading } = useLoadingState();
  const { fetchQuoteDetails } = useQuotes();
  const { confirmBid, withdrawBid } = useBids();
  
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
  
  // Determine if this is a bid (auction) or quote (direct) submission
  const isAuction = window.location.pathname.includes('/bid');
  const isDirect = window.location.pathname.includes('/quote');
  
  // Tab state for switching between bid and message
  const [activeTab, setActiveTab] = useState<number>(0);
  
  // Message mode state (client or agent)
  const [messageMode, setMessageMode] = useState<'client' | 'agent'>('client');
  const [selectedShipper, setSelectedShipper] = useState<string>('');
  // Filter scope for shipper chat
  const [shipperScope, setShipperScope] = useState<'origin' | 'destination'>('origin');

  // Contactable shippers from store (organizations + partner contact_name)
  const { contactableShippers, fetchContactableShippers } = useContactableShippers();

  useEffect(() => {
    fetchContactableShippers();
  }, [fetchContactableShippers]);

  // Additional local state for UI
  const [selectedSubItemsLocal, setSelectedSubItemsLocal] = useState<{[key: string]: string[]}>({
    '1': [],
    '2': [],
    '3': [],
    '4': []
  });

  const [newCustomItemName, setNewCustomItemName] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Message state
  const [message, setMessage] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesHeight, setMessagesHeight] = useState<number>(200);
  const [isResizing, setIsResizing] = useState<boolean>(false);

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

  // Define subcategories for each line item (matching CostsAndMargins.tsx)
  const subLineItems = {
    'transport': [ // Transport mode
      { id: 'air', name: 'Air Freight', cost: 2500, margin: 15 },
      { id: 'sea', name: 'Sea Freight', cost: 1200, margin: 20 },
      { id: 'courier', name: 'Express Courier', cost: 800, margin: 25 },
      { id: 'ground', name: 'Ground Transport', cost: 600, margin: 30 }
    ],
    'collection': [ // Collection & delivery services
      { id: 'white_glove', name: 'White Glove Service', cost: 450, margin: 35 },
      { id: 'standard', name: 'Standard Pickup/Delivery', cost: 200, margin: 40 },
      { id: 'curbside', name: 'Curbside Delivery', cost: 150, margin: 45 },
      { id: 'inside', name: 'Inside Delivery', cost: 300, margin: 25 },
      { id: 'appointment', name: 'Appointment Scheduling', cost: 75, margin: 50 },
      { id: 'weekend', name: 'Weekend Service', cost: 200, margin: 30 }
    ],
    'packing': [ // Packing & crating
      { id: 'professional', name: 'Professional Crating', cost: 650, margin: 20 },
      { id: 'bubble', name: 'Bubble Wrap & Padding', cost: 120, margin: 60 },
      { id: 'wooden', name: 'Custom Wooden Crates', cost: 800, margin: 15 },
      { id: 'climate', name: 'Climate-Controlled Packaging', cost: 350, margin: 30 },
      { id: 'fragile', name: 'Fragile Item Protection', cost: 250, margin: 40 },
      { id: 'soft', name: 'Soft Packing', cost: 180, margin: 45 }
    ],
    'documentation': [ // Documentation & customs
      { id: 'export', name: 'Export Documentation', cost: 180, margin: 35 },
      { id: 'import', name: 'Import Clearance', cost: 220, margin: 30 },
      { id: 'insurance_cert', name: 'Insurance Certificates', cost: 95, margin: 50 },
      { id: 'customs', name: 'Customs Brokerage', cost: 320, margin: 25 },
      { id: 'carnet', name: 'ATA Carnet', cost: 150, margin: 40 },
      { id: 'cites', name: 'CITES Permits', cost: 200, margin: 35 }
    ]
  };

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

  // RadioOption component following the specification
  const RadioOption = ({ 
    name, 
    value, 
    label, 
    checked, 
    onChange, 
    icon 
  }: {
    name: string;
    value: string;
    label: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    icon?: React.ReactElement;
  }) => (
    <label style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: '12px',
      padding: '16px',
      fontSize: '14px',
      fontWeight: '500',
      border: checked ? '2px solid #8412ff' : '1px solid #e9eaeb',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      backgroundColor: checked ? 'rgba(132, 18, 255, 0.04)' : '#ffffff',
      color: checked ? '#8412ff' : '#170849',
      minHeight: '60px'
    }}>
      <input 
        type="checkbox" 
        name={name} 
        value={value} 
        checked={checked} 
        onChange={onChange} 
        style={{ display: 'none' }} 
      />
      {icon && <div style={{ flexShrink: 0 }}>{icon}</div>}
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
    </label>
  );

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
    timeLeft: quote.bidding_deadline ? getTimeLeft(quote.bidding_deadline) : '',
    estimatedDistance: 'TBD', // Would need calculation
    transportMode: 'TBD',
    insurance: quote.delivery_specifics?.insurance_requirements || 'Standard',
    autoCloseBidding: quote.auto_close_bidding,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at
  };

  // Use actual artworks from quote or empty array
  const artworks = (quote.quote_artworks || []).map(artwork => ({
    id: artwork.id,
    title: artwork.name,
    artist: artwork.artist_name || 'Unknown Artist',
    year: artwork.year_completed || 0,
    description: artwork.description || '',
    imageUrl: artwork.image_url || '',
    value: artwork.declared_value || 0,
    dimensions: artwork.dimensions || '',
    medium: artwork.medium || '',
    weight: artwork.weight || '',
    countryOfOrigin: artwork.country_of_origin || '',
    currentCustomsStatus: artwork.export_license_required ? 'License Required' : 'Cleared',
    tariffCode: artwork.tariff_code || '',
    crating: artwork.crating || '',
    specialRequirements: artwork.special_requirements || null
  }));

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

  // Helper function to calculate time left
  function getTimeLeft(deadline: string) {
    const now = Date.now();
    const deadlineTime = new Date(deadline).getTime();
    const diff = deadlineTime - now;
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} days, ${hours} hours`;
    return `${hours} hours`;
  }

  const availableServices = [
    { id: 'crating', label: 'Professional Crating' },
    { id: 'installation', label: 'Installation Service' },
    { id: 'climate', label: 'Climate Control' },
    { id: 'white_glove', label: 'White Glove Handling' },
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
      case 'white_glove': return 'White Glove';
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

  const handleSendMessage = () => {
    if (message.trim()) {
      const newMessage = {
        id: Date.now().toString(),
        sender: 'user',
        content: message,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, newMessage]);
      setMessage('');

      // Simulate gallery response after a delay
      setTimeout(() => {
        const responses = [
          "Thank you for your inquiry! I'll provide the additional details shortly.",
          "Great question! Let me check with our team and get back to you.",
          "I appreciate you reaching out for clarification. I'll respond with more details soon.",
          "Thanks for asking! I'll gather the information you need and respond within a few hours.",
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        
        const galleryMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'gallery',
          content: randomResponse,
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, galleryMessage]);
      }, 1500);
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
              <h1 className="header-title">Quote Response</h1>
            </div>
          </div>
        </header>
        
        <div className="main-content" style={{ flexDirection: 'column', gap: '32px' }}>
          {bidForQuote && bidForQuote.status === 'needs_confirmation' && (
            <Alert severity="warning" sx={{ my: 2 }}>
              The quote requirements have changed. Please review and confirm your bid, or withdraw if you cannot fulfill the updated request.
            </Alert>
          )}
          {/* Quote Information Card */}
          <div className="chart-card">
            <div className="chart-header">
              <h4>{quoteRequest.title}</h4>
              <div className={`tag ${quoteRequest.status === 'active' ? 'green' : 'red'}`}>
                {quoteRequest.status}
              </div>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: 'rgba(23, 8, 73, 0.7)' }}>
                Quote: {quoteRequest.code}
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '24px',
                marginBottom: '24px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>Origin</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: '#170849' }}>{quoteRequest.origin}</div>
                  {quoteRequest.originAddress && (
                    <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.5)', marginTop: '2px' }}>
                      {quoteRequest.originAddress.split(',')[0]}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>Destination</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: '#170849' }}>{quoteRequest.destination}</div>
                  {quoteRequest.destinationAddress && (
                    <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.5)', marginTop: '2px' }}>
                      {quoteRequest.destinationAddress.split(',')[0]}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>Target Date</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: '#170849' }}>
                    {quoteRequest.targetDate ? new Date(quoteRequest.targetDate).toLocaleDateString() : 'Flexible'}
                    {quoteRequest.targetDateEnd && (
                      <span style={{ fontSize: '14px', color: 'rgba(23, 8, 73, 0.7)' }}>
                        {' - ' + new Date(quoteRequest.targetDateEnd).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>Quote Value</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: '#170849' }}>
                    ${quoteRequest.totalValue.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>
                    {quoteRequest.type === 'requested' && quoteRequest.auctionDeadline ? 'Bidding Deadline' : 'Quote Type'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: '#E9932D' }}>
                    {quoteRequest.auctionDeadline ? 
                      new Date(quoteRequest.auctionDeadline).toLocaleString() : 
                      (quoteRequest.type === 'direct' ? 'Direct Quote' : 'Open Bidding')
                    }
                  </div>
                </div>
              </div>
              
              {/* Additional Details */}
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap',
                gap: '24px', 
                alignItems: 'center',
                fontSize: '14px',
                color: 'rgba(23, 8, 73, 0.7)',
                marginBottom: '16px'
              }}>
                <span>Est. Distance: <strong>{quoteRequest.estimatedDistance}</strong></span>
                <span>•</span>
                <span>Items: <strong>{quoteRequest.artworkCount} artworks</strong></span>
                <span>•</span>
                <span>Mode: <strong>{quoteRequest.transportMode}</strong></span>
                <span>•</span>
                <span>Insurance: <strong>{quoteRequest.insurance}</strong></span>
              </div>

              {/* Description */}
              {quoteRequest.description && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: 'rgba(23, 8, 73, 0.7)', 
                    marginBottom: '8px',
                    fontWeight: 500
                  }}>
                    Notes
                  </div>
                  <div style={{ 
                    padding: '12px',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e9eaeb',
                    fontSize: '14px',
                    lineHeight: '1.5'
                  }}>
                    {quoteRequest.description}
                  </div>
                </div>
              )}

              {/* Special Requirements */}
              {quoteRequest.specialRequirements && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: 'rgba(23, 8, 73, 0.7)', 
                    marginBottom: '8px',
                    fontWeight: 500
                  }}>
                    Special Requirements
                  </div>
                  {(() => {
                    // Parse special requirements if it's a string
                    let requirements;
                    try {
                      requirements = typeof quoteRequest.specialRequirements === 'string' 
                        ? JSON.parse(quoteRequest.specialRequirements) 
                        : quoteRequest.specialRequirements;
                    } catch {
                      requirements = quoteRequest.specialRequirements;
                    }

                    // If it's parsed JSON object, format as dot-separated
                    if (typeof requirements === 'object' && requirements !== null && !Array.isArray(requirements)) {
                      const formatValue = (value: any) => {
                        if (Array.isArray(value)) {
                          return value.join(', ');
                        }
                        return String(value);
                      };

                      const items = [];
                      if (requirements.transport_type) items.push(`Transport: ${formatValue(requirements.transport_type)}`);
                      if (requirements.transport_method) items.push(`Method: ${formatValue(requirements.transport_method)}`);
                      if (requirements.packing_requirements) items.push(`Packing: ${formatValue(requirements.packing_requirements)}`);
                      if (requirements.access_requirements) items.push(`Access: ${formatValue(requirements.access_requirements)}`);
                      if (requirements.delivery_requirements) items.push(`Delivery: ${formatValue(requirements.delivery_requirements)}`);
                      if (requirements.condition_check_requirements) items.push(`Condition Check: ${formatValue(requirements.condition_check_requirements)}`);
                      if (requirements.safety_security_requirements) items.push(`Safety/Security: ${formatValue(requirements.safety_security_requirements)}`);

                      if (items.length > 0) {
                        return (
                          <div style={{ 
                            display: 'flex', 
                            flexWrap: 'wrap',
                            gap: '24px', 
                            alignItems: 'center',
                            fontSize: '14px',
                            color: 'rgba(23, 8, 73, 0.7)',
                            marginBottom: '0px'
                          }}>
                            {items.map((item, index) => (
                              <React.Fragment key={index}>
                                {index > 0 && <span>•</span>}
                                <span>{item.split(': ')[0]}: <strong>{item.split(': ')[1]}</strong></span>
                              </React.Fragment>
                            ))}
                          </div>
                        );
                      }
                    }

                    // Fallback to original format for strings or other formats
                    return (
                      <div style={{ 
                        padding: '12px',
                        background: 'rgba(132, 18, 255, 0.05)',
                        borderRadius: '8px',
                        border: '1px solid rgba(132, 18, 255, 0.2)',
                        fontSize: '14px'
                      }}>
                        {typeof requirements === 'string' 
                          ? requirements 
                          : JSON.stringify(requirements, null, 2)
                        }
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Delivery Specifics */}
              {quoteRequest.deliverySpecifics && Object.keys(quoteRequest.deliverySpecifics).length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: 'rgba(23, 8, 73, 0.7)', 
                    marginBottom: '8px',
                    fontWeight: 500
                  }}>
                    Delivery Specifics
                  </div>
                  <div style={{ 
                    padding: '12px',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e9eaeb',
                    fontSize: '14px'
                  }}>
                    {Object.entries(quoteRequest.deliverySpecifics).map(([key, value]) => (
                      <div key={key} style={{ marginBottom: '4px' }}>
                        <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {
                          typeof value === 'object' ? JSON.stringify(value) : String(value)
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Competition Info */}
              
            </div>
          </div>

          {/* Main Form and Artwork Layout */}
          <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
            {/* Left Column - Response Options */}
            <div style={{ 
              width: '400px', 
              flexShrink: 0,
              position: 'sticky',
              top: '20px'
            }}>
              <div className="detail-card">
                {/* Tab Headers */}
                <Tabs
                  value={activeTab}
                  onChange={handleTabChange}
                  sx={{
                    borderBottom: '1px solid #e9eaeb',
                    marginBottom: '20px',
                    '& .MuiTabs-flexContainer': {
                      gap: '0px'
                    },
                    '& .MuiTab-root': {
                      textTransform: 'none',
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#666',
                      flex: 1,
                      maxWidth: 'none',
                      padding: '12px 16px',
                      '&.Mui-selected': {
                        color: '#8412ff',
                        fontWeight: 600
                      }
                    },
                    '& .MuiTabs-indicator': {
                      backgroundColor: '#8412ff',
                      height: '3px',
                      borderRadius: '2px'
                    }
                  }}
                >
                  <Tab label={`Submit ${isAuction ? 'Bid' : 'Quote'}`} />
                  <Tab label="Chat" />
                </Tabs>

                {/* Bid Tab Content */}
                {activeTab === 0 && (
                  <>
                    <h2>{isAuction ? 'Your Bid' : 'Your Quote'}</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px 0' }}>
                      {/* Line Items */}
                      <div>
                        <FormLabel component="legend" style={{ fontSize: '14px', color: '#170849', marginBottom: '12px' }}>
                          Cost Breakdown *
                        </FormLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {lineItems.map((item) => (
                            <div key={item.id} style={{ 
                              border: '1px solid #e9eaeb',
                              borderRadius: '8px',
                              padding: '16px',
                              background: '#fafafa'
                            }}>
                              {/* Line Item Header */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                <div style={{ 
                                  fontSize: '14px', 
                                  color: '#170849',
                                  minWidth: '180px',
                                  fontWeight: 600
                                }}>
                                  {item.name}:
                                </div>
                                <TextField
                                  type="number"
                                  value={item.cost}
                                  onChange={(e) => handleLineItemCostChange(item.id, e.target.value)}
                                  size="small"
                                  placeholder="0"
                                  InputProps={{
                                    startAdornment: <span style={{ marginRight: '4px', color: '#666' }}>$</span>
                                  }}
                                  style={{ width: '120px' }}
                                  sx={{
                                    '& .MuiOutlinedInput-root': {
                                      backgroundColor: '#fff',
                                      '& fieldset': {
                                        borderColor: '#8412ff'
                                      }
                                    },
                                    '& input[type=number]': {
                                      MozAppearance: 'textfield'
                                    },
                                    '& input[type=number]::-webkit-outer-spin-button': {
                                      WebkitAppearance: 'none',
                                      margin: 0
                                    },
                                    '& input[type=number]::-webkit-inner-spin-button': {
                                      WebkitAppearance: 'none',
                                      margin: 0
                                    }
                                  }}
                                />
                              </div>
                              
                              {/* Subcategory Options */}
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                                gap: '12px',
                                marginLeft: '12px'
                              }}>
                                {subLineItems[item.id as keyof typeof subLineItems]?.map((subItem) => (
                                  <RadioOption
                                    key={subItem.id}
                                    name={`subitem-${item.id}`}
                                    value={subItem.id}
                                    label={subItem.name}
                                    checked={selectedSubItems[item.id]?.includes(subItem.id) || false}
                                    onChange={() => handleSubItemToggle(item.id, subItem.id)}
                                    icon={getSubItemIcon(subItem.id)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                          
                          {/* Custom Line Items */}
                          {customLineItems.map((item) => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ 
                                fontSize: '14px', 
                                color: '#170849',
                                minWidth: '180px',
                                fontWeight: 500
                              }}>
                                {item.name}:
                              </div>
                              <TextField
                                type="number"
                                value={item.cost}
                                onChange={(e) => updateCustomLineItemCost(item.id, e.target.value)}
                                size="small"
                                placeholder="0"
                                InputProps={{
                                  startAdornment: <span style={{ marginRight: '4px', color: '#666' }}>$</span>
                                }}
                                style={{ width: '120px' }}
                                sx={{
                                  '& input[type=number]': {
                                    MozAppearance: 'textfield'
                                  },
                                  '& input[type=number]::-webkit-outer-spin-button': {
                                    WebkitAppearance: 'none',
                                    margin: 0
                                  },
                                  '& input[type=number]::-webkit-inner-spin-button': {
                                    WebkitAppearance: 'none',
                                    margin: 0
                                  }
                                }}
                              />
                              <IconButton
                                onClick={() => removeCustomLineItem(item.id)}
                                size="small"
                                sx={{ color: '#999', '&:hover': { color: '#f44336' } }}
                              >
                                ×
                              </IconButton>
                            </div>
                          ))}
                          
                          {/* Add Custom Item */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            marginTop: '8px',
                            paddingTop: '12px',
                            borderTop: '1px solid #e9eaeb'
                          }}>
                            <TextField
                              value={newCustomItemName}
                              onChange={(e) => setNewCustomItemName(e.target.value)}
                              placeholder="Add custom line item..."
                              size="small"
                              style={{ minWidth: '180px' }}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCustomLineItem();
                                }
                              }}
                            />
                            <Button
                              onClick={handleAddCustomLineItem}
                              disabled={!newCustomItemName.trim()}
                              variant="outlined"
                              size="small"
                              startIcon={<AddIcon />}
                              sx={{
                                borderColor: '#e9eaeb',
                                color: '#58517E',
                                textTransform: 'none',
                                fontSize: '12px',
                                '&:hover': {
                                  borderColor: '#8412ff',
                                  color: '#8412ff',
                                },
                              }}
                            >
                              Add
                            </Button>
                          </div>
                          
                          {/* Total */}
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginTop: '16px',
                            paddingTop: '16px',
                            borderTop: '2px solid #8412ff',
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#170849'
                          }}>
                            <span>Total Price (excluding VAT):</span>
                            <span style={{ color: '#8412ff' }}>
                              ${calculateTotal().toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                  

                      {/* Notes */}
                      <TextField
                        label="Notes to Gallery"
                        multiline
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        fullWidth
                        placeholder="Any additional information or special considerations..."
                      />

                      {/* Quote Valid Until */}
                      <TextField
                        label="Quote Valid Until"
                        type="date"
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                        fullWidth
                        required
                        InputLabelProps={{
                          shrink: true,
                        }}
                      />

                      {/* Attachments */}
                      <div>
                        <FormLabel component="legend" style={{ fontSize: '14px', color: '#170849', marginBottom: '12px' }}>
                          Attachments / Documents (Optional)
                        </FormLabel>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}>
                          <Chip 
                            icon={<AttachFileIcon />} 
                            label="Condition Report.pdf" 
                            variant="outlined"
                            size="small"
                          />
                          <Chip 
                            icon={<AttachFileIcon />} 
                            label="Packing Specs.xlsx" 
                            variant="outlined"
                            size="small"
                          />
                          <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            size="small"
                            sx={{
                              borderColor: '#e9eaeb',
                              color: '#58517E',
                              textTransform: 'none',
                              fontSize: '12px',
                              padding: '4px 8px',
                              '&:hover': {
                                borderColor: '#8412ff',
                                color: '#8412ff',
                              },
                            }}
                          >
                            Add File
                          </Button>
                        </div>
                      </div>

                      {/* Submit/Confirm Buttons */}
                      {bidForQuote && bidForQuote.status === 'needs_confirmation' ? (
                        <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
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
                              color: '#ffffff',
                              textTransform: 'none',
                              fontSize: '16px',
                              fontWeight: 600,
                              padding: '12px 24px',
                              '&:hover': { background: '#730add' }
                            }}
                          >
                            {submitting ? 'Confirming...' : 'Confirm & Resubmit Bid'}
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={async () => {
                              if (!window.confirm('Are you sure you want to withdraw your estimate?')) return;
                              setSubmitting(true);
                              const { error } = await withdrawBid(bidForQuote.id);
                              setSubmitting(false);
                              if (!error) {
                                navigate('/estimates');
                              } else {
                                alert('Failed to withdraw bid');
                              }
                            }}
                            disabled={submitting}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            Withdraw Bid
                          </Button>
                        </Box>
                      ) : (
                      <Button
                        variant="contained"
                        onClick={handleSubmitBid}
                        disabled={submitting || calculateTotal() === 0 || !validUntil}
                        sx={{
                          background: '#8412ff',
                          color: '#ffffff',
                          textTransform: 'none',
                          fontSize: '16px',
                          fontWeight: 600,
                          padding: '12px 24px',
                          marginTop: '16px',
                          '&:hover': {
                            background: '#730add',
                          },
                          '&:disabled': {
                            background: '#ccc',
                            color: '#999'
                          }
                        }}
                      >
                        {submitting ? 'Submitting...' : (isAuction ? 'Submit Bid' : 'Submit Quote')}
                      </Button>
                      )}
                    </div>
                  </>
                )}

                {/* Message Tab Content */}
                {activeTab === 1 && (
                  <>
                    {/* <h2>Chat</h2> */}
                    <div style={{ padding: '24px 0' }}>
                      {/* Client/Agent Toggle */}
                      <Box sx={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
                        <Box
                          sx={{
                            display: 'flex',
                            backgroundColor: '#f1f3f4',
                            borderRadius: '24px',
                            padding: '4px',
                            position: 'relative',
                            width: 'fit-content'
                          }}
                        >
                          <Button
                            onClick={() => {
                              setMessageMode('client');
                              setSelectedShipper('');
                            }}
                            sx={{
                              borderRadius: '20px',
                              textTransform: 'uppercase',
                              fontSize: '13px',
                              fontWeight: 600,
                              letterSpacing: '0.5px',
                              padding: '8px 20px',
                              minWidth: '120px',
                              zIndex: 1,
                              transition: 'all 0.3s ease',
                              backgroundColor: messageMode === 'client' ? '#ffffff' : 'transparent',
                              color: messageMode === 'client' ? '#170849' : '#666',
                              boxShadow: messageMode === 'client' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                              '&:hover': {
                                backgroundColor: messageMode === 'client' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                              }
                            }}
                          >
                            Contact Client
                          </Button>
                          <Button
                            onClick={() => {
                              setMessageMode('agent');
                              setSelectedShipper('');
                            }}
                            sx={{
                              borderRadius: '20px',
                              textTransform: 'uppercase',
                              fontSize: '13px',
                              fontWeight: 600,
                              letterSpacing: '0.5px',
                              padding: '8px 20px',
                              minWidth: '140px',
                              zIndex: 1,
                              transition: 'all 0.3s ease',
                              backgroundColor: messageMode === 'agent' ? '#ffffff' : 'transparent',
                              color: messageMode === 'agent' ? '#170849' : '#666',
                              boxShadow: messageMode === 'agent' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                              '&:hover': {
                                backgroundColor: messageMode === 'agent' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                              }
                            }}
                          >
                            Contact Agent
                          </Button>
                        </Box>
                      </Box>

                      {/* Client Mode - Gallery Chat */}
                      {messageMode === 'client' && (
                        <>
                          {/* Gallery Info */}
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 2, 
                            mb: 3,
                            p: 2,
                            bgcolor: '#f8f9fa',
                            borderRadius: '12px',
                            border: '1px solid #e9eaeb'
                          }}>
                            {quote.owner_org?.img_url ? (
                              <Avatar src={quote.owner_org.img_url} sx={{ width: 36, height: 36 }} />
                            ) : (
                              <Avatar
                                sx={{
                                  bgcolor: '#8412ff',
                                  width: 36,
                                  height: 36,
                                  fontSize: '14px',
                                  fontWeight: 'bold'
                                }}
                              >
                                {getInitials(quoteRequest.gallery)}
                              </Avatar>
                            )}
                            <Box>
                              <Typography variant="subtitle2" sx={{ color: '#170849', fontWeight: 600 }}>
                                {quoteRequest.gallery}
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#666', fontSize: '13px' }}>
                                Gallery Representative
                              </Typography>
                            </Box>
                          </Box>

                          {/* Messages Area */}
                          <Box sx={{ position: 'relative', mb: 2 }}>
                            <Box
                              className="messages-container"
                              sx={{
                                height: `${messagesHeight}px`,
                                overflowY: 'auto',
                                p: 2,
                                bgcolor: '#ffffff',
                                border: '1px solid #e9eaeb',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 1,
                                '&::-webkit-scrollbar': {
                                  width: '6px',
                                },
                                '&::-webkit-scrollbar-track': {
                                  background: 'transparent',
                                },
                                '&::-webkit-scrollbar-thumb': {
                                  background: '#e9eaeb',
                                  borderRadius: '3px',
                                },
                              }}
                            >
                            {messages.length === 0 ? (
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  color: '#999', 
                                  fontStyle: 'italic',
                                  textAlign: 'center',
                                  mt: 4
                                }}
                              >
                                Start a conversation with the gallery to clarify any questions...
                              </Typography>
                            ) : (
                              messages.map((msg) => (
                                <Box
                                  key={msg.id}
                                  sx={{
                                    display: 'flex',
                                    justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                                    mb: 1
                                  }}
                                >
                                  <Paper
                                    elevation={0}
                                    sx={{
                                      p: '10px 14px',
                                      maxWidth: '85%',
                                      bgcolor: msg.sender === 'user' ? '#8412ff' : '#f8f9fa',
                                      color: msg.sender === 'user' ? 'white' : '#170849',
                                      borderRadius: '14px',
                                      borderBottomRightRadius: msg.sender === 'user' ? '4px' : '14px',
                                      borderBottomLeftRadius: msg.sender === 'user' ? '14px' : '4px',
                                      boxShadow: msg.sender === 'user' 
                                        ? '0 2px 6px rgba(132, 18, 255, 0.15)' 
                                        : '0 1px 3px rgba(0, 0, 0, 0.05)',
                                      border: msg.sender === 'user' ? 'none' : '1px solid #f0f0f0'
                                    }}
                                  >
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        fontSize: '14px'
                                      }}
                                    >
                                      {msg.content}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        display: 'block',
                                        mt: 0.5,
                                        opacity: msg.sender === 'user' ? 0.8 : 0.6,
                                        fontSize: '10px',
                                        fontWeight: 400,
                                        textAlign: msg.sender === 'user' ? 'right' : 'left'
                                      }}
                                    >
                                      {formatTime(msg.timestamp)}
                                    </Typography>
                                  </Paper>
                                </Box>
                              ))
                            )}
                            <div ref={messagesEndRef} />
                            </Box>
                            
                            {/* Resize Handle */}
                            <Box
                              onMouseDown={handleResizeStart}
                              sx={{
                                height: '8px',
                                cursor: 'ns-resize',
                                bgcolor: 'transparent',
                                position: 'relative',
                                marginTop: '-4px',
                                marginBottom: '4px',
                                '&:hover': {
                                  bgcolor: 'rgba(132, 18, 255, 0.1)',
                                },
                                '&:after': {
                                  content: '""',
                                  position: 'absolute',
                                  left: '50%',
                                  top: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  width: '40px',
                                  height: '3px',
                                  bgcolor: '#e9eaeb',
                                  borderRadius: '2px',
                                },
                                '&:hover:after': {
                                  bgcolor: '#8412ff',
                                }
                              }}
                            />
                          </Box>

                          {/* Message Input */}
                          <TextField
                            fullWidth
                            multiline
                            maxRows={3}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask about shipping requirements, timeline, special handling needs..."
                            variant="outlined"
                            size="small"
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.5 }}>
                                  <IconButton
                                    onClick={handleSendMessage}
                                    disabled={!message.trim()}
                                    size="small"
                                    sx={{
                                      padding: '6px',
                                      bgcolor: message.trim() ? '#8412ff' : 'transparent',
                                      color: message.trim() ? 'white' : '#ccc',
                                      '&:hover': {
                                        bgcolor: message.trim() ? '#730add' : 'rgba(132, 18, 255, 0.08)'
                                      },
                                      '&:disabled': {
                                        bgcolor: 'transparent',
                                        color: '#ddd'
                                      }
                                    }}
                                  >
                                    <SendIcon fontSize="small" />
                                  </IconButton>
                                </InputAdornment>
                              ),
                              sx: {
                                borderRadius: '16px',
                                bgcolor: '#f8f9fa',
                                fontSize: '14px',
                                '& fieldset': {
                                  border: '1px solid #e9eaeb'
                                }
                              }
                            }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                paddingRight: '8px',
                                '&:hover fieldset': {
                                  borderColor: '#8412ff'
                                },
                                '&.Mui-focused fieldset': {
                                  borderColor: '#8412ff',
                                  borderWidth: '1px'
                                }
                              }
                            }}
                          />

                          {/* Quick Message Templates */}
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" sx={{ color: '#666', fontSize: '12px', mb: 1, display: 'block' }}>
                              Quick questions:
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {[
                                "What are the specific packing requirements?",
                                "Can you clarify the pickup timeline?",
                                "Are there any special handling instructions?",
                                "What insurance documentation is needed?"
                              ].map((template, index) => (
                                <Button
                                  key={index}
                                  variant="text"
                                  size="small"
                                  onClick={() => setMessage(template)}
                                  sx={{
                                    justifyContent: 'flex-start',
                                    textTransform: 'none',
                                    color: '#8412ff',
                                    fontSize: '12px',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    '&:hover': {
                                      bgcolor: 'rgba(132, 18, 255, 0.05)'
                                    }
                                  }}
                                >
                                  {template}
                                </Button>
                              ))}
                            </Box>
                          </Box>
                        </>
                      )}

                      {/* Agent Mode - Shipper Selection and Chat */}
                      {messageMode === 'agent' && (
                        <>
                          {/* Shipper Selection */}
                          <Box sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" sx={{ color: '#170849', fontWeight: 600, mb: 1 }}>
                              Select a Shipper to Contact
                            </Typography>
                            {/* Origin/Destination scope toggle */}
                            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                              <Button
                                onClick={() => { setShipperScope('origin'); setSelectedShipper(''); }}
                                variant={shipperScope === 'origin' ? 'contained' : 'outlined'}
                                size="small"
                                sx={{
                                  textTransform: 'none',
                                  fontSize: '12px',
                                  borderColor: '#e9eaeb',
                                  bgcolor: shipperScope === 'origin' ? '#8412ff' : '#fff',
                                  color: shipperScope === 'origin' ? '#fff' : '#58517E',
                                  '&:hover': { bgcolor: shipperScope === 'origin' ? '#730add' : 'rgba(132,18,255,0.05)', borderColor: '#8412ff' }
                                }}
                              >
                                Origin
                              </Button>
                              <Button
                                onClick={() => { setShipperScope('destination'); setSelectedShipper(''); }}
                                variant={shipperScope === 'destination' ? 'contained' : 'outlined'}
                                size="small"
                                sx={{
                                  textTransform: 'none',
                                  fontSize: '12px',
                                  borderColor: '#e9eaeb',
                                  bgcolor: shipperScope === 'destination' ? '#8412ff' : '#fff',
                                  color: shipperScope === 'destination' ? '#fff' : '#58517E',
                                  '&:hover': { bgcolor: shipperScope === 'destination' ? '#730add' : 'rgba(132,18,255,0.05)', borderColor: '#8412ff' }
                                }}
                              >
                                Destination
                              </Button>
                            </Box>
                            <Typography variant="caption" sx={{ color: '#666', fontSize: '12px', display: 'block', mb: 1 }}>
                              Showing partners near {shipperScope === 'origin' ? 'origin' : 'destination'}: {shipperScope === 'origin' ? (quoteRequest.origin || 'TBD') : (quoteRequest.destination || 'TBD')}
                            </Typography>
                            {/* Compact shipper list grid */}
                            <Box sx={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                              gap: 0.75,
                              maxHeight: '260px',
                              overflowY: 'auto',
                              border: '1px solid #e9eaeb',
                              borderRadius: '10px',
                              p: 0.75,
                              '&::-webkit-scrollbar': { width: '6px' },
                              '&::-webkit-scrollbar-thumb': { background: '#e9eaeb', borderRadius: '3px' }
                            }}>
                              {(filteredShippers.length > 0 ? filteredShippers : contactableShippers).map((shipper) => {
                                const isSelected = selectedShipper === shipper.id;
                                return (
                                  <Box
                                    key={shipper.id}
                                    onClick={() => setSelectedShipper(shipper.id)}
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      p: 1,
                                      borderRadius: '8px',
                                      border: isSelected ? '2px solid #8412ff' : '1px solid #e9eaeb',
                                      bgcolor: isSelected ? 'rgba(132, 18, 255, 0.06)' : '#fff',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      minWidth: 0,
                                      '&:hover': { borderColor: '#8412ff', bgcolor: 'rgba(132, 18, 255, 0.03)' }
                                    }}
                                  >
                                    {shipper.img_url ? (
                                      <Avatar src={shipper.img_url} sx={{ width: 28, height: 28 }} />
                                    ) : (
                                      <Avatar sx={{ bgcolor: '#8412ff', width: 28, height: 28, fontSize: '11px', fontWeight: 700 }}>
                                        {getInitials(shipper.name)}
                                      </Avatar>
                                    )}
                                    <Box sx={{ overflow: 'hidden' }}>
                                      <Typography variant="body2" sx={{ color: '#170849', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {shipper.name}
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: '#666', fontSize: '10px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {shipper.contact_name || 'Partner contact'}
                                      </Typography>
                                      {shipper.regions && shipper.regions.length > 0 && (
                                        <Typography variant="caption" sx={{ color: '#999', fontSize: '10px', display: 'block' }}>
                                          {shipper.regions.slice(0, 2).join(' • ')}{shipper.regions.length > 2 ? ' +' : ''}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>
                                );
                              })}
                            </Box>
                            {filteredShippers.length === 0 && (
                              <Alert severity="info" sx={{ mt: 1.25, borderRadius: '10px' }}>
                                No partners found matching the {shipperScope} location. Showing all partners instead.
                              </Alert>
                            )}
                          </Box>

                          {/* Selected Shipper Chat Interface */}
                          {selectedShipper && (
                            <>
                              {/* Selected Shipper Info */}
                              <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 1.25, 
                                mb: 2,
                                p: 1.25,
                                bgcolor: '#f8f9fa',
                                borderRadius: '10px',
                                border: '1px solid #e9eaeb'
                              }}>
                                {(() => {
                                  const shipper = contactableShippers.find(s => s.id === selectedShipper);
                                  if (!shipper) return null;
                                  return shipper.img_url ? (
                                    <Avatar src={shipper.img_url} sx={{ width: 32, height: 32 }} />
                                  ) : (
                                    <Avatar sx={{ bgcolor: '#8412ff', width: 32, height: 32, fontSize: '12px', fontWeight: 'bold' }}>
                                      {getInitials(shipper.name)}
                                    </Avatar>
                                  );
                                })()}
                                <Box>
                                  <Typography variant="subtitle2" sx={{ color: '#170849', fontWeight: 600, fontSize: '13px' }}>
                                    {contactableShippers.find(s => s.id === selectedShipper)?.name}
                                  </Typography>
                                  <Typography variant="body2" sx={{ color: '#666', fontSize: '12px' }}>
                                    {contactableShippers.find(s => s.id === selectedShipper)?.contact_name || ''}
                                  </Typography>
                                </Box>
                              </Box>

                              {/* Agent Chat Messages Area */}
                              <Box sx={{ position: 'relative', mb: 2 }}>
                                <Box
                                  sx={{
                                    height: '250px',
                                    overflowY: 'auto',
                                    p: 2,
                                    bgcolor: '#ffffff',
                                    border: '1px solid #e9eaeb',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 1,
                                    '&::-webkit-scrollbar': {
                                      width: '6px',
                                    },
                                    '&::-webkit-scrollbar-track': {
                                      background: 'transparent',
                                    },
                                    '&::-webkit-scrollbar-thumb': {
                                      background: '#e9eaeb',
                                      borderRadius: '3px',
                                    },
                                  }}
                                >
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      color: '#999', 
                                      fontStyle: 'italic',
                                      textAlign: 'center',
                                      mt: 4
                                    }}
                                  >
                                    Start a conversation with {contactableShippers.find((s) => s.id === selectedShipper)?.name}...
                                  </Typography>
                                </Box>
                              </Box>

                              {/* Agent Message Input */}
                              <TextField
                                fullWidth
                                multiline
                                maxRows={3}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={`Message ${contactableShippers.find((s) => s.id === selectedShipper)?.name || 'the shipper'} about shipping details...`}
                                variant="outlined"
                                size="small"
                                InputProps={{
                                  endAdornment: (
                                    <InputAdornment position="end" sx={{ alignSelf: 'flex-end', pb: 0.5 }}>
                                      <IconButton
                                        onClick={handleSendMessage}
                                        disabled={!message.trim()}
                                        size="small"
                                        sx={{
                                          padding: '6px',
                                          bgcolor: message.trim() ? '#8412ff' : 'transparent',
                                          color: message.trim() ? 'white' : '#ccc',
                                          '&:hover': {
                                            bgcolor: message.trim() ? '#730add' : 'rgba(132, 18, 255, 0.08)'
                                          },
                                          '&:disabled': {
                                            bgcolor: 'transparent',
                                            color: '#ddd'
                                          }
                                        }}
                                      >
                                        <SendIcon fontSize="small" />
                                      </IconButton>
                                    </InputAdornment>
                                  ),
                                  sx: {
                                    borderRadius: '16px',
                                    bgcolor: '#f8f9fa',
                                    fontSize: '14px',
                                    '& fieldset': {
                                      border: '1px solid #e9eaeb'
                                    }
                                  }
                                }}
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    paddingRight: '8px',
                                    '&:hover fieldset': {
                                      borderColor: '#8412ff'
                                    },
                                    '&.Mui-focused fieldset': {
                                      borderColor: '#8412ff',
                                      borderWidth: '1px'
                                    }
                                  }
                                }}
                              />

                              {/* Quick Agent Message Templates */}
                              <Box sx={{ mt: 2 }}>
                                <Typography variant="caption" sx={{ color: '#666', fontSize: '12px', mb: 1, display: 'block' }}>
                                  Quick questions for agents:
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  {[
                                    "Can you handle this route within the timeline?",
                                    "What are your rates for this type of shipment?",
                                    "Do you have experience with similar artwork?",
                                    "What insurance coverage do you provide?"
                                  ].map((template, index) => (
                                    <Button
                                      key={index}
                                      variant="text"
                                      size="small"
                                      onClick={() => setMessage(template)}
                                      sx={{
                                        justifyContent: 'flex-start',
                                        textTransform: 'none',
                                        color: '#8412ff',
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        '&:hover': {
                                          bgcolor: 'rgba(132, 18, 255, 0.05)'
                                        }
                                      }}
                                    >
                                      {template}
                                    </Button>
                                  ))}
                                </Box>
                              </Box>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right Column - Artworks */}
            <div style={{ flex: 1 }}>
              <div className="detail-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2>Artworks to Ship ({artworks.length})</h2>
                  <div style={{ fontSize: '14px', color: '#666', fontStyle: 'italic' }}>
                    All fields below are view-only
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {artworks.map((artwork, index) => (
                    <div 
                      key={artwork.id}
                      style={{ 
                        border: '1px solid #e9eaeb',
                        borderRadius: '12px',
                        padding: '20px',
                        background: '#fafafa'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#8412ff', marginBottom: '12px' }}>
                        #{index + 1}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '20px' }}>
                        {/* Image */}
                        <div style={{ 
                          width: '120px', 
                          height: '120px', 
                          flexShrink: 0,
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: '#e9eaeb'
                        }}>
                          {artwork.imageUrl ? (
                            <img 
                              src={artwork.imageUrl} 
                              alt={artwork.title}
                              style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'cover' 
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:12px;flex-direction:column;"><div>📷</div><div style="margin-top:4px;">Image Failed to Load</div></div>';
                              }}
                              onLoad={(e) => {
                                console.log('✅ Image loaded successfully:', artwork.imageUrl);
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%', 
                              height: '100%', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              background: '#f8f9fa', 
                              color: '#999', 
                              fontSize: '12px',
                              flexDirection: 'column',
                              border: '2px dashed #e9eaeb'
                            }}>
                              <div style={{ fontSize: '24px', marginBottom: '4px' }}>🖼️</div>
                              <div>No Image Available</div>
                            </div>
                          )}
                        </div>
                        
                        {/* Details */}
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr', 
                            gap: '12px',
                            fontSize: '14px'
                          }}>
                            <div>
                              <span style={{ color: '#666' }}>Artist:</span> <strong>{artwork.artist}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Year:</span> <strong>{artwork.year}</strong>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <span style={{ color: '#666' }}>Title:</span> <strong>{artwork.title}</strong>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <span style={{ color: '#666' }}>Description:</span> 
                              <div style={{ 
                                marginTop: '4px', 
                                maxHeight: '60px', 
                                overflowY: 'auto',
                                background: '#fff',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #e9eaeb'
                              }}>
                                {artwork.description}
                              </div>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Value:</span> <strong>${artwork.value.toLocaleString()}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Dimensions:</span> <strong>{artwork.dimensions}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Weight:</span> <strong>{artwork.weight || 'Not specified'}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Medium:</span> <strong>{artwork.medium}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Country of Origin:</span> <strong>{artwork.countryOfOrigin}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Tariff Code:</span> <strong>{artwork.tariffCode || 'TBD'}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#666' }}>Crating:</span> <strong>{artwork.crating || 'Standard'}</strong>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <span style={{ color: '#666' }}>Current Customs Status:</span> <strong>{artwork.currentCustomsStatus}</strong>
                            </div>
                            {artwork.specialRequirements && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{ color: '#666' }}>Special Requirements:</span>
                                <div style={{ 
                                  marginTop: '4px',
                                  padding: '8px',
                                  background: 'rgba(132, 18, 255, 0.05)',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(132, 18, 255, 0.2)',
                                  fontSize: '13px'
                                }}>
                                  {typeof artwork.specialRequirements === 'string' 
                                    ? artwork.specialRequirements 
                                    : JSON.stringify(artwork.specialRequirements, null, 2)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubmitBid; 
