import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../../../../src/utils/cors.js';
import { supabaseAdmin } from '../../../../src/supabaseClient.js';
import { ensureParticipantInThread } from '../../../../src/services/chat/chatOrchestrator.js';
import { getThreadById, getProfileByUserId } from '../../../../src/services/chat/chatRepository.js';

const ELEVATED_ROLES = ['editor', 'admin'];

interface PostBody {
  userId: string;
  organizationId?: string;
  roleOverride?: 'client' | 'shipper';
}

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

  let effectiveMembership = membership;

  if (!effectiveMembership && thread.conversation_type === 'shipper_peer') {
    const { data: shipperRows, error: shipperError } = await supabaseAdmin
      .from('chat_thread_shippers')
      .select('shipper_branch_org_id')
      .eq('thread_id', threadId);

    if (shipperError) {
      throw Object.assign(new Error(shipperError.message), { status: 500 });
    }

    const branchIds = Array.from(
      new Set((shipperRows ?? []).map((row) => row.shipper_branch_org_id))
    ).filter(Boolean) as string[];

    if (branchIds.length > 0) {
      const { data: peerMembership, error: peerError } = await supabaseAdmin
        .from('memberships')
        .select('role')
        .eq('user_id', userId)
        .in('org_id', branchIds)
        .in('role', ELEVATED_ROLES)
        .maybeSingle();

      if (peerError) {
        throw Object.assign(new Error(peerError.message), { status: 500 });
      }

      effectiveMembership = peerMembership ?? null;
    }
  }

  if (!effectiveMembership) {
    throw Object.assign(new Error('Not authorized to manage participants for this thread'), {
      status: 403,
    });
  }

  return thread;
};

const resolveTargetOrganization = async (
  body: PostBody,
  threadOrgId: string,
  targetUserId: string
) => {
  if (body.organizationId) {
    return body.organizationId;
  }

  const profile = await getProfileByUserId(targetUserId);
  if (profile?.default_org) {
    return profile.default_org;
  }

  return threadOrgId;
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
    const requesterId = await requireAuthUser(req, res);
    if (!requesterId) return;

    const threadId = req.query.threadId as string;
    if (!threadId) {
      res.status(400).json({ error: 'Missing threadId in request path' });
      return;
    }

    const thread = await assertRequestorPermissions(threadId, requesterId);

    const body: PostBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    const targetUserId = body.userId;

    if (!targetUserId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (targetUserId === requesterId) {
      res.status(400).json({ error: 'Cannot add yourself via this endpoint' });
      return;
    }

    const organizationId = await resolveTargetOrganization(body, thread.organization_id, targetUserId);

    const result = await ensureParticipantInThread(threadId, targetUserId, {
      organizationId,
      roleOverride: body.roleOverride,
    });

    res.status(200).json({
      ok: true,
      participant: {
        id: result.participant.id,
        userId: result.participant.user_id,
        organizationId: result.participant.organization_id,
        role: result.participant.role,
        identity: result.identity,
        threadId: result.thread.id,
      },
    });
  } catch (error: any) {
    const status = error?.status || (error?.message?.includes('Not authorized') ? 403 : 500);
    res.status(status).json({ error: error?.message || 'Internal Server Error' });
  }
}
