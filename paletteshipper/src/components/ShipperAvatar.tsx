import React, { useEffect, useState } from 'react';

interface ShipperAvatarProps {
  name: string;
  abbreviation: string;
  brandColor: string;
  imageUrl?: string | null;
  fallbackImageUrl?: string | null;
  size?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
  fit?: 'cover' | 'contain';
}

const ShipperAvatar: React.FC<ShipperAvatarProps> = ({
  name,
  abbreviation,
  brandColor,
  imageUrl,
  fallbackImageUrl,
  size = 36,
  onClick,
  style,
  className = '',
  fit = 'contain'
}) => {
  const [currentUrl, setCurrentUrl] = useState<string | null>(imageUrl ?? fallbackImageUrl ?? null);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [attemptedFallback, setAttemptedFallback] = useState(false);

  useEffect(() => {
    setCurrentUrl(imageUrl ?? fallbackImageUrl ?? null);
    setImageError(false);
    setImageLoading(true);
    setAttemptedFallback(false);
  }, [imageUrl, fallbackImageUrl]);

  const handleImageError = () => {
    if (!attemptedFallback && fallbackImageUrl && currentUrl !== fallbackImageUrl) {
      setAttemptedFallback(true);
      setCurrentUrl(fallbackImageUrl);
      setImageError(false);
      setImageLoading(true);
      return;
    }
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const showImage = currentUrl && !imageError;

  const handleClick = (event: React.MouseEvent) => {
    if (!onClick) return;
    event.stopPropagation();
    onClick();
  };

  const avatarStyle: React.CSSProperties = {
    width: size,
    height: size,
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
    fontSize: Math.max(10, size * 0.33),
    textShadow: '0 1px 2px rgba(0,0,0,0.35)'
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
          src={currentUrl!}
          alt={`${name} logo`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: imageLoading ? 0 : 1,
            transition: 'opacity 0.15s ease'
          }}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : (
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
