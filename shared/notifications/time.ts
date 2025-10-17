const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatRelativeTime = (timestamp: string, now: number = Date.now()): string => {
  const target = Date.parse(timestamp);
  if (Number.isNaN(target)) {
    return '';
  }

  const diff = target - now;
  const absDiff = Math.abs(diff);

  if (absDiff < MINUTE) {
    const value = Math.round(diff / SECOND);
    return rtf.format(value, 'second');
  }

  if (absDiff < HOUR) {
    const value = Math.round(diff / MINUTE);
    return rtf.format(value, 'minute');
  }

  if (absDiff < DAY) {
    const value = Math.round(diff / HOUR);
    return rtf.format(value, 'hour');
  }

  if (absDiff < WEEK) {
    const value = Math.round(diff / DAY);
    return rtf.format(value, 'day');
  }

  const value = Math.round(diff / WEEK);
  return rtf.format(value, 'week');
};
