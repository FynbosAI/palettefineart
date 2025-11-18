import React, { useState, useEffect } from 'react';
import { Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StarIcon from '@mui/icons-material/Star';
import EcoIcon from '@mui/icons-material/LocalFlorist';
import MessageIcon from '@mui/icons-material/Message';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuoteSelector } from '../../hooks/useQuoteSelector';
import { useUserRole } from '../../hooks/useUserRole';
import useSupabaseStore from '../../store/useSupabaseStore';
import type { QuoteWithDetails, BidWithPartner } from '../../lib/supabase/quotes';
import { formatTargetDateRange, getPrimaryTargetDate, safeDateFormat } from '../../lib/utils/dateUtils';
import logger from '../../lib/utils/logger';
import useMessagingUiStore from '../../store/messagingUiStore';
import useCurrency from '../../hooks/useCurrency';
import EstimateExclusionsNotice from '../../../../shared/ui/EstimateExclusionsNotice';

interface TransformedBid {
  id: string;
  branchOrgId: string | null;
  branchName: string | null;
  partnerName: string | null;
  shipper: {
    name: string;
    companyName?: string | null;
    branchName?: string | null;
    abbreviation: string;
    avatar: string;
    rating: number;
    brandColor: string;
  };
  price: number;
  currency: string;
  co2Tonnes: number;
  deliveryTime: string;
  timestamp: string;
  status: string;
  notes?: string;
  insuranceIncluded: boolean;
  specialServices: string[];
}

interface TransformedQuoteInfo {
  id: string;
  title: string;
  route: string;
  shippingDate: string;
  status: 'active' | 'completed' | 'draft' | 'cancelled';
  itemsCount: number;
  auctionDeadline: string;
  bidsReceived: number;
  bestPrice: number;
  currency: string;
  type: 'auction' | 'requested';
  value: number;
}

const normalizeLabel = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractCompanyName = (partner: any, branchNetwork: any): string | null => {
  const candidates = [
    normalizeLabel(partner?.name),
    normalizeLabel(partner?.organization?.name),
    normalizeLabel(partner?.company?.name),
    normalizeLabel(branchNetwork?.companyName),
    normalizeLabel(branchNetwork?.company?.name),
  ];
  return candidates.find(Boolean) || null;
};

const extractBranchName = (
  branch: any,
  branchNetwork: any,
  fallbackCompanyName: string | null
): string | null => {
  const candidates = [
    normalizeLabel(branch?.branch_name),
    normalizeLabel(branch?.name),
    normalizeLabel(branchNetwork?.branchName),
    normalizeLabel(branchNetwork?.branch_name),
    normalizeLabel(branchNetwork?.displayName),
    normalizeLabel(branchNetwork?.display_name),
    normalizeLabel(branchNetwork?.branchLabel),
    normalizeLabel(branchNetwork?.branch_label),
  ];
  const result = candidates.find(Boolean) || null;
  if (!result) return null;
  if (fallbackCompanyName && result === fallbackCompanyName) {
    return null;
  }
  return result;
};

