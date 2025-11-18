import React from 'react';
import { ShipmentDetails, TransportMode, TransportType, Shipper } from '../types';
import {
  LocalShipping as GroundIcon,
  FlightTakeoff as AirIcon,
  DirectionsBoat as SeaIcon,
  LocalPostOffice as CourierIcon,
  Inventory2 as FreightIcon,
} from '@mui/icons-material';

interface ShipmentSpecificsProps {
  details: ShipmentDetails;
  shippers: Shipper[];
  onDetailChange: <K extends keyof ShipmentDetails>(key: K, value: ShipmentDetails[K]) => void;
}

const RadioOption: React.FC<{ 
  name: string; 
  value: string; 
  label: string; 
  icon?: React.ReactNode;
  checked: boolean; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void 
}> = ({ name, value, label, icon, checked, onChange }) => (
    <label style={{ 
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '16px 12px',
        minHeight: '120px',
        fontSize: '12px',
        fontWeight: '500',
        border: checked ? '2px solid #8412ff' : '1px solid #e9eaeb',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        backgroundColor: checked ? 'rgba(132, 18, 255, 0.08)' : '#ffffff',
        color: checked ? '#8412ff' : '#170849',
        textAlign: 'center',
    }}>
        <input 
            type="radio" 
            name={name} 
            value={value} 
            checked={checked} 
            onChange={onChange} 
            style={{ display: 'none' }} 
        />
        {icon && (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: checked ? '#8412ff' : '#170849' }}>
            {icon}
          </span>
        )}
        <span>{label}</span>
    </label>
);

