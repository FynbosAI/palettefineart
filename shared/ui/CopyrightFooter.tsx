import React from 'react';

type FooterVariant = 'gallery' | 'shipper';

interface CopyrightFooterProps {
  variant?: FooterVariant;
  className?: string;
}

const COPYRIGHT_SEGMENTS = [
  'ArtNode Services Limited',
  'Copyright 2025',
  'All Rights Reserved',
] as const;

const CopyrightFooter: React.FC<CopyrightFooterProps> = ({ variant = 'gallery', className }) => {
  const classes = [
    'copyright-footer',
    variant ? `copyright-footer--${variant}` : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <footer
      className={classes}
      role="contentinfo"
      aria-label="ArtNode Services Limited copyright notice"
    >
      {COPYRIGHT_SEGMENTS.map((segment, index) => (
        <React.Fragment key={segment}>
          <span className="copyright-footer__item">{segment}</span>
          {index < COPYRIGHT_SEGMENTS.length - 1 && (
            <span className="copyright-footer__separator" aria-hidden="true">
              •
            </span>
          )}
        </React.Fragment>
      ))}
    </footer>
  );
};

export default CopyrightFooter;
