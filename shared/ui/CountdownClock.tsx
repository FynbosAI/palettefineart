import React, { useMemo } from 'react';
import { useDeadlineCountdown } from '../time/deadline';
import type { DeadlineUrgency } from '../time/deadlineCore';

type CountdownClockSize = 'small' | 'medium';

interface CountdownClockProps {
  deadline: string | null | undefined;
  manualClose?: boolean;
  intervalMs?: number;
  size?: CountdownClockSize;
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
  noDeadlineLabel?: string;
  manualCloseLabel?: string;
  expiredLabel?: string;
}

interface Segment {
  label: string;
  value: string;
}

const urgencyColors: Record<DeadlineUrgency, { background: string; text: string; accent: string }> = {
  none: { background: '#F3F0FF', text: '#170849', accent: '#170849' },
  normal: { background: '#F3F0FF', text: '#170849', accent: '#170849' },
  warning: { background: 'rgba(233, 147, 45, 0.12)', text: '#C46B0C', accent: '#C46B0C' },
  critical: { background: 'rgba(217, 78, 69, 0.12)', text: '#D94E45', accent: '#D94E45' },
  expired: { background: 'rgba(217, 78, 69, 0.12)', text: '#D94E45', accent: '#D94E45' },
};

const pad = (value: number) => value.toString().padStart(2, '0');

const buildSegments = (remainingMs: number): Segment[] => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const segments: Segment[] = [];

  if (days > 0) {
    segments.push({
      label: days === 1 ? 'Day' : 'Days',
      value: pad(Math.min(days, 99)),
    });
  }

  segments.push(
    { label: 'Hours', value: pad(days > 0 ? hours : Math.min(hours, 99)) },
    { label: 'Minutes', value: pad(minutes) },
    { label: 'Seconds', value: pad(seconds) }
  );

  return segments;
};

const getSizeStyles = (size: CountdownClockSize) => {
  if (size === 'small') {
    return {
      valueFontSize: '14px',
      labelFontSize: '10px',
      segmentPadding: '6px 8px',
      segmentMinWidth: 42,
      gap: 6,
      labelSpacing: 4,
      containerGap: 6,
    };
  }

  return {
    valueFontSize: '18px',
    labelFontSize: '12px',
    segmentPadding: '8px 12px',
    segmentMinWidth: 54,
    gap: 8,
    labelSpacing: 6,
    containerGap: 6,
  };
};

export const CountdownClock: React.FC<CountdownClockProps> = ({
  deadline,
  manualClose = false,
  intervalMs = 1000,
  size = 'medium',
  showLabel = true,
  className,
  style,
  noDeadlineLabel = 'No deadline set',
  manualCloseLabel = 'Closes manually',
  expiredLabel = 'Closed',
}) => {
  const state = useDeadlineCountdown(deadline, {
    manualClose,
    intervalMs,
    closedLabel: expiredLabel,
  });

  const { valueFontSize, labelFontSize, segmentPadding, segmentMinWidth, gap, labelSpacing, containerGap } =
    getSizeStyles(size);

  const { background, text, accent } = urgencyColors[state.urgency];

  const segments = useMemo(() => {
    if (state.remainingMs == null || state.remainingMs <= 0) {
      return [];
    }
    return buildSegments(state.remainingMs);
  }, [state.remainingMs]);

  const baseContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: showLabel ? labelSpacing : 0,
    color: accent,
    fontFamily: "'Fractul', 'Helvetica Neue', Arial, sans-serif",
  };

  if (manualClose) {
    return (
      <div className={className} style={{ ...baseContainerStyle, ...style }}>
        <span style={{ fontSize: size === 'small' ? '12px' : '14px', fontWeight: 600, color: '#58517E' }}>
          {manualCloseLabel}
        </span>
      </div>
    );
  }

  if (!deadline) {
    return (
      <div className={className} style={{ ...baseContainerStyle, ...style }}>
        <span style={{ fontSize: size === 'small' ? '12px' : '14px', fontWeight: 600, color: '#58517E' }}>
          {noDeadlineLabel}
        </span>
      </div>
    );
  }

  if (state.isExpired || segments.length === 0) {
    return (
      <div className={className} style={{ ...baseContainerStyle, ...style }}>
        <span style={{ fontSize: size === 'small' ? '12px' : '14px', fontWeight: 600, color: '#D94E45' }}>
          {state.label}
        </span>
      </div>
    );
  }

  return (
    <div className={className} style={{ ...baseContainerStyle, ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: containerGap }}>
        {segments.map((segment, index) => (
          <div
            key={`${segment.label}-${index}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: segmentPadding,
              minWidth: segmentMinWidth,
              borderRadius: 10,
              backgroundColor: background,
              color: text,
              boxShadow: '0 1px 3px rgba(10, 13, 18, 0.15)',
            }}
          >
            <div
              style={{
                fontSize: valueFontSize,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '0.02em',
              }}
            >
              {segment.value}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: labelFontSize,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'rgba(23, 8, 73, 0.6)',
              }}
            >
              {segment.label}
            </div>
          </div>
        ))}
      </div>
      {showLabel && (
        <span style={{ fontSize: size === 'small' ? '11px' : '12px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.7)' }}>
          {state.label}
        </span>
      )}
    </div>
  );
};

export default CountdownClock;
