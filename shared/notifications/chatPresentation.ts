import { sanitizeString } from './utils';

export interface ChatThreadLike {
  id: string;
  shipmentId: string | null;
  quoteId: string | null;
  metadata: Record<string, unknown> | null;
  lastMessageAt: string | null;
}

export interface ChatMessageLike {
  sid: string;
  body: string | null;
  authorUserId: string | null;
  timestamp: string;
}

const getMetadata = (thread: ChatThreadLike): Record<string, unknown> => {
  return (thread.metadata ?? {}) as Record<string, unknown>;
};

export const deriveThreadLabel = (thread: ChatThreadLike): string => {
  const metadata = getMetadata(thread);

  return (
    sanitizeString((metadata.shipmentReference as string) ?? '') ||
    sanitizeString((metadata.shipmentCode as string) ?? '') ||
    sanitizeString((metadata.quoteTitle as string) ?? '') ||
    sanitizeString((metadata.partnerName as string) ?? '') ||
    (thread.shipmentId ? `Shipment ${thread.shipmentId.slice(0, 8)}` : null) ||
    'Conversation'
  );
};

export const deriveThreadSubtitle = (thread: ChatThreadLike): string | null => {
  const metadata = getMetadata(thread);

  const contact =
    sanitizeString((metadata.contactName as string) ?? '') ||
    sanitizeString((metadata.partnerContact as string) ?? '') ||
    null;
  const organization =
    sanitizeString((metadata.contactOrganization as string) ?? '') ||
    sanitizeString((metadata.partnerCompany as string) ?? '') ||
    null;

  if (!contact && !organization) {
    return null;
  }

  return [contact, organization].filter(Boolean).join(' • ');
};

export const isMessageFromSelf = (message: ChatMessageLike | null, userId: string | null): boolean => {
  if (!message) return false;
  if (!message.authorUserId || !userId) return false;
  return message.authorUserId === userId;
};

export const getLatestMessage = <T extends ChatMessageLike>(messages: T[] | undefined | null): T | null => {
  if (!messages || messages.length === 0) {
    return null;
  }
  return messages[messages.length - 1] ?? null;
};
