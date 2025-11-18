import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ShipmentCard.css';
import { AppConfigService } from '../lib/supabase';
import useCurrency from '../hooks/useCurrency';

interface ShipmentCardProps {
  id: string;
  code: string;
  name: string;
  status: string;
  estimatedArrival: string | null;
  artworkCount?: number;
  totalValue?: number;
  originName?: string;
  destinationName?: string;
}

const ShipmentCard: React.FC<ShipmentCardProps> = ({ 
  id, 
  code, 
  name, 
  status, 
  estimatedArrival,
  artworkCount = 0,
  totalValue = 0,
  originName,
  destinationName
}) => {
  const navigate = useNavigate();
  const [statusColors, setStatusColors] = useState<Record<string, string>>({});
  const { formatCurrency, convertAmount, currencySymbol } = useCurrency();
  
  useEffect(() => {
    const loadStatusColors = async () => {
      const colors = await AppConfigService.getStatusColors();
      if (colors) {
        setStatusColors(colors);
      }
    };
    loadStatusColors();
  }, []);

  const handleClick = () => {
    navigate(`/shipments/${id}`);
  };

  // Get status color based on status value
  const getStatusColor = (statusValue: string): string => {
    const normalizedStatus = statusValue.toLowerCase().replace(/_/g, '');
    
    // Map common status variations to our standard status keys
    const statusMap: Record<string, string> = {
      'checking': 'checking',
      'artworkcollected': 'artwork_collected',
      'pending': 'pending',
      'pendingapproval': 'pending_approval',
      'bidding': 'bidding',
      'preparing': 'preparing',
      'intransit': 'in_transit',
      'transit': 'in_transit',
      'customs': 'customs',
      'securitycheck': 'security_check',
      'outfordelivery': 'out_for_delivery',
      'localdelivery': 'local_delivery',
      'delivered': 'delivered',
      'cancelled': 'cancelled'
    };
    
    const mappedStatus = statusMap[normalizedStatus];
    
    // Log unknown status for debugging
    if (!mappedStatus) {
      console.warn(`Unknown shipment status: ${statusValue}. Using default color.`);
      return '#58517E';
    }
    
    // Return configured color or fallback with warning
    const color = statusColors[mappedStatus];
    if (!color) {
      console.warn(`No color configured for status: ${mappedStatus}. Using default color.`);
      return '#58517E';
    }
    
    return color;
  };

  // Format status for display
  const formatStatus = (statusValue: string): string => {
    return statusValue.replace(/_/g, ' ').toUpperCase();
  };

  // Format currency
  const formatTotalValue = (value: number): string => {
    const converted = convertAmount(value);
    if (converted >= 1_000_000) {
      return `${currencySymbol}${(converted / 1_000_000).toFixed(1)}M`;
    }
    if (converted >= 1_000) {
      return `${currencySymbol}${Math.round(converted / 1_000)}K`;
    }
    return formatCurrency(value);
  };

  return (
    <div className="shipment-card" onClick={handleClick}>
      <div className="shipment-header">
        <span className="shipment-code">{code}</span>
        <span className="status-badge" style={{ backgroundColor: getStatusColor(status) }}>
          {formatStatus(status)}
        </span>
      </div>
      
      <h3 className="shipment-name">{name}</h3>
      
      {(originName || destinationName) && (
        <p className="shipment-route">
          {originName && originName}
          {originName && destinationName && ' → '}
          {destinationName && destinationName}
        </p>
      )}
      
      <div className="shipment-details">
        <div className="detail-item">
          <span className="detail-label">Est. Arrival</span>
          <span className="detail-value">
            {estimatedArrival 
              ? new Date(estimatedArrival).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric' 
                })
              : 'TBD'
            }
          </span>
        </div>
        
        {artworkCount > 0 && (
          <div className="detail-item">
            <span className="detail-label">Artworks</span>
            <span className="detail-value">{artworkCount}</span>
          </div>
        )}
        
        {totalValue > 0 && (
          <div className="detail-item">
            <span className="detail-label">Value</span>
            <span className="detail-value">{formatTotalValue(totalValue)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShipmentCard; 
