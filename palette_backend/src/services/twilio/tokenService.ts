import Twilio from 'twilio';

const { AccessToken } = Twilio.jwt;
const ConversationsGrant: any = (AccessToken as any).ConversationsGrant;
const ChatGrant: any = (AccessToken as any).ChatGrant;

const GrantCtor = ConversationsGrant ?? ChatGrant;

if (!GrantCtor) {
  throw new Error('Twilio Conversations/Chat grant is not available in the current SDK version');
}

export interface TokenRequest {
  identity: string;
  ttlSeconds?: number;
}

export interface TokenResult {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const generateConversationsToken = ({
  identity,
  ttlSeconds = 45 * 60,
}: TokenRequest): TokenResult => {
  const accountSid = getRequiredEnv('TWILIO_ACCOUNT_SID');
  const apiKey = getRequiredEnv('TWILIO_API_KEY');
  const apiSecret = getRequiredEnv('TWILIO_API_SECRET');
  const serviceSid = getRequiredEnv('TWILIO_CONVERSATIONS_SERVICE_SID');

  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity,
    ttl: ttlSeconds,
  });

  const grant = new GrantCtor({ serviceSid });
  token.addGrant(grant);

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  return {
    token: token.toJwt(),
    expiresAt,
    ttlSeconds,
  };
};
