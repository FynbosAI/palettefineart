export type NotificationCategory =
  | 'shipment'
  | 'quote'
  | 'bid'
  | 'message'
  | 'system';

export interface NotificationSourceItem {
  id: string;
  title: string;
  description?: string;
  category: NotificationCategory;
  timestamp: string;
  href?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NotificationItem extends NotificationSourceItem {
  read: boolean;
  readAt?: string | null;
}
