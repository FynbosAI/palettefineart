import React from 'react';

interface BetaBannerProps {
  message?: string;
  className?: string;
}

const DEFAULT_MESSAGE = 'Palette is in beta. Some features may be unavailable.';

const BetaBanner: React.FC<BetaBannerProps> = ({ message = DEFAULT_MESSAGE, className }) => {
  return (
    <div className={['beta-banner', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <span className="beta-banner__badge">Beta</span>
      <span className="beta-banner__text">{message}</span>
    </div>
  );
};

export default BetaBanner;
