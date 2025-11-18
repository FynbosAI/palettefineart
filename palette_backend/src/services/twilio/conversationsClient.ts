import Twilio from 'twilio';

export interface ConversationAttributes {
  quoteId?: string;
  shipmentId?: string | null;
  organizationId?: string;
  initiatorUserId?: string;
  [key: string]: unknown;
}

export interface CreateConversationOptions {
  uniqueName: string;
  friendlyName?: string;
  attributes?: ConversationAttributes;
}

export interface AddParticipantOptions {
  conversationSid: string;
  identity: string;
  roleSid?: string;
}

let cachedClient: ReturnType<typeof Twilio> | null = null;

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getClient = () => {
  if (cachedClient) {
    return cachedClient;
  }

  const accountSid = getRequiredEnv('TWILIO_ACCOUNT_SID');
  const apiKey = getRequiredEnv('TWILIO_API_KEY');
  const apiSecret = getRequiredEnv('TWILIO_API_SECRET');

  cachedClient = Twilio(apiKey, apiSecret, { accountSid });
  return cachedClient;
};

const getService = () => {
  const serviceSid = getRequiredEnv('TWILIO_CONVERSATIONS_SERVICE_SID');
  return getClient().conversations.v1.services(serviceSid);
};

export const createConversation = async (options: CreateConversationOptions) => {
  const service = getService();
  const payload: Record<string, unknown> = {
    uniqueName: options.uniqueName,
    friendlyName: options.friendlyName,
  };

  if (options.attributes) {
    payload.attributes = JSON.stringify(options.attributes);
  }

  return service.conversations.create(payload);
};

export const fetchConversation = async (conversationSidOrUniqueName: string) => {
  const service = getService();
  return service.conversations(conversationSidOrUniqueName).fetch();
};

export const updateConversationAttributes = async (
  conversationSid: string,
  attributes: ConversationAttributes
) => {
  const service = getService();
  return service.conversations(conversationSid).update({
    attributes: JSON.stringify(attributes),
  });
};

export const addParticipantToConversation = async ({
  conversationSid,
  identity,
  roleSid,
}: AddParticipantOptions) => {
  const service = getService();

  try {
    return await service.conversations(conversationSid).participants.create({
      identity,
      roleSid,
    });
  } catch (error: any) {
    const alreadyExists =
      typeof error?.status === 'number' && error.status === 409;
    const duplicateParticipant =
      typeof error?.code === 'number' && error.code === 50416;

    if (alreadyExists || duplicateParticipant) {
      return null;
    }

    throw error;
  }
};

export const removeParticipantFromConversation = async (
  conversationSid: string,
  identity: string
) => {
  const service = getService();
  try {
    const participants = await service
      .conversations(conversationSid)
      .participants.list({ limit: 50 });
    const target = participants.find((p) => p.identity === identity);
    if (!target) {
      return;
    }
    await service.conversations(conversationSid).participants(target.sid).remove();
  } catch (error) {
    console.error('[twilio] Failed to remove participant', error);
  }
};
