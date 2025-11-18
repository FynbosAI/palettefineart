import { useCallback } from 'react';
import type { BranchNotificationWithStatus } from '../../../shared/notifications/types';
import useShipperStore from '../store/useShipperStore';

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
  'tracking_event',
  'document_uploaded',
  'shipment_completed',
]);

const DEFAULT_SHIPMENT_ROUTE = '/shipments';
const DEFAULT_BID_ROUTE = '/estimates';

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
    const direct = asNonEmptyString(raw);
    if (direct) {
      return direct;
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

const extractBidId = (notification: BranchNotificationWithStatus): string | null => {
  const payload = notification.payload as Record<string, unknown> | undefined;
  return tryPayloadKeys(payload, ['bid_id', 'bidId', 'bid']);
};

const extractShipmentId = (notification: BranchNotificationWithStatus): string | null => {
  const payload = notification.payload as Record<string, unknown> | undefined;
  return (
    tryPayloadKeys(payload, ['shipment_id', 'shipmentId', 'shipment']) ??
    asNonEmptyString(notification.entityId)
  );
};

const ensureLeadingSlash = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const resolveShipmentIdFromShipments = (
  shipments: Array<Record<string, unknown>> | undefined,
  shipmentId: string | null,
  quoteId: string | null
): string | null => {
  const items = Array.isArray(shipments) ? shipments : [];

  const normalizedShipmentId = asNonEmptyString(shipmentId);
  if (normalizedShipmentId) {
    const hasMatchingId = items.some((shipment) => {
      const candidateId = tryPayloadKeys(shipment, ['id', 'shipment_id', 'shipmentId']);
      return candidateId === normalizedShipmentId;
    });
    if (hasMatchingId) {
      return normalizedShipmentId;
    }
  }

  const normalizedQuoteId = asNonEmptyString(quoteId);
  if (!normalizedQuoteId) {
    return null;
  }

  for (const shipment of items) {
    const shipmentQuoteId = tryPayloadKeys(shipment, ['quote_id', 'quoteId', 'quote']);
    if (shipmentQuoteId === normalizedQuoteId) {
      const candidateId = tryPayloadKeys(shipment, ['id', 'shipment_id', 'shipmentId']);
      if (candidateId) {
        return candidateId;
      }
    }
  }

  return null;
};

export const useNotificationNavigation = () => {
  const selectShipment = useShipperStore((state) => state.selectShipment);
  const fetchAssignedShipments = useShipperStore((state) => state.fetchAssignedShipments);
  const selectBid = useShipperStore((state) => state.selectBid);
  const fetchMyBids = useShipperStore((state) => state.fetchMyBids);
  const selectQuote = useShipperStore((state) => state.selectQuote);
  const fetchAvailableQuotes = useShipperStore((state) => state.fetchAvailableQuotes);

  const ensureShipmentSelection = useCallback(
    (shipmentId: string | null, quoteId: string | null) => {
      const currentShipments = (useShipperStore.getState().assignedShipments ?? []) as Array<
        Record<string, unknown>
      >;
      const existingSelection = resolveShipmentIdFromShipments(
        currentShipments,
        shipmentId,
        quoteId
      );
      const candidateSelection = existingSelection ?? shipmentId ?? null;

      if (candidateSelection) {
        selectShipment(candidateSelection);
      }

      void fetchAssignedShipments().then(() => {
        const refreshedShipments = (useShipperStore.getState().assignedShipments ?? []) as Array<
          Record<string, unknown>
        >;
        const refreshedSelection = resolveShipmentIdFromShipments(
          refreshedShipments,
          shipmentId ?? candidateSelection,
          quoteId
        );
        if (refreshedSelection) {
          selectShipment(refreshedSelection);
        }
      });
    },
    [fetchAssignedShipments, selectShipment]
  );

  return useCallback(
    (notification: BranchNotificationWithStatus): string | null => {
      if (notification.type === 'bid_accepted') {
        const bidId = extractBidId(notification);
        if (bidId) {
          selectBid(bidId);
          void fetchMyBids();
        }

        const quoteId = extractQuoteId(notification);
        if (quoteId) {
          selectQuote(quoteId);
          void fetchAvailableQuotes();
        }

        const shipmentId = extractShipmentId(notification);
        ensureShipmentSelection(shipmentId, quoteId);
        return DEFAULT_SHIPMENT_ROUTE;
      }

      if (SHIPMENT_NOTIFICATION_TYPES.has(notification.type)) {
        const shipmentId = extractShipmentId(notification);
        if (shipmentId) {
          selectShipment(shipmentId);
          void fetchAssignedShipments();
        }
        return ensureLeadingSlash(notification.actionUrl ?? DEFAULT_SHIPMENT_ROUTE);
      }

      if (BID_NOTIFICATION_TYPES.has(notification.type)) {
        const bidId = extractBidId(notification);
        if (bidId) {
          selectBid(bidId);
          void fetchMyBids();
        }

        const quoteId = extractQuoteId(notification);
        if (quoteId) {
          selectQuote(quoteId);
          void fetchAvailableQuotes();
        }

        return ensureLeadingSlash(notification.actionUrl ?? DEFAULT_BID_ROUTE);
      }

      return ensureLeadingSlash(notification.actionUrl ?? null);
    },
    [
      ensureShipmentSelection,
      fetchAssignedShipments,
      fetchAvailableQuotes,
      fetchMyBids,
      selectBid,
      selectQuote,
      selectShipment,
    ]
  );
};

export default useNotificationNavigation;
