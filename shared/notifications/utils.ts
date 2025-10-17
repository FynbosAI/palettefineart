export const sanitizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const toTitleCase = (value: string): string => {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const sortSourcesByTimestampDesc = <T extends { timestamp: string }>(items: T[]): T[] => {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });
};

export const MAX_NOTIFICATIONS = 10;