const ShipperCheckbox: React.FC<{ 
  shipper: Shipper; 
  checked: boolean; 
  onToggle: (shipper: Shipper) => void 
}> = ({ shipper, checked, onToggle }) => (
    <div 
      onClick={() => onToggle(shipper)}
      style={{ 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px',
        border: checked ? '2px solid #8412ff' : '1px solid #e9eaeb',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        backgroundColor: checked ? 'rgba(132, 18, 255, 0.04)' : '#ffffff'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* <img 
          src={shipper.logoUrl ?? undefined} 
          alt={shipper.displayName} 
          style={{ height: '20px', width: 'auto', marginRight: '12px' }}
        /> */}
        <span style={{ fontWeight: '500', color: '#170849', fontSize: '12px' }}>{shipper.displayName}</span>
      </div>
      <div style={{ 
        height: '16px',
        width: '16px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: checked ? '2px solid #8412ff' : '2px solid #e9eaeb',
        backgroundColor: checked ? '#8412ff' : '#ffffff',
        transition: 'all 0.2s ease-in-out'
      }}>
        {checked && (
          <svg 
            style={{ width: '10px', height: '10px', color: '#ffffff' }} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="3" 
              d="M5 13l4 4L19 7" 
            />
          </svg>
        )}
      </div>
    </div>
);

const ShipmentSpecifics: React.FC<ShipmentSpecificsProps> = ({ details, shippers, onDetailChange }) => {
    
  const handleTransportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTransportMode = e.target.value as TransportMode;
      onDetailChange('transportMode', newTransportMode);
      
      // Reset transport type when transport mode changes
      // Default to Dedicated for Ground and Air, none for Courier/FedEx
      if (newTransportMode === TransportMode.Courier || newTransportMode === TransportMode.FedExFreight) {
        onDetailChange('transportType', null);
      } else {
        onDetailChange('transportType', TransportType.Dedicated);
      }
  };

  const handleTransportTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onDetailChange('transportType', e.target.value as TransportType);
  };

  const handleShipperToggle = (shipper: Shipper) => {
      const selectionId = shipper.branchOrgId;
      const newSet = new Set(details.selectedShippers);
      const newContexts = new Map(details.selectedShipperContexts);

      if (newSet.has(selectionId)) {
          newSet.delete(selectionId);
          newContexts.delete(selectionId);
      } else {
          newSet.add(selectionId);
          newContexts.set(selectionId, {
              logisticsPartnerId: shipper.logisticsPartnerId,
              branchOrgId: shipper.branchOrgId,
              companyOrgId: shipper.companyOrgId,
          });
      }

      onDetailChange('selectedShippers', newSet);
      onDetailChange('selectedShipperContexts', newContexts);
  };

  const transportModes: Array<{ mode: TransportMode; label: string; icon: React.ReactNode }> = [
    { mode: TransportMode.Ground, label: 'Ground', icon: <GroundIcon fontSize="large" /> },
    { mode: TransportMode.Air, label: 'Air', icon: <AirIcon fontSize="large" /> },
    { mode: TransportMode.Sea, label: 'Sea', icon: <SeaIcon fontSize="large" /> },
    { mode: TransportMode.Courier, label: 'Courier', icon: <CourierIcon fontSize="large" /> },
    { mode: TransportMode.FedExFreight, label: 'FedEx Freight', icon: <FreightIcon fontSize="large" /> },
  ];
  
  // Conditional transport types based on selected transport mode
  const getTransportTypes = () => {
    if (details.transportMode === TransportMode.Ground) {
      return [TransportType.Dedicated, TransportType.Shuttle];
    } else if (details.transportMode === TransportMode.Air || details.transportMode === TransportMode.Sea) {
      return [TransportType.Dedicated, TransportType.Consolidated];
    }
    // No transport types for Courier or FedEx Freight
    return [];
  };

  const shouldShowTransportTypes = () => {
    return details.transportMode !== TransportMode.Courier && 
           details.transportMode !== TransportMode.FedExFreight;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2>Shipment Specifics</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
              <label style={{ 
                fontSize: '12px', 
                fontWeight: '500', 
                color: 'rgba(23, 8, 73, 0.7)',
                display: 'block',
                marginBottom: '8px'
              }}>
                Transport Mode
              </label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                gap: '12px',
                justifyContent: 'center',
                justifyItems: 'center'
              }}>
                  {transportModes.map(option => (
                      <RadioOption 
                        key={option.mode} 
                        name="transportMode" 
                        value={option.mode} 
                        label={option.label} 
                        icon={option.icon}
                        checked={details.transportMode === option.mode} 
                        onChange={handleTransportChange} 
                      />
                  ))}
              </div>
          </div>
          {shouldShowTransportTypes() && (
            <div>
                <label style={{ 
                  fontSize: '12px', 
                  fontWeight: '500', 
                  color: 'rgba(23, 8, 73, 0.7)',
                  display: 'block',
                  marginBottom: '8px'
                }}>
                  Transport Type
                </label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', 
                  gap: '12px',
                  justifyItems: 'center'
                }}>
                     {getTransportTypes().map(type => (
                        <RadioOption 
                          key={type} 
                          name="transportType" 
                          value={type} 
                          label={type} 
                          checked={details.transportType === type} 
                          onChange={handleTransportTypeChange} 
                        />
                    ))}
                </div>
            </div>
          )}
           <div>
              <label style={{ 
                fontSize: '12px', 
                fontWeight: '500', 
                color: 'rgba(23, 8, 73, 0.7)',
                display: 'block',
                marginBottom: '4px'
              }}>
                Shippers to Notify
              </label>
              <p style={{ 
                fontSize: '12px', 
                color: 'rgba(23, 8, 73, 0.7)',
                marginBottom: '8px'
              }}>
                Select which approved shippers should receive this request.
              </p>
              {shippers.length === 0 ? (
                <div style={{
                  padding: '12px',
                  border: '1px dashed #e9eaeb',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'rgba(23, 8, 73, 0.7)'
                }}>
                  No eligible shippers are available yet. Invite a shipper teammate to sign in so their branch appears here.
                </div>
              ) : (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '12px'
                }}>
                    {shippers.map(shipper => (
                        <ShipperCheckbox 
                          key={shipper.branchOrgId} 
                          shipper={shipper} 
                          checked={details.selectedShippers.has(shipper.branchOrgId)} 
                          onToggle={handleShipperToggle} 
                        />
                    ))}
                </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default ShipmentSpecifics;
