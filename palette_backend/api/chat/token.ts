import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../../src/utils/cors.js';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import {
  ensureParticipantInThread,
  ensurePeerThread,
  ensureThreadForQuote,
} from '../../src/services/chat/chatOrchestrator.js';
import { generateConversationsToken } from '../../src/services/twilio/tokenService.js';

interface TokenRequestBody {
  threadId?: string;
  quoteId?: string;
  organizationId?: string;
  shipmentId?: string;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
  peerShipperOrgId?: string;
  initiatorBranchOrgId?: string;
  includeGallery?: boolean;
}

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
    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userRes?.user) {
      res.status(401).json({ error: 'Invalid or expired token', details: userErr?.message });
      return;
    }

    const userId = userRes.user.id;

    const body: TokenRequestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};

    const threadId = body.threadId;
    const quoteId = body.quoteId;
    const organizationId = typeof body.organizationId === 'string' && body.organizationId.trim()
      ? body.organizationId.trim()
      : undefined;
    const shipmentId = typeof body.shipmentId === 'string' && body.shipmentId.trim()
      ? body.shipmentId.trim()
      : undefined;
    const shipperBranchOrgId =
      body.shipperBranchOrgId === undefined
        ? undefined
        : typeof body.shipperBranchOrgId === 'string' && body.shipperBranchOrgId.trim()
          ? body.shipperBranchOrgId.trim()
          : null;
    const galleryBranchOrgId =
      body.galleryBranchOrgId === undefined
        ? undefined
        : typeof body.galleryBranchOrgId === 'string' && body.galleryBranchOrgId.trim()
          ? body.galleryBranchOrgId.trim()
          : null;

    const peerShipperOrgId =
      typeof body.peerShipperOrgId === 'string' && body.peerShipperOrgId.trim()
        ? body.peerShipperOrgId.trim()
        : undefined;
    const initiatorBranchOrgId =
      typeof body.initiatorBranchOrgId === 'string' && body.initiatorBranchOrgId.trim()
        ? body.initiatorBranchOrgId.trim()
        : undefined;
    const includeGallery = body.includeGallery === true;

    if (!threadId && !quoteId && !peerShipperOrgId) {
      res.status(400).json({ error: 'Either threadId, quoteId, or peerShipperOrgId must be provided' });
      return;
    }

    let resolvedThreadId = threadId ?? null;
    let resolvedQuoteId = quoteId ?? null;

    if (!resolvedThreadId && peerShipperOrgId) {
      const initiatorOrgForPeer = initiatorBranchOrgId ?? organizationId;
      if (!initiatorOrgForPeer) {
        res.status(400).json({ error: 'organizationId is required when starting a shipper peer conversation' });
        return;
      }

      const { thread } = await ensurePeerThread({
        initiatorUserId: userId,
        initiatorShipperOrgId: initiatorOrgForPeer,
        targetShipperOrgId: peerShipperOrgId,
        quoteId: quoteId ?? null,
        shipmentId,
        includeGallery,
      });

      resolvedThreadId = thread.id;
      resolvedQuoteId = thread.quote_id ?? resolvedQuoteId;
    } else if (!resolvedThreadId && quoteId) {
      const { thread } = await ensureThreadForQuote({
        quoteId,
        initiatorUserId: userId,
        shipmentId,
        shipperBranchOrgId,
        galleryBranchOrgId,
      });
      resolvedThreadId = thread.id;
      resolvedQuoteId = thread.quote_id ?? resolvedQuoteId;
    }

    if (!resolvedThreadId) {
      res.status(404).json({ error: 'Chat thread could not be resolved' });
      return;
    }

    const participantOrganizationId = organizationId ?? initiatorBranchOrgId ?? undefined;

    const participant = await ensureParticipantInThread(resolvedThreadId, userId, {
      organizationId: participantOrganizationId,
    });

    const token = generateConversationsToken({
      identity: participant.identity,
    });

    res.status(200).json({
      token: token.token,
      expiresAt: token.expiresAt,
      ttlSeconds: token.ttlSeconds,
      conversationSid: participant.thread.twilio_conversation_sid,
      threadId: participant.thread.id,
      quoteId: participant.thread.quote_id ?? resolvedQuoteId,
      shipmentId: participant.thread.shipment_id,
      identity: participant.identity,
      role: participant.role,
      shipperBranchOrgId: participant.thread.shipper_branch_org_id,
      galleryBranchOrgId: participant.thread.gallery_branch_org_id,
      conversationType: participant.thread.conversation_type,
      initiatorShipperOrgId: participant.thread.initiator_shipper_org_id,
      peerShipperOrgIds: Array.isArray((participant.thread.metadata as any)?.peerShipperOrgIds)
        ? (participant.thread.metadata as any).peerShipperOrgIds
        : undefined,
    });
  } catch (error: any) {
    console.error('[chat/token] error', error);
    const message = error?.message || 'Internal Server Error';
    const status = message.includes('not a member') ? 403 : 500;
    res.status(status).json({ error: message });
  }
}
