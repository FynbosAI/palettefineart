import React, { ChangeEvent } from 'react';
import { Artwork } from '../types';

interface ArtworkCardProps {
  artwork: Artwork;
  onArtworkChange: (updatedArtwork: Artwork) => void;
  showValidationErrors?: boolean;
}

const EditableField: React.FC<{
  label: string;
  name: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  as?: 'input' | 'textarea';
  type?: string;
  prefix?: string;
  suffix?: string;
  hasError?: boolean;
  errorMessage?: string;
}> = ({ label, name, value, onChange, as = 'input', type = 'text', prefix, suffix, hasError = false, errorMessage }) => {
  const commonStyles = {
    display: 'block',
    width: '100%',
    fontSize: '12px',
    backgroundColor: '#f5f5f5',
    border: hasError ? '1px solid #d32f2f' : '1px solid #e9eaeb',
    borderRadius: '6px',
    outline: 'none',
    transition: 'border-color 0.2s ease-in-out'
  };

  const inputStyles = {
    ...commonStyles,
    padding: '8px',
    paddingLeft: prefix ? '24px' : '8px',
    paddingRight: suffix ? '32px' : '8px'
  };

  const textAreaStyles = {
    ...commonStyles,
    padding: '8px',
    resize: 'vertical' as const
  };

  const inputEl = (
    <input
      type={type}
      name={name}
      id={name}
      value={value}
      onChange={onChange}
      style={inputStyles}
      onFocus={(e) => e.currentTarget.style.borderColor = '#8412ff'}
      onBlur={(e) => e.currentTarget.style.borderColor = hasError ? '#d32f2f' : '#e9eaeb'}
    />
  );

  const textAreaEl = (
    <textarea
      name={name}
      id={name}
      value={value}
      onChange={onChange}
      rows={4}
      style={textAreaStyles}
      onFocus={(e) => e.currentTarget.style.borderColor = '#8412ff'}
      onBlur={(e) => e.currentTarget.style.borderColor = hasError ? '#d32f2f' : '#e9eaeb'}
    />
  );

  return (
    <div>
      <label 
        htmlFor={name} 
        style={{ 
          display: 'block', 
          fontSize: '12px', 
          fontWeight: '500', 
          color: hasError ? '#d32f2f' : 'rgba(23, 8, 73, 0.7)', 
          marginBottom: '4px'
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {prefix && (
          <div style={{ 
            position: 'absolute', 
            left: '8px', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            pointerEvents: 'none',
            color: 'rgba(23, 8, 73, 0.7)',
            fontSize: '12px'
          }}>
            {prefix}
          </div>
        )}
        {as === 'input' ? inputEl : textAreaEl}
        {suffix && (
          <div style={{ 
            position: 'absolute', 
            right: '8px', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            pointerEvents: 'none',
            color: 'rgba(23, 8, 73, 0.7)',
            fontSize: '12px'
          }}>
            {suffix}
          </div>
        )}
      </div>
      {hasError && errorMessage && (
        <div style={{
          fontSize: '11px',
          color: '#d32f2f',
          marginTop: '4px'
        }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};

const ArtworkCard: React.FC<ArtworkCardProps> = ({ artwork, onArtworkChange, showValidationErrors = false }) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const isNumber = e.target instanceof HTMLInputElement && e.target.type === 'number';
    
    const processedValue = isNumber ? parseFloat(value) || 0 : value;

    const updatedArtwork = {
      ...artwork,
      [name]: processedValue,
    };
    
    onArtworkChange(updatedArtwork);
  };

  // Validation checks
  const isTitleEmpty = showValidationErrors && (!artwork.title || artwork.title.trim() === '');
  const isDescriptionEmpty = showValidationErrors && (!artwork.description || artwork.description.trim() === '');
  const isValueInvalid = showValidationErrors && artwork.value <= 0;
  const isMediumEmpty = showValidationErrors && (!artwork.medium || artwork.medium.trim() === '');
  const isCountryEmpty = showValidationErrors && (!artwork.countryOfOrigin || artwork.countryOfOrigin.trim() === '');
  const isCustomsStatusEmpty = showValidationErrors && (!artwork.currentCustomsStatus || artwork.currentCustomsStatus.trim() === '');
  
  return (
    <div style={{ 
      backgroundColor: '#f8f9fa',
      border: '1px solid #e9eaeb',
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
        <img 
          src={artwork.imageUrl} 
          alt={artwork.title} 
          style={{ 
            width: '120px', 
            height: '120px', 
            objectFit: 'cover', 
            borderRadius: '6px', 
            flexShrink: 0 
          }}
        />
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
              gap: '12px' 
            }}>
              <EditableField label="Artist" name="artist" value={artwork.artist} onChange={handleChange} />
              <EditableField label="Year" name="year" value={artwork.year} onChange={handleChange} type="text"/>
            </div>
            <EditableField 
              label="Title" 
              name="title" 
              value={artwork.title} 
              onChange={handleChange} 
              hasError={isTitleEmpty}
              errorMessage={isTitleEmpty ? "Title is required" : undefined}
            />
            <EditableField 
              as="textarea" 
              label="Description" 
              name="description" 
              value={artwork.description} 
              onChange={handleChange} 
              hasError={isDescriptionEmpty}
              errorMessage={isDescriptionEmpty ? "Description is required" : undefined}
            />
          </div>

          <div style={{ 
            marginTop: '12px', 
            paddingTop: '12px', 
            borderTop: '1px solid #e9eaeb' 
          }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '16px' 
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <EditableField 
                  label="Value" 
                  name="value" 
                  value={artwork.value} 
                  onChange={handleChange} 
                  type="number" 
                  prefix="$"
                  hasError={isValueInvalid}
                  errorMessage={isValueInvalid ? "Value must be greater than 0" : undefined}
                />
              </div>
              <div>
                <EditableField 
                  label="Dimensions" 
                  name="dimensions" 
                  value={artwork.dimensions} 
                  onChange={handleChange}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <EditableField 
                  label="Medium" 
                  name="medium" 
                  value={artwork.medium} 
                  onChange={handleChange}
                  hasError={isMediumEmpty}
                  errorMessage={isMediumEmpty ? "Medium is required" : undefined}
                />
                <EditableField 
                  label="Country of Origin" 
                  name="countryOfOrigin" 
                  value={artwork.countryOfOrigin} 
                  onChange={handleChange}
                  hasError={isCountryEmpty}
                  errorMessage={isCountryEmpty ? "Country of origin is required" : undefined}
                />
              </div>
              <div>
                <EditableField 
                  label="Current Customs Status" 
                  name="currentCustomsStatus" 
                  value={artwork.currentCustomsStatus} 
                  onChange={handleChange}
                  hasError={isCustomsStatusEmpty}
                  errorMessage={isCustomsStatusEmpty ? "Customs status is required" : undefined}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArtworkCard;
