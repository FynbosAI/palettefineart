import React from 'react';
import { Artwork } from '../types';
import ArtworkCard from './ArtworkCard';
import Tooltip from '@mui/material/Tooltip';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface ArtworkListProps {
  artworks: Artwork[];
  onArtworkChange: (updatedArtwork: Artwork) => void;
  showValidationErrors?: boolean;
  dimensionUnit: 'in' | 'cm';
  onDimensionUnitChange: (unit: 'in' | 'cm') => void;
}

const ArtworkList: React.FC<ArtworkListProps> = ({ 
  artworks, 
  onArtworkChange, 
  showValidationErrors = false,
  dimensionUnit,
  onDimensionUnitChange,
}) => {
  const handleUnitToggle = (unit: 'in' | 'cm') => {
    if (unit !== dimensionUnit) {
      onDimensionUnitChange(unit);
    }
  };

  const renderUnitButton = (unit: 'in' | 'cm', label: string) => {
    const isActive = unit === dimensionUnit;
    return (
      <button
        type="button"
        onClick={() => handleUnitToggle(unit)}
        style={{
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: isActive ? '#8412ff' : '#ffffff',
          color: isActive ? '#ffffff' : '#170849',
          transition: 'background-color 0.2s ease-in-out',
          flex: 1
        }}
      >
        {label}
      </button>
    );
  };

  const unitContainerStyles: React.CSSProperties = {
    display: 'inline-flex',
    borderRadius: '999px',
    border: '1px solid #d0d0d0',
    overflow: 'hidden',
    backgroundColor: '#ffffff'
  };

  const dimensionTooltip = 'Switch between imperial (inches) and metric (centimeters). Palette does not auto-convert existing values.';

  return (
    <div>
        <h2>Artworks to Ship({artworks.length})</h2>
        <p style={{ 
          fontSize: '12px', 
          color: 'rgba(23, 8, 73, 0.7)', 
          marginBottom: '16px'
        }}>
          All fields below are editable. Click on a value to change it.
        </p>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '8px',
          marginBottom: '16px'
        }}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            alignItems: 'center', 
            gap: '12px'
          }}>
            <span style={{ 
              fontSize: '12px', 
              color: '#170849', 
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>Dimension units</span>
              <Tooltip title={dimensionTooltip} arrow>
                <HelpOutlineIcon sx={{ fontSize: 16, color: 'rgba(23, 8, 73, 0.7)' }} />
              </Tooltip>
            </span>
            <div style={unitContainerStyles}>
              {renderUnitButton('in', 'Inches (in)')}
              {renderUnitButton('cm', 'Centimeters (cm)')}
            </div>
          </div>
          <p style={{ 
            fontSize: '11px', 
            color: 'rgba(23, 8, 73, 0.7)', 
            margin: 0 
          }}>
            Inches use the imperial system and are standard for U.S. galleries. Centimeters use the metric system and are preferred for most international shipments. Enter all artwork dimensions using the selected unit.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {artworks.map(artwork => (
            <ArtworkCard
            key={artwork.id}
            artwork={artwork}
            onArtworkChange={onArtworkChange}
            showValidationErrors={showValidationErrors}
            dimensionUnit={dimensionUnit}
            />
        ))}
        </div>
    </div>
  );
};

export default ArtworkList;
