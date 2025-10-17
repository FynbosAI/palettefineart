import { useEffect, useMemo } from 'react';
import type { NotificationSourceItem } from '../../../shared/notifications/types';
import { MAX_NOTIFICATIONS, sanitizeString, sortSourcesByTimestampDesc, toTitleCase } from '../../../shared/notifications/utils';
import { deriveThreadLabel, deriveThreadSubtitle, getLatestMessage, isMessageFromSelf } from '../../../shared/notifications/chatPresentation';
import useNotificationsStore from '../store/notificationsStore';
import useChatStore, { type ChatThreadSummary } from '../store/chatStore';
import useShipperStore from '../store/useShipperStore';
import { useAuth, useDashboardData } from './useStoreSelectors';

const adaptThread = (thread: ChatThreadSummary) => ({
  id: thread.id,
  shipmentId: thread.shipmentId ?? null,
  quoteId: thread.quoteId ?? null,
  metadata: (thread.metadata ?? {}) as Record<string, unknown>,
  lastMessageAt: thread.lastMessageAt ?? null,
});

const useNotifications = () => {
  const { shipments } = useDashboardData();
  const pendingChangeByShipmentId = useShipperStore((state) => state.pendingChangeByShipmentId);
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
        const hasPendingChange = Boolean(pendingChangeByShipmentId[shipment.id]);
        const descriptionParts = [
          hasPendingChange ? 'Change request pending review' : null,
          shipment.status ? `Status: ${statusLabel}` : null,
        ].filter(Boolean);

        return {
          id: hasPendingChange ? `ship-change-${shipment.id}-${timestamp}` : `ship-${shipment.id}-${timestamp}`,
          title: title ?? 'Shipment Update',
          description: descriptionParts.join(' • ') || 'Shipment activity detected',
          category: 'shipment' as const,
          timestamp,
          href: `/shipments${shipment.id ? `/${shipment.id}` : ''}`,
          metadata: {
            shipmentId: shipment.id,
            status: shipment.status,
            pendingChange: hasPendingChange,
          },
        };
      });
  }, [shipments, pendingChangeByShipmentId]);

  const messageNotifications = useMemo<NotificationSourceItem[]>(() => {
    const items: NotificationSourceItem[] = [];

    threads.forEach((thread) => {
      const messages = messagesByThread[thread.id];
      const latest = getLatestMessage(messages);
      const timestamp = latest?.timestamp ?? thread.lastMessageAt;
      if (!timestamp) {
        return;
      }

      const isSelfMessage = isMessageFromSelf(latest, userId);
      if (isSelfMessage) {
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
    const combined = sortSourcesByTimestampDesc([...shipmentNotifications, ...messageNotifications]);
    return combined.slice(0, MAX_NOTIFICATIONS);
  }, [shipmentNotifications, messageNotifications]);

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
