import { useEffect, useMemo } from 'react';
import type { NotificationSourceItem } from '../../../shared/notifications/types';
import {
  MAX_NOTIFICATIONS,
  sanitizeString,
  sortSourcesByTimestampDesc,
  toTitleCase,
} from '../../../shared/notifications/utils';
import {
  deriveThreadLabel,
  deriveThreadSubtitle,
  getLatestMessage,
  isMessageFromSelf,
} from '../../../shared/notifications/chatPresentation';
import useNotificationsStore from '../store/notificationsStore';
import useChatStore, { type ChatThreadSummary } from '../store/chatStore';
import { useAuth, useDashboardData } from './useStoreSelectors';

const adaptThread = (thread: ChatThreadSummary) => ({
  id: thread.id,
  shipmentId: thread.shipmentId ?? null,
  quoteId: thread.quoteId ?? null,
  metadata: (thread.metadata ?? {}) as Record<string, unknown>,
  lastMessageAt: thread.lastMessageAt ?? null,
});

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const useNotifications = () => {
  const { shipments, quotes } = useDashboardData();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const threads = useChatStore((state) => state.threads);
  const messagesByThread = useChatStore((state) => state.messages);

  const syncFromSources = useNotificationsStore((state) => state.syncFromSources);
  const markAllRead = useNotificationsStore((state) => state.markAllRead);
  const notifications = useNotificationsStore((state) => state.items);

  const shipmentNotifications = useMemo<NotificationSourceItem[]>(() => {
    return shipments
      .filter((shipment) => shipment.updated_at || shipment.created_at)
      .map((shipment) => {
        const timestamp = shipment.updated_at ?? shipment.created_at ?? new Date().toISOString();
        const title =
          sanitizeString(shipment.name) ??
          sanitizeString(shipment.code) ??
          `Shipment ${shipment.id.slice(0, 8)}`;
        const statusLabel = shipment.status ? toTitleCase(shipment.status) : 'Updated';
        const eta = formatDateTime(shipment.estimated_arrival);

        const descriptionParts = [
          shipment.status ? `Status: ${statusLabel}` : null,
          eta ? `ETA ${eta}` : null,
        ].filter(Boolean);

        return {
          id: `ship-${shipment.id}-${timestamp}`,
          title: title ?? 'Shipment Update',
          description: descriptionParts.join(' • ') || 'Shipment activity detected',
          category: 'shipment' as const,
          timestamp,
          href: '/logistics',
          metadata: {
            shipmentId: shipment.id,
            status: shipment.status,
          },
        };
      });
  }, [shipments]);

  const quoteNotifications = useMemo<NotificationSourceItem[]>(() => {
    return quotes
      .filter((quote) => quote.updated_at || quote.created_at)
      .map((quote) => {
        const timestamp = quote.updated_at ?? quote.created_at ?? new Date().toISOString();
        const title =
          sanitizeString(quote.title as string) ??
          sanitizeString(quote.client_reference as string) ??
          `Estimate ${quote.id.slice(0, 8)}`;
        const statusLabel = quote.status ? toTitleCase(quote.status) : 'Updated';
        const deadline = formatDateTime(quote.bidding_deadline as string | null);

        const descriptionParts = [
          `Status: ${statusLabel}`,
          deadline ? `Bidding deadline ${deadline}` : null,
        ].filter(Boolean);

        return {
          id: `quote-${quote.id}-${timestamp}`,
          title: title ?? 'Estimate update',
          description: descriptionParts.join(' • ') || 'Estimate activity detected',
          category: 'quote' as const,
          timestamp,
          href: '/logistics',
          metadata: {
            quoteId: quote.id,
            status: quote.status,
          },
        };
      });
  }, [quotes]);

  const messageNotifications = useMemo<NotificationSourceItem[]>(() => {
    const items: NotificationSourceItem[] = [];

    threads.forEach((thread) => {
      const messages = messagesByThread[thread.id];
      const latest = getLatestMessage(messages);
      const timestamp = latest?.timestamp ?? thread.lastMessageAt;
      if (!timestamp) {
        return;
      }

      if (isMessageFromSelf(latest ?? null, userId)) {
        return;
      }

      const description = sanitizeString(latest?.body ?? '') ?? 'New message received';
      const presentationThread = adaptThread(thread);
      const title = deriveThreadLabel(presentationThread);
      const subtitle = deriveThreadSubtitle(presentationThread);

      items.push({
        id: `chat-${thread.id}-${latest?.sid ?? timestamp}`,
        title,
        description: subtitle ? `${description} • ${subtitle}` : description,
        category: 'message',
        timestamp,
        href: '/messages',
        metadata: {
          threadId: thread.id,
          shipmentId: thread.shipmentId,
          quoteId: thread.quoteId,
        },
      });
    });

    return items;
  }, [threads, messagesByThread, userId]);

  const sourceItems = useMemo(() => {
    const combined = sortSourcesByTimestampDesc([
      ...shipmentNotifications,
      ...quoteNotifications,
      ...messageNotifications,
    ]);
    return combined.slice(0, MAX_NOTIFICATIONS);
  }, [shipmentNotifications, quoteNotifications, messageNotifications]);

  useEffect(() => {
    syncFromSources(sourceItems);
  }, [sourceItems, syncFromSources]);

  const unreadCount = useMemo(
    () => notifications.reduce((total, item) => total + (item.read ? 0 : 1), 0),
    [notifications]
  );

  return {
    notifications,
    unreadCount,
    markAllRead,
  };
};

export default useNotifications;
