export type BranchNotificationType =
  | 'message'
  | 'bid_invited'
  | 'bid_submitted'
  | 'bid_accepted'
  | 'bid_rejected'
  | 'bid_withdrawn'
  | 'bid_needs_confirmation'
  | 'quote_withdrawn'
  | 'shipment_status'
  | 'tracking_event'
  | 'document_uploaded'
  | 'shipment_completed'
  | 'system';

export type BranchNotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface BranchNotification {
  id: string;
  recipientBranchId: string;
  type: BranchNotificationType;
  title: string;
  body: string | null;
  actionUrl: string | null;
  entityId: string | null;
  priority: BranchNotificationPriority;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface BranchNotificationCursor {
  branchId: string;
  allReadThrough: string;
}

export type NotificationFilterTab = 'all' | 'quotes' | 'shipments' | 'messages' | 'system';

export interface BranchNotificationWithStatus extends BranchNotification {
  isUnread: boolean;
}

export interface NotificationsListParams {
  branchId: string;
  before?: string | null;
  limit?: number;
}

export interface NotificationsListResult {
  items: BranchNotification[];
  cursor: string | null;
}

export interface NotificationRealtimeHandlers {
  onInsert?: (notification: BranchNotification) => void;
  onUpdate?: (notification: BranchNotification) => void;
  onError?: (message: string) => void;
}

export interface NotificationService {
  list: (
    params: NotificationsListParams
  ) => Promise<{ data: NotificationsListResult | null; error: string | null }>;
  markRead: (
    notificationId: string
  ) => Promise<{ data: BranchNotification | null; error: string | null }>;
  markAllRead: (
    branchId: string
  ) => Promise<{ data: string | null; error: string | null }>;
  subscribe: (
    branchId: string,
    handlers: NotificationRealtimeHandlers
  ) => () => void;
}
