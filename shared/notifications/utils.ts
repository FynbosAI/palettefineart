import type {
  BranchNotification,
  BranchNotificationType,
  NotificationFilterTab,
} from './types';

export const sanitizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const toTitleCase = (value: string): string =>
  value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const parseTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const sortNotificationsDescending = (items: BranchNotification[]): BranchNotification[] =>
  [...items].sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt));

export const dedupeAndSortNotifications = (
  items: BranchNotification[]
): BranchNotification[] => {
  const map = new Map<string, BranchNotification>();
  items.forEach((item) => {
    map.set(item.id, item);
  });
  return sortNotificationsDescending([...map.values()]);
};

export const updateNotificationInList = (
  items: BranchNotification[],
  next: BranchNotification
): BranchNotification[] => {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) {
    return items;
  }
  const updated = [...items];
  updated[index] = next;
  return updated;
};

export const isNotificationUnread = (
  notification: BranchNotification,
  branchCursor: string | null
): boolean => {
  const cursorTime = parseTimestamp(branchCursor);
  const readTime = parseTimestamp(notification.readAt);

  if (readTime > 0 && readTime >= cursorTime) {
    return false;
  }

  if (!notification.readAt) {
    const createdTime = parseTimestamp(notification.createdAt);
    return createdTime > cursorTime;
  }

  return false;
};

export const computeUnreadCount = (
  items: BranchNotification[],
  branchCursor: string | null
): number => items.reduce((total, item) => (isNotificationUnread(item, branchCursor) ? total + 1 : total), 0);

const QUOTE_AND_BID_TYPES: BranchNotificationType[] = [
  'bid_invited',
  'bid_submitted',
  'bid_accepted',
  'bid_rejected',
  'bid_withdrawn',
  'bid_needs_confirmation',
  'quote_withdrawn',
];

const SHIPMENT_TYPES: BranchNotificationType[] = [
  'shipment_status',
  'tracking_event',
  'shipment_completed',
];

const MESSAGE_TYPES: BranchNotificationType[] = ['message'];

const SYSTEM_TYPES: BranchNotificationType[] = ['system', 'document_uploaded'];

export const NOTIFICATION_TAB_MAP: Record<NotificationFilterTab, BranchNotificationType[]> = {
  all: [],
  quotes: QUOTE_AND_BID_TYPES,
  shipments: SHIPMENT_TYPES,
  messages: MESSAGE_TYPES,
  system: SYSTEM_TYPES,
};

export const filterNotificationsByTab = (
  tab: NotificationFilterTab,
  items: BranchNotification[]
): BranchNotification[] => {
  if (tab === 'all') {
    return items;
  }
  const types = new Set(NOTIFICATION_TAB_MAP[tab]);
  return items.filter((item) => types.has(item.type));
};

export const MAX_NOTIFICATIONS = 10;
