import { create } from 'zustand';
import type {
  BranchNotification,
  NotificationService,
} from './types';
import {
  computeUnreadCount,
  dedupeAndSortNotifications,
  isNotificationUnread,
  sortNotificationsDescending,
  updateNotificationInList,
} from './utils';
import { notificationDebugEnabled, notificationDebugLog } from './debug';

export interface BranchNotificationStoreState {
  branchId: string | null;
  items: BranchNotification[];
  branchCursor: string | null;
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  pendingToasts: BranchNotification[];
  initialize: (branchId: string | null) => Promise<void>;
  fetchMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
  consumePendingToast: () => BranchNotification | null;
}

export interface CreateNotificationStoreOptions {
  service: NotificationService;
  pageSize?: number;
}

const INITIAL_STATE: Omit<
  BranchNotificationStoreState,
  'initialize' | 'fetchMore' | 'markRead' | 'markAllRead' | 'reset' | 'consumePendingToast'
> = {
  branchId: null,
  items: [],
  branchCursor: null,
  unreadCount: 0,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  pendingToasts: [],
};

export const createNotificationStore = (options: CreateNotificationStoreOptions) => {
  const { service, pageSize = 50 } = options;
  let activeBranchId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let latestInitToken = 0;

  const tearDownSubscription = () => {
    if (unsubscribe) {
      notificationDebugLog('store: tearing down subscription', {
        branchId: activeBranchId,
      });
      unsubscribe();
      unsubscribe = null;
    }
  };

  return create<BranchNotificationStoreState>((set, get) => {
    const applyCollection = (items: BranchNotification[], branchCursor: string | null) => {
      const sorted = sortNotificationsDescending(items);
      const cursor = branchCursor ?? get().branchCursor;
      set({
        items: sorted,
        branchCursor: cursor,
        unreadCount: computeUnreadCount(sorted, cursor),
      });
      notificationDebugLog('store: applied collection', {
        branchId: activeBranchId,
        itemCount: sorted.length,
        cursor,
      });
    };

    const handleInsert = (notification: BranchNotification) => {
      notificationDebugLog('store: insert payload received', {
        activeBranchId,
        notificationId: notification?.id,
        payloadBranchId: notification?.recipientBranchId,
        type: notification?.type,
      });
      if (!notification || notification.recipientBranchId !== activeBranchId) {
        notificationDebugLog('store: insert ignored due to branch mismatch', {
          activeBranchId,
          notificationBranchId: notification?.recipientBranchId,
        });
        return;
      }
      set((state) => {
        const merged = dedupeAndSortNotifications([notification, ...state.items]);
        notificationDebugLog('store: insert applied', {
          activeBranchId,
          mergedCount: merged.length,
        });
        return {
          items: merged,
          unreadCount: computeUnreadCount(merged, state.branchCursor),
          pendingToasts: [...state.pendingToasts, notification],
        };
      });
    };

    const handleUpdate = (notification: BranchNotification) => {
      notificationDebugLog('store: update payload received', {
        activeBranchId,
        notificationId: notification?.id,
        payloadBranchId: notification?.recipientBranchId,
        type: notification?.type,
      });
      if (!notification || notification.recipientBranchId !== activeBranchId) {
        notificationDebugLog('store: update ignored due to branch mismatch', {
          activeBranchId,
          notificationBranchId: notification?.recipientBranchId,
        });
        return;
      }
      set((state) => {
        const updated = updateNotificationInList(state.items, notification);
        if (updated === state.items) {
          return state;
        }
        return {
          items: sortNotificationsDescending(updated),
          unreadCount: computeUnreadCount(updated, state.branchCursor),
        };
      });
    };

    const resetState = () => {
      set({
        ...INITIAL_STATE,
      });
      notificationDebugLog('store: state reset', {
        branchId: activeBranchId,
      });
    };

    return {
      ...INITIAL_STATE,
      initialize: async (branchId: string | null) => {
        notificationDebugLog('store: initialize called', {
          requestedBranchId: branchId,
          activeBranchId,
        });
        if (activeBranchId === branchId) {
          notificationDebugLog('store: initialize skipped (branch unchanged)', {
            branchId,
          });
          return;
        }

        const initToken = ++latestInitToken;
        tearDownSubscription();
        activeBranchId = branchId;
        set({
          ...INITIAL_STATE,
          branchId,
        });
        if (notificationDebugEnabled) {
          notificationDebugLog('store: initialize state reset', {
            activeBranchId,
            initToken,
          });
        }

        if (!branchId) {
          notificationDebugLog('store: initialize aborted (no branchId)');
          return;
        }

        set({ loading: true });
        const { data, error } = await service.list({ branchId, limit: pageSize });

        if (latestInitToken !== initToken) {
          notificationDebugLog('store: initialize response discarded (stale)', {
            initToken,
            latestInitToken,
          });
          return;
        }

        if (error || !data) {
          notificationDebugLog('store: initialize failed to load notifications', {
            branchId,
            error,
          });
          set({
            loading: false,
            error: error ?? 'Unable to load notifications',
          });
          return;
        }

        const sorted = sortNotificationsDescending(data.items);
        set({
          items: sorted,
          branchCursor: data.cursor,
          unreadCount: computeUnreadCount(sorted, data.cursor),
          loading: false,
          hasMore: sorted.length === pageSize,
        });
        notificationDebugLog('store: initialize loaded notifications', {
          branchId,
          itemCount: sorted.length,
          cursor: data.cursor,
        });

        unsubscribe = service.subscribe(branchId, {
          onInsert: handleInsert,
          onUpdate: handleUpdate,
          onError: (message) => set({ error: message }),
        });
        notificationDebugLog('store: subscription active', {
          branchId,
        });
      },
      fetchMore: async () => {
        const state = get();
        if (!state.branchId || !state.hasMore || state.loadingMore) {
          return;
        }

        const lastItem = state.items[state.items.length - 1] ?? null;
        const before = lastItem?.createdAt ?? null;

        set({ loadingMore: true });
        const { data, error } = await service.list({
          branchId: state.branchId,
          before,
          limit: pageSize,
        });

        if (error || !data) {
          notificationDebugLog('store: fetchMore failed', {
            branchId: state.branchId,
            error,
          });
          set({
            loadingMore: false,
            error: error ?? 'Unable to load more notifications',
          });
          return;
        }

        const merged = dedupeAndSortNotifications([...state.items, ...data.items]);
        set({
          items: merged,
          branchCursor: state.branchCursor ?? data.cursor,
          unreadCount: computeUnreadCount(merged, state.branchCursor ?? data.cursor),
          loadingMore: false,
          hasMore: data.items.length === pageSize,
        });
        notificationDebugLog('store: fetchMore loaded notifications', {
          branchId: state.branchId,
          additionalCount: data.items.length,
          totalCount: merged.length,
        });
      },
      markRead: async (notificationId: string) => {
        const state = get();
        if (!state.branchId) {
          return;
        }
        const { data, error } = await service.markRead(notificationId);
        if (error) {
          notificationDebugLog('store: markRead failed', {
            branchId: state.branchId,
            notificationId,
            error,
          });
          set({ error });
          return;
        }

        if (data) {
          const updated = updateNotificationInList(state.items, data);
          if (updated !== state.items) {
            applyCollection(updated, state.branchCursor);
            return;
          }
        }

        // If backend returned null (already read), update locally.
        set((prev) => {
          const updated = prev.items.map((item) =>
            item.id === notificationId
              ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
              : item
          );
          notificationDebugLog('store: markRead updated locally', {
            branchId: prev.branchId,
            notificationId,
          });
          return {
            items: updated,
            unreadCount: computeUnreadCount(updated, prev.branchCursor),
          };
        });
      },
      markAllRead: async () => {
        const state = get();
        if (!state.branchId) {
          return;
        }
        const { data, error } = await service.markAllRead(state.branchId);
        if (error) {
          notificationDebugLog('store: markAllRead failed', {
            branchId: state.branchId,
            error,
          });
          set({ error });
          return;
        }
        const cursor = data ?? new Date().toISOString();
        set((prev) => {
          const updated = prev.items.map((item) => {
            if (isNotificationUnread(item, cursor)) {
              return {
                ...item,
                readAt: item.readAt ?? cursor,
              };
            }
            return item;
          });
          return {
            items: updated,
            branchCursor: cursor,
            unreadCount: computeUnreadCount(updated, cursor),
          };
        });
        notificationDebugLog('store: markAllRead applied', {
          branchId: state.branchId,
          cursor,
        });
      },
      reset: () => {
        latestInitToken += 1;
        tearDownSubscription();
        activeBranchId = null;
        resetState();
        notificationDebugLog('store: reset invoked');
      },
      consumePendingToast: () => {
        let next: BranchNotification | null = null;
        set((state) => {
          if (state.pendingToasts.length === 0) {
            notificationDebugLog('store: consumePendingToast (empty queue)', {
              branchId: state.branchId,
            });
            return state;
          }
          const [head, ...rest] = state.pendingToasts;
          next = head ?? null;
          notificationDebugLog('store: consumePendingToast', {
            branchId: state.branchId,
            notificationId: head?.id,
            remaining: rest.length,
          });
          return {
            pendingToasts: rest,
          };
        });
        return next;
      },
    };
  });
};

export type NotificationStore = ReturnType<typeof createNotificationStore>;
