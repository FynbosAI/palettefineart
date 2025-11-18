import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../../../../../src/utils/cors.js';
import { supabaseAdmin } from '../../../../../src/supabaseClient.js';
import { getThreadById, getParticipantRecord, markParticipantLeft } from '../../../../../src/services/chat/chatRepository.js';
import { removeParticipantFromConversation } from '../../../../../src/services/twilio/conversationsClient.js';

const ELEVATED_ROLES = ['editor', 'admin'];

const requireAuthUser = async (req: VercelRequest, res: VercelResponse) => {
  const authHeader = String(req.headers.authorization || '');
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;

  if (!accessToken) {
    res.status(401).json({ error: 'Missing Authorization bearer token' });
    return null;
  }

  const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userRes?.user) {
    res.status(401).json({ error: 'Invalid or expired token', details: userErr?.message });
    return null;
  }
  return userRes.user.id;
};

const assertRequestorPermissions = async (
  threadId: string,
  userId: string
) => {
  const thread = await getThreadById(threadId);
  if (!thread) {
    throw Object.assign(new Error('Thread not found'), { status: 404 });
  }

  const { data: membership, error } = await supabaseAdmin
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', thread.organization_id)
    .in('role', ELEVATED_ROLES)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!membership) {
    throw Object.assign(new Error('Not authorized to manage participants for this thread'), {
      status: 403,
    });
  }

  return thread;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const requesterId = await requireAuthUser(req, res);
    if (!requesterId) return;

    const threadId = req.query.threadId as string;
    const targetUserId = req.query.userId as string;

    if (!threadId || !targetUserId) {
      res.status(400).json({ error: 'threadId and userId are required' });
      return;
    }

    if (targetUserId === requesterId) {
      res.status(400).json({ error: 'Cannot remove yourself via this endpoint' });
      return;
    }

    const thread = await assertRequestorPermissions(threadId, requesterId);

    const participant = await getParticipantRecord(threadId, targetUserId);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found in thread' });
      return;
    }

    const leftAt = new Date().toISOString();
    await markParticipantLeft(threadId, participant.twilio_identity, leftAt);
    await removeParticipantFromConversation(thread.twilio_conversation_sid, participant.twilio_identity);

    res.status(200).json({ ok: true });
  } catch (error: any) {
    const status = error?.status || (error?.message?.includes('Not authorized') ? 403 : 500);
    res.status(status).json({ error: error?.message || 'Internal Server Error' });
  }
}
