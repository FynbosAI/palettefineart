import React from 'react';
import { Artwork } from '../types';
import ArtworkCard from './ArtworkCard';

interface ArtworkListProps {
  artworks: Artwork[];
  onArtworkChange: (updatedArtwork: Artwork) => void;
  showValidationErrors?: boolean;
}

const ArtworkList: React.FC<ArtworkListProps> = ({ artworks, onArtworkChange, showValidationErrors = false }) => {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {artworks.map(artwork => (
            <ArtworkCard
            key={artwork.id}
            artwork={artwork}
            onArtworkChange={onArtworkChange}
            showValidationErrors={showValidationErrors}
            />
        ))}
        </div>
    </div>
  );
};

export default ArtworkList;
