import type {
  PostgrestError,
  RealtimeChannel,
  RealtimeChannelStatus,
  SupabaseClient,
} from '@supabase/supabase-js';
import type {
  BranchNotification,
  BranchNotificationPriority,
  BranchNotificationType,
  NotificationRealtimeHandlers,
  NotificationService,
  NotificationsListResult,
  NotificationsListParams,
} from './types';
import { notificationDebugLog } from './debug';

type NotificationRow = {
  id: string;
  recipient_branch_id: string;
  type: BranchNotificationType;
  title: string;
  body: string | null;
  action_url: string | null;
  entity_id: string | null;
  priority: BranchNotificationPriority;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
};

type BranchCursorRow = {
  branch_id: string;
  all_read_through: string;
};

const adaptNotificationRow = (row: NotificationRow): BranchNotification => ({
  id: row.id,
  recipientBranchId: row.recipient_branch_id,
  type: row.type,
  title: row.title,
  body: row.body,
  actionUrl: row.action_url,
  entityId: row.entity_id,
  priority: row.priority,
  payload: row.payload ?? {},
  createdAt: row.created_at,
  readAt: row.read_at,
});

const extractCursor = (row: BranchCursorRow | null): string | null =>
  row?.all_read_through ?? null;

const isNotFound = (error: PostgrestError | null): boolean =>
  Boolean(error && (error.code === 'PGRST116' || error.code === 'PGRST201'));

export const createSupabaseNotificationService = <Database>(
  client: SupabaseClient<Database>
): NotificationService => {
  const list = async (
    params: NotificationsListParams
  ): Promise<{ data: NotificationsListResult | null; error: string | null }> => {
    const { branchId, before, limit = 50 } = params;

    let query = client
      .from('notifications')
      .select('*')
      .eq('recipient_branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: rows, error } = await query;
    if (error) {
      return { data: null, error: error.message };
    }

    const { data: cursorRow, error: cursorError } = await client
      .from('branch_notification_cursors')
      .select('branch_id, all_read_through')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (cursorError && !isNotFound(cursorError)) {
      return { data: null, error: cursorError.message };
    }

    return {
      data: {
        items: (rows ?? []).map((row) => adaptNotificationRow(row as NotificationRow)),
        cursor: extractCursor(cursorRow as BranchCursorRow | null),
      },
      error: null,
    };
  };

  const markRead = async (
    notificationId: string
  ): Promise<{ data: BranchNotification | null; error: string | null }> => {
    const { data, error } = await client.rpc('mark_notification_read', {
      p_notification_id: notificationId,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return { data: adaptNotificationRow(data as NotificationRow), error: null };
  };

  const markAllRead = async (
    branchId: string
  ): Promise<{ data: string | null; error: string | null }> => {
    const { data, error } = await client.rpc('mark_all_read_for_branch', {
      p_branch_id: branchId,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: null };
    }

    const cursorRow = data as BranchCursorRow;
    return { data: cursorRow.all_read_through ?? null, error: null };
  };

  const subscribe = (
    branchId: string,
    handlers: NotificationRealtimeHandlers
  ): (() => void) => {
    const channelName = `branch_notifications_${branchId}`;
    notificationDebugLog('realtime: subscribing to notifications', {
      branchId,
      channelName,
    });
    const channel: RealtimeChannel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_branch_id=eq.${branchId}`,
        },
        (payload) => {
          notificationDebugLog('realtime: insert event received', {
            branchId,
            channelName,
            notificationId: (payload.new as NotificationRow | undefined)?.id,
            recipientBranchId: (payload.new as NotificationRow | undefined)?.recipient_branch_id,
            type: (payload.new as NotificationRow | undefined)?.type,
          });
          if (payload.new) {
            handlers.onInsert?.(adaptNotificationRow(payload.new as NotificationRow));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_branch_id=eq.${branchId}`,
        },
        (payload) => {
          notificationDebugLog('realtime: update event received', {
            branchId,
            channelName,
            notificationId: (payload.new as NotificationRow | undefined)?.id,
            recipientBranchId: (payload.new as NotificationRow | undefined)?.recipient_branch_id,
            type: (payload.new as NotificationRow | undefined)?.type,
          });
          if (payload.new) {
            handlers.onUpdate?.(adaptNotificationRow(payload.new as NotificationRow));
          }
        }
      )
      .subscribe((status: RealtimeChannelStatus) => {
        notificationDebugLog('realtime: subscription status change', {
          branchId,
          channelName,
          status,
        });
        if (status === 'CHANNEL_ERROR') {
          handlers.onError?.('Realtime notifications channel error');
        }
      });

    return () => {
      notificationDebugLog('realtime: unsubscribing', {
        branchId,
        channelName,
      });
      channel.unsubscribe().catch(() => undefined);
      client.removeChannel(channel);
    };
  };

  return {
    list,
    markRead,
    markAllRead,
    subscribe,
  };
};
