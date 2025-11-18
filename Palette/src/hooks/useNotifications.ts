import { useEffect, useMemo } from 'react';
import useNotificationsStore from '../store/notificationsStore';
import { useAuth } from './useStoreSelectors';
import { isNotificationUnread } from '../../../shared/notifications/utils';
import type { BranchNotificationWithStatus } from '../../../shared/notifications/types';
import { notificationDebugLog } from '../../../shared/notifications/debug';

const useNotifications = () => {
  const { currentOrg } = useAuth();
  const branchId = (currentOrg as any)?.id ?? null;

  const initialize = useNotificationsStore((state) => state.initialize);
  const fetchMore = useNotificationsStore((state) => state.fetchMore);
  const markRead = useNotificationsStore((state) => state.markRead);
  const markAllRead = useNotificationsStore((state) => state.markAllRead);
  const consumePendingToast = useNotificationsStore((state) => state.consumePendingToast);

  const items = useNotificationsStore((state) => state.items);
  const branchCursor = useNotificationsStore((state) => state.branchCursor);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const loading = useNotificationsStore((state) => state.loading);
  const loadingMore = useNotificationsStore((state) => state.loadingMore);
  const hasMore = useNotificationsStore((state) => state.hasMore);
  const error = useNotificationsStore((state) => state.error);
  const pendingToastCount = useNotificationsStore((state) => state.pendingToasts.length);

  useEffect(() => {
    initialize(branchId);
  }, [branchId, initialize]);

  useEffect(() => {
    notificationDebugLog('gallery notifications: branch resolved', {
      branchId,
    });
  }, [branchId]);

  useEffect(() => {
    notificationDebugLog('gallery notifications: toast queue update', {
      branchId,
      pendingToastCount,
    });
  }, [branchId, pendingToastCount]);

  const notifications: BranchNotificationWithStatus[] = useMemo(() => {
    const withStatus = items.map((item) => ({
      ...item,
      isUnread: isNotificationUnread(item, branchCursor),
    }));

    return withStatus.filter((notification) => notification.isUnread);
  }, [items, branchCursor]);

  useEffect(() => {
    if (!notifications) {
      return;
    }
    const preview = notifications.slice(0, 3).map((notification) => ({
      id: notification.id,
      type: notification.type,
      recipientBranchId: notification.recipientBranchId,
      isUnread: notification.isUnread,
    }));
    notificationDebugLog('gallery notifications: unread snapshot', {
      branchId,
      unreadCount,
      preview,
    });
  }, [branchId, notifications, unreadCount]);

  return {
    branchId,
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    error,
    fetchMore,
    markRead,
    markAllRead,
    consumePendingToast,
    pendingToastCount,
  };
};

export default useNotifications;
