import React, { useState } from 'react';

interface ShipperAvatarProps {
  name: string;
  abbreviation: string;
  brandColor: string;
  imageUrl?: string | null;
  size?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

const ShipperAvatar: React.FC<ShipperAvatarProps> = ({
  name,
  abbreviation,
  brandColor,
  imageUrl,
  size = 36,
  onClick,
  style,
  className = ''
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Debug logging
  // console.log('🖼️ ShipperAvatar rendered:', {
  //   name,
  //   abbreviation,
  //   brandColor,
  //   imageUrl,
  //   hasImageUrl: !!imageUrl,
  //   imageUrlType: typeof imageUrl
  // });

  const handleImageError = () => {
    console.log('❌ ShipperAvatar image failed to load:', { name, imageUrl });
    setImageError(true);
    setImageLoading(false);
  };

  // const handleImageLoad = () => {
  //   console.log('✅ ShipperAvatar image loaded successfully:', { name, imageUrl });
  //   setImageLoading(false);
  // };

  // Show image if available and not errored
  const showImage = imageUrl && !imageError;
  
  // console.log('🔍 ShipperAvatar rendering decision:', {
  //   name,
  //   showImage,
  //   imageUrl,
  //   imageError,
  //   imageLoading
  // });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    }
  };

  const avatarStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: onClick ? 'pointer' : 'default',
    position: 'relative',
    overflow: 'hidden',
    ...style
  };

  const textStyle: React.CSSProperties = {
    color: 'white',
    fontWeight: 'bold',
    fontSize: `${Math.max(10, size * 0.3)}px`,
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
    zIndex: 2,
    position: 'relative'
  };

  return (
    <div
      className={className}
      style={avatarStyle}
      onClick={onClick ? handleClick : undefined}
      title={`${name} - ${abbreviation}`}
      role="img"
      aria-label={`${name} logo`}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={`${name} logo`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: imageLoading ? 0 : 1,
            transition: 'opacity 0.2s ease'
          }}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : (
        /* Fallback to colored avatar with abbreviation */
        <>
          <div
            style={{
              width: '100%',
              height: '100%',
              background: brandColor,
              position: 'absolute',
              top: 0,
              left: 0
            }}
          />
          <span style={textStyle}>{abbreviation}</span>
        </>
      )}
    </div>
  );
};

export default ShipperAvatar;
