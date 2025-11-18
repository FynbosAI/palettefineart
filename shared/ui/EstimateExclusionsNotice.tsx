import React from 'react';

export type EstimateExclusionsAppearance = 'card' | 'subtle';

export interface EstimateExclusionsNoticeProps {
  title?: string;
  compact?: boolean;
  appearance?: EstimateExclusionsAppearance;
  className?: string;
  style?: React.CSSProperties;
}

const EXCLUSION_ITEMS = [
  'UK import VAT/Duty',
  'Insurance',
  'CITES Permit application – if applicable',
  'Witness Offload/Special collection from the airline',
  'Customs examination charges',
  'Airline storage charges',
  'Warehouse storage',
  'Installation',
];

const ADDITIONAL_NOTES = [
  'Assumes ground floor, free, unrestricted access at the delivery address (or suitable lift).',
  'Also assumes the actual weight does not exceed the Volume Weight.',
  "Please Note: This estimate is subject to today's currency exchange rates; should these change we have the right to change the estimate.",
  'Estimate assumes shipment will not attract any security/premium handling charges.',
  'Any security/premium handling charges billed to us will be billed in addition to our estimate.',
];

const EstimateExclusionsNotice: React.FC<EstimateExclusionsNoticeProps> = ({
  title = 'Important exclusions & assumptions',
  compact = false,
  appearance = 'card',
  className,
  style,
}) => {
  const cardPadding = compact ? '16px' : '20px';
  const headingSize = compact ? '14px' : '15px';
  const bodySize = compact ? '13px' : '14px';
  const listGap = compact ? 6 : 8;
  const isSubtle = appearance === 'subtle';

  const backgroundStyle = isSubtle
    ? {
        border: '1px solid rgba(132, 18, 255, 0.18)',
        background: '#F7F3FF',
        boxShadow: 'none',
      }
    : {
        border: '1px solid rgba(132, 18, 255, 0.25)',
        background: 'linear-gradient(135deg, rgba(132, 18, 255, 0.08), rgba(0, 170, 171, 0.08))',
        boxShadow: '0 18px 45px rgba(23, 8, 73, 0.08)',
      };

  const badgeColors = isSubtle
    ? { background: '#EFE8FF', color: '#5B3DBE' }
    : { background: '#170849', color: '#ffffff' };

  const bulletColor = isSubtle ? '#C9B8FF' : '#00AAAB';

  return (
    <div
      className={className}
      style={{
        borderRadius: 16,
        ...backgroundStyle,
        padding: cardPadding,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 10 : 14,
        fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
        color: '#1b1f3b',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: badgeColors.background,
            color: badgeColors.color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: compact ? '13px' : '14px',
            boxShadow: isSubtle ? 'none' : '0 4px 14px rgba(23, 8, 73, 0.25)',
          }}
        >
          NB
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: headingSize,
              fontWeight: 700,
              color: '#170849',
              letterSpacing: 0.2,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: bodySize, color: 'rgba(23, 8, 73, 0.7)' }}>
            This estimate is based on the information provided, valid for 14 days and excludes:
          </span>
        </div>
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: listGap,
        }}
      >
        {EXCLUSION_ITEMS.map((item) => (
          <li key={item} style={{ display: 'flex', gap: 8, fontSize: bodySize, color: '#1c1f33' }}>
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                marginTop: 8,
                borderRadius: '50%',
              background: bulletColor,
              flexShrink: 0,
              boxShadow: isSubtle ? 'none' : '0 0 0 3px rgba(0, 170, 171, 0.15)',
            }}
          />
          <span>{item}</span>
        </li>
        ))}
      </ul>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: listGap,
          fontSize: bodySize,
          color: 'rgba(23, 8, 73, 0.85)',
        }}
      >
        {ADDITIONAL_NOTES.map((note) => (
          <p key={note} style={{ margin: 0, lineHeight: 1.45 }}>
            {note}
          </p>
        ))}
      </div>
    </div>
  );
};

export default EstimateExclusionsNotice;
