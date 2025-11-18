import React from 'react';

interface BetaBannerProps {
  message?: string;
  className?: string;
}

const DEFAULT_MESSAGE = 'Palette is in beta. Some features may be unavailable.';
const LARGE_SCREEN_GUIDANCE = 'Palette is best experienced on a larger screen like a desktop, laptop, or tablet.';

const BetaBanner: React.FC<BetaBannerProps> = ({ message = DEFAULT_MESSAGE, className }) => {
  return (
    <div className={['beta-banner', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <span className="beta-banner__badge">Beta</span>
      <div className="beta-banner__copy">
        <span className="beta-banner__text">{message}</span>
        <span className="beta-banner__note">{LARGE_SCREEN_GUIDANCE}</span>
      </div>
    </div>
  );
};

export default BetaBanner;
