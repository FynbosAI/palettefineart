import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../../../src/utils/cors.js';
import { validateTwilioSignature } from '../../../src/services/twilio/validateSignature.js';
import {
  getThreadByTwilioSid,
  recordMessageAudit,
  updateThreadLastMessageAt,
  updateParticipantReadState,
  markParticipantLeft,
} from '../../../src/services/chat/chatRepository.js';
import { ensureThreadForQuote } from '../../../src/services/chat/chatOrchestrator.js';
import { fetchConversation } from '../../../src/services/twilio/conversationsClient.js';

const readRawBody = (req: VercelRequest): Promise<string> => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
};

const readField = (payload: Record<string, any>, keys: string[]): any => {
  for (const key of keys) {
    if (payload[key] !== undefined) {
      return payload[key];
    }
  }
  return undefined;
};

const parseIdentity = (identity: string | null | undefined) => {
  if (!identity || typeof identity !== 'string') return { identity: '', userId: null, role: null };
  const [role, ...rest] = identity.split(':');
  if (rest.length === 0) {
    return { identity, userId: null, role };
  }
  const userId = rest.join(':');
  return { identity, userId, role };
};

const safeIso = (value: string | null | undefined) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
};

const toMediaSummary = (media: any): Record<string, unknown>[] | null => {
  if (!media) return null;
  if (Array.isArray(media)) {
    return media.map((item) => ({
      sid: item.sid ?? null,
      contentType: item.contentType ?? item.content_type ?? null,
      size: item.size ?? null,
      filename: item.filename ?? null,
    }));
  }
  return null;
};

const handleMessageAdded = async (payload: Record<string, any>) => {
  const conversationSid = readField(payload, ['conversationSid', 'ConversationSid']);
  const messageSid = readField(payload, ['messageSid', 'MessageSid']);
  if (!conversationSid || !messageSid) {
    console.warn('[chat/webhook] Missing conversation/message SID');
    return;
  }

  let thread = await getThreadByTwilioSid(conversationSid);

  const body = readField(payload, ['body', 'Body']);
  const authorIdentityRaw = readField(payload, ['author', 'Author']);
  const { identity, userId } = parseIdentity(authorIdentityRaw);

  if (!thread) {
    thread = await ensureThreadFromConversation(conversationSid, undefined, userId);
  }

  if (!thread) {
    console.warn('[chat/webhook] No thread for conversation after backfill attempt', conversationSid);
    return;
  }

  const sentAt = safeIso(readField(payload, ['dateCreated', 'messageDateCreated', 'timestamp']));
  const deliveryStatus = readField(payload, ['delivery', 'deliveryStatus', 'DeliveryStatus']);
  const mediaSummary = toMediaSummary(readField(payload, ['media', 'Media']));

  await recordMessageAudit({
    threadId: thread.id,
    messageSid,
    authorIdentity: identity || authorIdentityRaw || 'unknown',
    authorUserId: userId,
    bodyPreview: typeof body === 'string' ? body.slice(0, 500) : null,
    media: mediaSummary,
    sentAt,
    deliveryStatus: typeof deliveryStatus === 'string' ? deliveryStatus : null,
  });

  await updateThreadLastMessageAt(thread.id, sentAt);
};

const handleParticipantUpdated = async (payload: Record<string, any>) => {
  const conversationSid = readField(payload, ['conversationSid', 'ConversationSid']);
  if (!conversationSid) return;

  const thread = await getThreadByTwilioSid(conversationSid);
  if (!thread) return;

  const participantIdentity = readField(payload, ['participantIdentity', 'ParticipantIdentity']);
  const { identity } = parseIdentity(participantIdentity);
  if (!identity) return;

  const lastRead = readField(payload, ['lastReadTimestamp', 'LastReadTimestamp']);
  const lastReadIndex = readField(payload, ['lastReadMessageIndex', 'LastReadMessageIndex']);

  await updateParticipantReadState(thread.id, identity, {
    lastReadAt: lastRead ? safeIso(lastRead) : null,
    lastReadMessageIndex: typeof lastReadIndex === 'number' ? lastReadIndex : null,
  });
};