const ViewBidsPage = () => {
  const navigate = useNavigate();
  const { id: quoteId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'all' | 'lowest' | 'eco'>('all');
  const openMessagingModal = useMessagingUiStore((state) => state.openForQuote);
  const { formatCurrency } = useCurrency();

  const { 
    selectedQuote,
    loading,
    error,
    selectAndFetchQuote,
  } = useQuoteSelector();
  const { canViewAllBids, isPartner } = useUserRole();

  // Fetch the specific quote when component mounts or quoteId changes
  useEffect(() => {
    if (!quoteId) return;

    logger.debug('ViewBidsPage', 'Selecting and fetching quote');
    selectAndFetchQuote(quoteId);
  }, [quoteId, selectAndFetchQuote]);

  // Transform Supabase data to match component expectations
  const transformQuoteData = (quote: QuoteWithDetails): TransformedQuoteInfo => {
    const route = quote.route || `${quote.origin?.name || 'TBD'} → ${quote.destination?.name || 'TBD'}`;
    const bidsReceived = quote.bids?.length || 0;
    const bestPrice = bidsReceived > 0 ? Math.min(...quote.bids.map(bid => bid.amount)) : 0;
    
    // Calculate deadline based on target start date
    const targetDate = getPrimaryTargetDate(quote.target_date_start, quote.target_date_end);
    const now = new Date();
    const diffTime = targetDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const deadline = diffDays > 0 ? `${diffDays} days` : 'Expired';

    // Get actual items count from hydrated quote artworks
    const itemsCount = (quote.quote_artworks?.length || 0) || 1;

    return {
      id: quote.id,
      title: quote.title,
      route,
      shippingDate: quote.target_date_start || new Date().toISOString().split('T')[0],
      status: quote.status,
      itemsCount,
      auctionDeadline: deadline,
      bidsReceived,
      bestPrice,
      currency: '$', // Default currency - could be stored in quote
      type: quote.type,
      value: quote.value || 0
    };
  };

  const transformBidData = (bid: BidWithPartner): TransformedBid => {
    // Parse estimated transit time (PostgreSQL interval format)
    let deliveryTime = '3-5 days'; // Default
    if (bid.estimated_transit_time) {
      // Simple parsing for common formats like "3 days" or "1 week"
      const timeStr = bid.estimated_transit_time.toString();
      if (timeStr.includes('day')) {
        const days = parseInt(timeStr);
        deliveryTime = `${days}-${days + 2} days`;
      } else if (timeStr.includes('week')) {
        deliveryTime = '5-7 days';
      } else {
        deliveryTime = timeStr;
      }
    }

    // Calculate CO2 based on transport method (rough estimates)
    const co2Factors = {
      ground: 0.05, // tonnes per shipment
      sea: 0.08,
      air: 0.5
    };
    
    // Parse transport method from bid services or requirements
    let transportMethod = 'air'; // default to worst case
    if (bid.special_services) {
      const services = bid.special_services.join(' ').toLowerCase();
      if (services.includes('ground') || services.includes('road')) {
        transportMethod = 'ground';
      } else if (services.includes('sea') || services.includes('ocean')) {
        transportMethod = 'sea';
      }
    }
    
    const co2Tonnes = co2Factors[transportMethod as keyof typeof co2Factors] * 1000; // Convert to kg
    
    // Use actual rating from partner data or default
    const rating = bid.logistics_partner?.rating || 4.5;

    const branch = (bid as any).branch_org || null;
    const branchNetwork = (bid as any).branch_network || null;
    const branchOrgId = branch?.id || (bid as any).branch_org_id || null;
    const partner = bid.logistics_partner || ({} as any);
    const partnerCompanyName = extractCompanyName(partner, branchNetwork);
    const branchLabel = extractBranchName(branch, branchNetwork, partnerCompanyName);
    const partnerName = partnerCompanyName || branchLabel || 'Unknown Shipper';
    const primaryDisplayName = partnerName;
    const abbreviationSource =
      (typeof partner?.abbreviation === 'string' && partner.abbreviation.trim()) ||
      partnerName;
    const abbreviation = abbreviationSource
      ? abbreviationSource
          .split(/\s+/)
          .filter(Boolean)
          .map((part) => part[0]?.toUpperCase() || '')
          .join('')
          .slice(0, 3) || '?'
      : '?';
    const brandColor = bid.logistics_partner?.brand_color || '#666666';

    return {
      id: bid.id,
      branchOrgId,
      branchName: branchLabel,
      partnerName,
      shipper: {
        name: primaryDisplayName,
        companyName: partnerCompanyName,
        branchName: branchLabel,
        abbreviation,
        avatar: `https://placehold.co/40x40/${brandColor.replace('#', '') || '666666'}/ffffff?text=${abbreviation}`,
        rating: Math.round(rating * 10) / 10,
        brandColor
      },
      price: bid.amount,
      currency: '$', // Default currency
      co2Tonnes,
      deliveryTime,
      timestamp: bid.created_at,
      status: bid.status,
      notes: bid.notes || undefined,
      insuranceIncluded: bid.insurance_included || false,
      specialServices: bid.special_services || []
    };
  };

  // Get transformed data
  const quoteInfo: TransformedQuoteInfo | null = selectedQuote ? transformQuoteData(selectedQuote) : null;
  const transformedBids: TransformedBid[] = selectedQuote?.bids ? selectedQuote.bids.map(transformBidData) : [];

  const getSortedBids = () => {
    const sorted = [...transformedBids];
    switch (activeTab) {
      case 'lowest':
        return sorted.sort((a, b) => a.price - b.price);
      case 'eco':
        return sorted.sort((a, b) => a.co2Tonnes - b.co2Tonnes);
      default:
        return sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    logger.debug('ViewBidsPage', 'Accepting bid');
    
    if (!quoteId) {
      console.error('No quote ID available');
      return;
    }

    const bid = transformedBids.find((item) => item.id === bidId);
    if (!bid) {
      console.error('Bid not found in transformed list', bidId);
      return;
    }

    if (!bid.branchOrgId) {
      const message = 'This estimate is missing branch information and cannot be accepted yet.';
      console.error(message, bid);
      alert(message);
      return;
    }
    
    try {
      // Use the enhanced acceptBid function from the store
      const { acceptBid } = useSupabaseStore.getState();
      const result = await acceptBid({
        p_quote_id: quoteId,
        p_bid_id: bidId,
        p_branch_org_id: bid.branchOrgId
      });
      
      if (result.error) {
        console.error('Failed to accept bid:', result.error);
        alert(`Failed to accept estimate: ${result.error}`);
      } else {
        logger.success('ViewBidsPage', 'Bid accepted successfully');
        logger.info('ViewBidsPage', `Created shipment: ${result.data}`);
        
        // Show success message
        alert('Estimate accepted successfully! A shipment has been created.');
        
        // Navigate to the new shipment
        if (result.data) {
          navigate(`/shipments/${result.data}`);
        }
      }
    } catch (err) {
      console.error('Error accepting bid:', err);
      alert(`Error accepting estimate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleViewDetails = (bidId: string) => {
    logger.debug('ViewBidsPage', 'Viewing details for bid');
    // Would navigate to detailed bid view in real implementation
  };

  const handleMessageBidder = (bidId: string, shipperName: string) => {
    logger.debug('ViewBidsPage', 'Opening message with shipper');
    
    // Find the bid data
    const bid = transformedBids.find(b => b.id === bidId);
    if (!bid || !quoteInfo) return;
    
    openMessagingModal({
      quoteId: quoteInfo.id,
      quoteTitle: quoteInfo.title,
      quoteRoute: quoteInfo.route,
      quoteValue: quoteInfo.value,
      targetDateStart: selectedQuote?.target_date_start || null,
      targetDateEnd: selectedQuote?.target_date_end || null,
      quoteType: quoteInfo.type,
      bidderName: bid.shipper.name,
      bidderAbbreviation: bid.shipper.abbreviation,
      bidderColor: bid.shipper.brandColor,
      bidPrice: bid.price,
      shipmentId: selectedQuote?.shipment_id || null,
      shipperBranchOrgId: bid.branchOrgId,
      galleryBranchOrgId: selectedQuote?.owner_org?.id || selectedQuote?.owner_org_id || null,
    }).catch((launchError) => {
      console.error('[ViewBidsPage] failed to open messaging modal', launchError);
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="main-wrap">
        <div className="main-panel">
          <header className="header">
            <div className="header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => navigate('/quotes')}
                  sx={{
                    color: 'var(--color-text-muted)',
                    textTransform: 'none',
                    fontSize: '14px',
                    '&:hover': {
                      background: 'rgba(132, 18, 255, 0.04)',
                    },
                  }}
                >
                  Back to Quotes
                </Button>
                <h1 className="header-title">Shipment Bids</h1>
              </div>
            </div>
          </header>
          <div className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <div>Loading quote and estimates...</div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !selectedQuote || !quoteInfo) {
    return (
      <div className="main-wrap">
        <div className="main-panel">
          <header className="header">
            <div className="header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => navigate('/quotes')}
                  sx={{
                    color: '#58517E',
                    textTransform: 'none',
                    fontSize: '14px',
                    '&:hover': {
                      background: 'rgba(132, 18, 255, 0.04)',
                    },
                  }}
                >
                  Back to Quotes
                </Button>
                <h1 className="header-title">Shipment Bids</h1>
              </div>
            </div>
          </header>
          <div className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <div style={{ color: 'var(--color-error)' }}>
              {error ? `Error: ${error}` : !selectedQuote ? 'Quote not found' : 'No quote data available'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div className="header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate('/quotes')}
                sx={{
                  color: 'var(--color-text-muted)',
                  textTransform: 'none',
                  fontSize: '14px',
                  '&:hover': {
                    background: 'rgba(132, 18, 255, 0.04)',
                  },
                }}
              >
                Back to Quotes
              </Button>
              <h1 className="header-title">Shipment Bids</h1>
            </div>
          </div>
        </header>
        
        <div className="main-content" style={{ flexDirection: 'column', gap: '32px' }}>
          {/* Quote Information Card */}
          <div className="chart-card">
            <div className="chart-header">
              <h4>{quoteInfo.title}</h4>
              <div className={`tag ${quoteInfo.status === 'active' ? 'green' : quoteInfo.status === 'completed' ? 'blue' : 'yellow'}`}>
                {quoteInfo.status}
              </div>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '24px',
                marginBottom: '24px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>Route</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-text)' }}>{quoteInfo.route}</div>
                </div>
                                  <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>Target Arrival Date</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: '#170849' }}>
                    {safeDateFormat(quoteInfo.shippingDate)}
                  </div>
                </div>
              <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>Value</div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-text)' }}>
                    {formatCurrency(quoteInfo.value)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', marginBottom: '4px' }}>
                    {quoteInfo.type === 'auction' ? 'Auction Ends' : 'Quote Type'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: quoteInfo.type === 'auction' ? 'var(--color-warning)' : 'var(--color-text)' }}>
                    {quoteInfo.type === 'auction' ? quoteInfo.auctionDeadline : 'Direct Quote'}
                  </div>
                </div>
              </div>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '16px',
                background: 'rgba(132, 18, 255, 0.05)',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '14px', color: 'rgba(23, 8, 73, 0.7)' }}>
                    {quoteInfo.bidsReceived} estimates received
                  </div>
                  {quoteInfo.bestPrice > 0 && (
                    <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--color-text)' }}>
                      Best Price: <span style={{ color: 'var(--color-info)' }}>{formatCurrency(quoteInfo.bestPrice)}</span>
                    </div>
                  )}
                </div>
                
                {/* Scrollable Bidder Cards */}
                <div style={{ 
                  display: 'flex', 
                  gap: '8px',
                  maxWidth: '300px',
                  overflowX: 'auto',
                  padding: '8px 0'
                }}>
                  {transformedBids.map((bid) => (
                    <div
                      key={bid.id}
                      title={`${bid.shipper.name} - ${formatCurrency(bid.price)}`}
                      style={{
                        minWidth: '60px',
                        height: '60px',
                        borderRadius: '8px',
                        background: bid.shipper.brandColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease',
                        border: '2px solid transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.border = '2px solid #170849';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.border = '2px solid transparent';
                      }}
                    >
                      {bid.shipper.abbreviation}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <EstimateExclusionsNotice
            compact
            title="Review estimate exclusions before accepting"
            appearance="subtle"
          />

          {/* Filtering Tabs */}
          {transformedBids.length > 0 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { key: 'all', label: 'All Estimates' },
                { key: 'lowest', label: 'Lowest Price' },
                { key: 'eco', label: 'Most Eco-Friendly' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '10px',
                    border: activeTab === tab.key ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: activeTab === tab.key ? 'rgba(132, 18, 255, 0.1)' : '#ffffff',
                    color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Detailed Bids Table */}
          {transformedBids.length > 0 ? (
            <div className="chart-card">
              <div className="chart-header">
                <h4>Received Estimates</h4>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {getSortedBids().map((bid) => {
                    const shipperName =
                      bid.shipper.companyName ||
                      bid.partnerName ||
                      bid.shipper.name;
                    const branchLabel =
                      bid.shipper.branchName ||
                      (bid.branchName && bid.branchName !== shipperName ? bid.branchName : null);
                    const messageTargetName = shipperName || 'Shipper';

                    return (
                      <div 
                      key={bid.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '16px',
                        padding: '20px',
                        background: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e9eaeb',
                        transition: 'box-shadow 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(132, 18, 255, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* Shipper Info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '8px',
                          background: bid.shipper.brandColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}>
                          {bid.shipper.abbreviation}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '16px', color: '#170849' }}>
                            {shipperName}
                          </div>
                          {branchLabel && (
                            <div style={{ fontSize: '13px', color: '#58517E', marginTop: '2px' }}>
                              {branchLabel}
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                            <StarIcon sx={{ width: '16px', height: '16px', color: '#E9932D' }} />
                            <span style={{ fontSize: '14px', color: '#58517E' }}>
                              {bid.shipper.rating}/5
                            </span>
                            {bid.status !== 'pending' && (
                              <span style={{ 
                                fontSize: '12px', 
                                color: bid.status === 'accepted' ? '#0dab71' : (bid.status === 'needs_confirmation' ? '#FB8C00' : '#E9932D'),
                                fontWeight: 500,
                                marginLeft: '8px'
                              }}>
                                ({bid.status === 'needs_confirmation' ? 'Needs Confirmation' : bid.status})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Price */}
                      <div style={{ textAlign: 'center', minWidth: '100px' }}>
                        <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--color-text)' }}>
                          {formatCurrency(bid.price)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>Price</div>
                      </div>

                      {/* CO2 */}
                      <div style={{ textAlign: 'center', minWidth: '100px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <EcoIcon sx={{ width: '16px', height: '16px', color: 'var(--color-success)' }} />
                          <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-text)' }}>
                            {bid.co2Tonnes}t
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>CO₂</div>
                      </div>

                      {/* Delivery Time */}
                      <div style={{ textAlign: 'center', minWidth: '100px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-text)' }}>
                          {bid.deliveryTime}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>Delivery</div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<MessageIcon sx={{ width: '16px', height: '16px' }} />}
                          onClick={() => handleMessageBidder(bid.id, messageTargetName)}
                          sx={{
                            borderColor: 'var(--color-secondary)',
                            color: 'var(--color-secondary)',
                            textTransform: 'none',
                            fontSize: '12px',
                            fontWeight: 500,
                            minWidth: '90px',
                            '&:hover': {
                              borderColor: '#008a8b',
                              color: '#008a8b',
                              background: 'rgba(0, 170, 171, 0.04)',
                            },
                          }}
                        >
                          Message
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleViewDetails(bid.id)}
                          sx={{
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-muted)',
                            textTransform: 'none',
                            fontSize: '12px',
                            '&:hover': {
                              borderColor: 'var(--color-primary)',
                              color: 'var(--color-primary)',
                            },
                          }}
                        >
                          Details
                        </Button>
                        {quoteInfo.status === 'active' && (bid.status === 'pending' || bid.status === 'submitted') && bid.status !== 'needs_confirmation' && (
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handleAcceptBid(bid.id)}
                            sx={{
                              background: 'var(--color-primary)',
                              color: '#ffffff',
                              textTransform: 'none',
                              fontSize: '12px',
                              '&:hover': {
                                background: 'var(--color-primary-dark)',
                              },
                            }}
                          >
                            Accept
                          </Button>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="chart-card">
              <div className="chart-header">
                <h4>Received Estimates</h4>
              </div>
              <div style={{ padding: '48px', textAlign: 'center', color: '#58517E' }}>
                No estimates have been received for this quote yet.
              </div>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default ViewBidsPage; 
