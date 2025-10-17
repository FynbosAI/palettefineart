import { create } from 'zustand';
import type { NotificationItem, NotificationSourceItem } from './types';

export interface NotificationStoreState {
  items: NotificationItem[];
  syncFromSources: (sources: NotificationSourceItem[]) => void;
  markAllRead: () => void;
  clear: () => void;
}

const sortByTimestampDesc = (a: NotificationItem, b: NotificationItem) => {
  const aTime = Date.parse(a.timestamp);
  const bTime = Date.parse(b.timestamp);
  if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
  if (Number.isNaN(aTime)) return 1;
  if (Number.isNaN(bTime)) return -1;
  return bTime - aTime;
};

export const createNotificationStore = () =>
  create<NotificationStoreState>((set, get) => ({
    items: [],
    syncFromSources: (sources: NotificationSourceItem[]) => {
      set((state) => {
        const previous = new Map(state.items.map((item) => [item.id, item]));

        const nextItems = sources.map((source) => {
          const prior = previous.get(source.id);
          const changed =
            !prior ||
            prior.timestamp !== source.timestamp ||
            prior.description !== source.description ||
            prior.title !== source.title;

          return {
            ...source,
            read: changed ? false : prior?.read ?? false,
            readAt: changed ? null : prior?.readAt ?? null,
          };
        });

        nextItems.sort(sortByTimestampDesc);

        return { items: nextItems };
      });
    },
    markAllRead: () => {
      const timestamp = new Date().toISOString();
      set((state) => ({
        items: state.items.map((item) => ({
          ...item,
          read: true,
          readAt: timestamp,
        })),
      }));
    },
    clear: () => set({ items: [] }),
  }));

export type NotificationStore = ReturnType<typeof createNotificationStore>;