const handleParticipantRemoved = async (payload: Record<string, any>) => {
  const conversationSid = readField(payload, ['conversationSid', 'ConversationSid']);
  if (!conversationSid) return;

  const thread = await getThreadByTwilioSid(conversationSid);
  if (!thread) return;

  const participantIdentity = readField(payload, ['participantIdentity', 'ParticipantIdentity']);
  const { identity } = parseIdentity(participantIdentity);
  if (!identity) return;

  const leftAt = safeIso(readField(payload, ['timestamp', 'dateCreated', 'DateCreated']));
  await markParticipantLeft(thread.id, identity, leftAt);
};

const parseValue = (value: string): any => {
  if (!value || typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
};

const parsePayload = (rawBody: string, req: VercelRequest): Record<string, any> => {
  if (!rawBody) {
    return {};
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawBody);
    const result: Record<string, any> = {};

    for (const [key, raw] of params.entries()) {
      const parsed = parseValue(raw);

      if (result[key] === undefined) {
        result[key] = parsed;
      } else if (Array.isArray(result[key])) {
        result[key].push(parsed);
      } else {
        result[key] = [result[key], parsed];
      }
    }

    return result;
  }

  try {
    const parsed = JSON.parse(rawBody);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const parseAttributes = (attributes: unknown): Record<string, any> => {
  if (!attributes) return {};
  if (typeof attributes === 'string') {
    try {
      return JSON.parse(attributes);
    } catch {
      return {};
    }
  }
  if (typeof attributes === 'object' && !Array.isArray(attributes)) {
    return { ...(attributes as Record<string, any>) };
  }
  return {};
};

const ensureThreadFromConversation = async (
  conversationSid: string,
  fallbackQuoteId?: string,
  fallbackInitiatorId?: string | null
) => {
  try {
    const conversation = await fetchConversation(conversationSid);
    const attributes = parseAttributes(conversation?.attributes);

    const quoteId =
      attributes.quoteId ??
      attributes.quote_id ??
      fallbackQuoteId;

    if (!quoteId) {
      console.warn('[chat/webhook] Unable to infer quoteId from conversation attributes', {
        conversationSid,
        attributes,
      });
      return null;
    }

    const initiatorUserId =
      fallbackInitiatorId ??
      attributes.createdBy ??
      attributes.initiatorUserId ??
      attributes.initiator_user_id ??
      null;

    if (!initiatorUserId) {
      console.warn('[chat/webhook] Unable to determine initiator user for thread backfill', {
        conversationSid,
        quoteId,
      });
      return null;
    }

    const { thread } = await ensureThreadForQuote({
      quoteId,
      initiatorUserId,
    });

    return thread;
  } catch (error) {
    console.error('[chat/webhook] Failed to backfill thread from conversation', {
      conversationSid,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
};

const handleEvent = async (payload: Record<string, any>) => {
  const eventTypeRaw = readField(payload, ['eventType', 'EventType']);
  const eventType = typeof eventTypeRaw === 'string' ? eventTypeRaw : '';

  switch (eventType) {
    case 'onMessageAdded':
      await handleMessageAdded(payload);
      break;
    case 'onParticipantUpdated':
      await handleParticipantUpdated(payload);
      break;
    case 'onParticipantRemoved':
    case 'onParticipantLeft':
      await handleParticipantRemoved(payload);
      break;
    default:
      console.log('[chat/webhook] Unhandled event', eventType);
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const rawBody = await readRawBody(req);

    const isValid = validateTwilioSignature(req, rawBody);
    if (!isValid) {
      res.status(403).json({ error: 'Invalid Twilio signature' });
      return;
    }

    const payload = parsePayload(rawBody, req);
    await handleEvent(payload);

    res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[chat/webhook] error', error);
    res.status(500).json({ error: error?.message || 'Internal Server Error' });
  }
}
