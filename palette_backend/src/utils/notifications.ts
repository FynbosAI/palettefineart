import type { PostgrestError } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseClient.js';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CreateBranchNotificationParams {
  recipientBranchId: string;
  type:
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
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  entityId?: string | null;
  priority?: NotificationPriority;
  payload?: Record<string, unknown> | null;
}

export interface CreateBranchNotificationResult {
  error: PostgrestError | null;
  notificationId: string | null;
}

const DEFAULT_PRIORITY: NotificationPriority = 'normal';

export const createBranchNotification = async (
  params: CreateBranchNotificationParams
): Promise<CreateBranchNotificationResult> => {
  const {
    recipientBranchId,
    type,
    title,
    body = null,
    actionUrl = null,
    entityId = null,
    priority = DEFAULT_PRIORITY,
    payload = null,
  } = params;

  if (!recipientBranchId) {
    throw new Error('createBranchNotification requires recipientBranchId');
  }
  if (!type) {
    throw new Error('createBranchNotification requires type');
  }
  if (!title) {
    throw new Error('createBranchNotification requires title');
  }

  const cursorResult = await supabaseAdmin
    .from('branch_notification_cursors')
    .upsert(
      { branch_id: recipientBranchId },
      { onConflict: 'branch_id', ignoreDuplicates: true }
    );

  if (cursorResult.error) {
    return { error: cursorResult.error, notificationId: null };
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      recipient_branch_id: recipientBranchId,
      type,
      title,
      body,
      action_url: actionUrl,
      entity_id: entityId,
      priority,
      payload: payload ?? {},
    })
    .select('id')
    .single();

  if (error) {
    return { error, notificationId: null };
  }

  return { error: null, notificationId: data?.id ?? null };
};
