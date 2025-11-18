import { useCallback } from 'react';
import type { BranchNotificationWithStatus } from '../../../shared/notifications/types';
import useSupabaseStore from '../store/useSupabaseStore';
import { useQuoteSelector } from './useQuoteSelector';

const BID_NOTIFICATION_TYPES = new Set<BranchNotificationWithStatus['type']>([
  'bid_invited',
  'bid_submitted',
  'bid_accepted',
  'bid_rejected',
  'bid_withdrawn',
  'bid_needs_confirmation',
  'quote_withdrawn',
]);

const SHIPMENT_NOTIFICATION_TYPES = new Set<BranchNotificationWithStatus['type']>([
  'shipment_status',
  'shipment_completed',
  'document_uploaded',
]);

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const tryPayloadKeys = (
  payload: Record<string, unknown> | undefined,
  keys: string[]
): string | null => {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    if (!(key in payload)) {
      continue;
    }

    const raw = payload[key];
    const directValue = asNonEmptyString(raw);
    if (directValue) {
      return directValue;
    }

    if (raw && typeof raw === 'object') {
      const nested = asNonEmptyString((raw as Record<string, unknown>).id);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
};

const extractQuoteId = (notification: BranchNotificationWithStatus): string | null => {
  const payload = notification.payload as Record<string, unknown> | undefined;
  return tryPayloadKeys(payload, ['quote_id', 'quoteId', 'quote']);
};

const extractShipmentId = (notification: BranchNotificationWithStatus): string | null => {
  const payload = notification.payload as Record<string, unknown> | undefined;
  return (
    tryPayloadKeys(payload, ['shipment_id', 'shipmentId', 'shipment']) ??
    asNonEmptyString(notification.entityId)
  );
};

const DEFAULT_ROUTE = '/logistics';

const ensureLeadingSlash = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const useNotificationNavigation = () => {
  const selectUnifiedItem = useSupabaseStore((state) => state.selectUnifiedItem);
  const selectShipment = useSupabaseStore((state) => state.selectShipment);
  const fetchShipments = useSupabaseStore((state) => state.fetchShipments);
  const { selectAndFetchQuote } = useQuoteSelector();

  return useCallback(
    (notification: BranchNotificationWithStatus): string | null => {
      if (SHIPMENT_NOTIFICATION_TYPES.has(notification.type)) {
        const shipmentId = extractShipmentId(notification);
        if (shipmentId) {
          selectUnifiedItem(shipmentId, 'shipment');
          selectShipment(shipmentId);
          void fetchShipments();
          return DEFAULT_ROUTE;
        }
        return ensureLeadingSlash(notification.actionUrl ?? DEFAULT_ROUTE);
      }

      if (BID_NOTIFICATION_TYPES.has(notification.type)) {
        const quoteId = extractQuoteId(notification);
        if (quoteId) {
          selectUnifiedItem(quoteId, 'estimate');
          void selectAndFetchQuote(quoteId);
          return DEFAULT_ROUTE;
        }
        return ensureLeadingSlash(notification.actionUrl ?? DEFAULT_ROUTE);
      }

      return ensureLeadingSlash(notification.actionUrl ?? null);
    },
    [fetchShipments, selectAndFetchQuote, selectShipment, selectUnifiedItem]
  );
};

export default useNotificationNavigation;
